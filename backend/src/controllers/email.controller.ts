import type { Request, Response } from 'express';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import {
  createAndScheduleEmails,
  resolveScheduleDefaults,
} from '../services/email-scheduler.service.js';
import { searchEmails } from '../services/email-search.service.js';
import {
  findOwnedSender,
  getOrCreateDefaultSender,
} from '../services/sender.service.js';
import { AppError } from '../utils/errors.js';

interface ScheduleEmailInput {
  senderId?: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sendDelayMs?: number;
  hourlyLimit?: number;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseOptionalNonNegativeInt(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new AppError(`${field} must be an integer >= 0`, 400);
  }

  return value;
}

function parseOptionalPositiveInt(
  value: unknown,
  field: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new AppError(`${field} must be an integer > 0`, 400);
  }

  return value;
}

function parseSchedulePayload(body: unknown): ScheduleEmailInput[] {
  if (!body || typeof body !== 'object') {
    throw new AppError('Request body must be a JSON object', 400);
  }

  const emails = (body as { emails?: unknown }).emails;

  if (!Array.isArray(emails) || emails.length === 0) {
    throw new AppError('emails must be a non-empty array', 400);
  }

  return emails.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new AppError(`emails[${index}] must be an object`, 400);
    }

    const record = item as Record<string, unknown>;

    if (!isNonEmptyString(record.recipient)) {
      throw new AppError(`emails[${index}].recipient is required`, 400);
    }

    if (!isNonEmptyString(record.subject)) {
      throw new AppError(`emails[${index}].subject is required`, 400);
    }

    if (!isNonEmptyString(record.body)) {
      throw new AppError(`emails[${index}].body is required`, 400);
    }

    if (!isNonEmptyString(record.scheduledAt)) {
      throw new AppError(`emails[${index}].scheduledAt is required`, 400);
    }

    const scheduledAt = new Date(record.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new AppError(
        `emails[${index}].scheduledAt must be a valid ISO date string`,
        400,
      );
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError(
        `emails[${index}].scheduledAt must be in the future`,
        400,
      );
    }

    if (record.senderId !== undefined && !isNonEmptyString(record.senderId)) {
      throw new AppError(`emails[${index}].senderId must be a string`, 400);
    }

    const sendDelayMs = parseOptionalNonNegativeInt(
      record.sendDelayMs,
      `emails[${index}].sendDelayMs`,
    );
    const hourlyLimit = parseOptionalPositiveInt(
      record.hourlyLimit,
      `emails[${index}].hourlyLimit`,
    );

    return {
      senderId: typeof record.senderId === 'string' ? record.senderId : undefined,
      recipient: record.recipient.trim(),
      subject: record.subject.trim(),
      body: record.body,
      scheduledAt: record.scheduledAt,
      sendDelayMs,
      hourlyLimit,
    };
  });
}

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }
  return req.user;
}

export async function scheduleEmailsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  const payload = parseSchedulePayload(req.body);
  const defaultSender = await getOrCreateDefaultSender(user.id);
  const inputs = [];

  for (const [index, item] of payload.entries()) {
    let senderId = defaultSender.id;

    if (item.senderId) {
      const sender = await findOwnedSender(user.id, item.senderId);
      if (!sender) {
        throw new AppError(
          `emails[${index}].senderId does not belong to the authenticated user`,
          403,
        );
      }
      senderId = sender.id;
    }

    const defaults = resolveScheduleDefaults({
      sendDelayMs: item.sendDelayMs,
      hourlyLimit: item.hourlyLimit,
    });

    inputs.push({
      userId: user.id,
      senderId,
      recipient: item.recipient,
      subject: item.subject,
      body: item.body,
      scheduledAt: new Date(item.scheduledAt),
      sendDelayMs: defaults.sendDelayMs,
      hourlyLimit: defaults.hourlyLimit,
    });
  }

  const scheduled = await createAndScheduleEmails(inputs);

  res.status(201).json({
    success: true,
    data: {
      defaults: {
        sendDelayMs: env.EMAIL_MIN_DELAY_MS,
        hourlyLimit: env.MAX_EMAILS_PER_HOUR,
      },
      scheduled: scheduled.map((item) => ({
        emailId: item.emailId,
        scheduledAt: item.scheduledAt.toISOString(),
      })),
    },
  });
}

export async function getScheduledEmailsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);

  const emails = await prisma.email.findMany({
    where: {
      userId: user.id,
      status: EmailStatus.SCHEDULED,
    },
    orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      recipient: true,
      subject: true,
      scheduledAt: true,
      status: true,
      sendDelayMs: true,
      hourlyLimit: true,
      createdAt: true,
      sender: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    data: {
      emails: emails.map((email) => ({
        id: email.id,
        recipient: email.recipient,
        subject: email.subject,
        scheduledAt: email.scheduledAt.toISOString(),
        status: email.status,
        sendDelayMs: email.sendDelayMs,
        hourlyLimit: email.hourlyLimit,
        createdAt: email.createdAt.toISOString(),
        sender: email.sender,
      })),
    },
  });
}

export async function getSentEmailsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);

  const emails = await prisma.email.findMany({
    where: {
      userId: user.id,
      status: { in: [EmailStatus.SENT, EmailStatus.FAILED] },
    },
    orderBy: { sentAt: 'desc' },
    select: {
      id: true,
      recipient: true,
      subject: true,
      sentAt: true,
      status: true,
      createdAt: true,
      sender: {
        select: {
          id: true,
          email: true,
          displayName: true,
        },
      },
    },
  });

  res.status(200).json({
    success: true,
    data: {
      emails: emails.map((email) => ({
        id: email.id,
        recipient: email.recipient,
        subject: email.subject,
        sentAt: email.sentAt?.toISOString() ?? null,
        status: email.status,
        createdAt: email.createdAt.toISOString(),
        sender: email.sender,
      })),
    },
  });
}

const EMAIL_STATUSES = new Set<string>(Object.values(EmailStatus));

export async function searchEmailsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);

  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const statusRaw =
    typeof req.query.status === 'string' ? req.query.status : undefined;

  let status: EmailStatus | undefined;
  if (statusRaw) {
    if (!EMAIL_STATUSES.has(statusRaw)) {
      throw new AppError(
        `status must be one of: ${Object.values(EmailStatus).join(', ')}`,
        400,
      );
    }
    status = statusRaw as EmailStatus;
  }

  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  if (!Number.isInteger(page) || page < 1) {
    throw new AppError('page must be an integer >= 1', 400);
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError('limit must be an integer between 1 and 100', 400);
  }

  // userId always comes from the session — never from the client.
  const result = await searchEmails(user.id, q, { status, page, limit });

  res.status(200).json({
    success: true,
    data: {
      items: result.items.map((item) => ({
        id: item.id,
        recipient: item.recipient,
        subject: item.subject,
        body: item.body,
        status: item.status,
        scheduledAt: item.scheduledAt,
        sentAt: item.sentAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })),
      pagination: result.pagination,
    },
  });
}
