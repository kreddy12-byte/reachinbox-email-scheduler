import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { safeIndexEmail } from '../elasticsearch/email-search.service.js';
import {
  buildEmailJobId,
  EMAIL_JOB_NAME,
  getEmailQueue,
} from '../queues/email.queue.js';
import type { EmailJobData } from '../types/email-job.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ScheduleResult {
  emailId: string;
  bullJobId: string;
  scheduledAt: Date;
  alreadyScheduled: boolean;
}

function isDuplicateJobError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('job') &&
    (message.includes('exists') || message.includes('duplicate'))
  );
}

/**
 * Schedule a single email as a BullMQ delayed job.
 * Idempotent: reuses existing bullJobId / deterministic job ID.
 */
export async function scheduleEmail(emailId: string): Promise<ScheduleResult> {
  const email = await prisma.email.findUnique({ where: { id: emailId } });

  if (!email) {
    throw new AppError(`Email not found: ${emailId}`, 404);
  }

  if (email.status !== EmailStatus.SCHEDULED) {
    throw new AppError(
      `Email ${emailId} cannot be scheduled because status is ${email.status}`,
      400,
    );
  }

  if (email.bullJobId) {
    logger.info('Email already has bullJobId; skipping job creation', {
      emailId,
      bullJobId: email.bullJobId,
    });

    return {
      emailId: email.id,
      bullJobId: email.bullJobId,
      scheduledAt: email.scheduledAt,
      alreadyScheduled: true,
    };
  }

  const delayMs = email.scheduledAt.getTime() - Date.now();

  if (delayMs < 0) {
    throw new AppError(
      `Email ${emailId} has a scheduledAt in the past and cannot be queued`,
      400,
    );
  }

  const bullJobId = buildEmailJobId(email.id);
  const jobData: EmailJobData = {
    emailId: email.id,
    userId: email.userId,
    senderId: email.senderId,
  };

  const queue = getEmailQueue();

  try {
    await queue.add(EMAIL_JOB_NAME, jobData, {
      jobId: bullJobId,
      delay: delayMs,
    });
  } catch (error) {
    if (!isDuplicateJobError(error)) {
      logger.error('Failed to enqueue email job', {
        emailId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    logger.warn('BullMQ job already existed; syncing bullJobId', {
      emailId,
      bullJobId,
    });
  }

  const updated = await prisma.email.updateMany({
    where: { id: email.id, bullJobId: null },
    data: { bullJobId },
  });

  if (updated.count === 0) {
    const current = await prisma.email.findUnique({ where: { id: email.id } });

    if (!current?.bullJobId) {
      await prisma.email.update({
        where: { id: email.id },
        data: { bullJobId },
      });
    }

    const synced = await prisma.email.findUniqueOrThrow({ where: { id: email.id } });

    return {
      emailId: synced.id,
      bullJobId: synced.bullJobId!,
      scheduledAt: synced.scheduledAt,
      alreadyScheduled: true,
    };
  }

  logger.info('Scheduled email job', {
    emailId: email.id,
    bullJobId,
    delayMs,
    scheduledAt: email.scheduledAt.toISOString(),
    sendDelayMs: email.sendDelayMs,
    hourlyLimit: email.hourlyLimit,
  });

  return {
    emailId: email.id,
    bullJobId,
    scheduledAt: email.scheduledAt,
    alreadyScheduled: false,
  };
}

export async function scheduleEmails(
  emailIds: string[],
): Promise<ScheduleResult[]> {
  const results: ScheduleResult[] = [];

  for (const emailId of emailIds) {
    results.push(await scheduleEmail(emailId));
  }

  return results;
}

export interface CreateAndScheduleInput {
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
  sendDelayMs: number;
  hourlyLimit: number;
}

/**
 * Create SCHEDULED email rows then enqueue delayed BullMQ jobs.
 * Inserts in array order so equal scheduledAt values keep creation order.
 */
export async function createAndScheduleEmails(
  inputs: CreateAndScheduleInput[],
): Promise<ScheduleResult[]> {
  const created = await prisma.$transaction(
    inputs.map((input) =>
      prisma.email.create({
        data: {
          userId: input.userId,
          senderId: input.senderId,
          recipient: input.recipient,
          subject: input.subject,
          body: input.body,
          scheduledAt: input.scheduledAt,
          sendDelayMs: input.sendDelayMs,
          hourlyLimit: input.hourlyLimit,
          status: EmailStatus.SCHEDULED,
        },
      }),
    ),
  );

  const results = await scheduleEmails(created.map((email) => email.id));

  // Elasticsearch is best-effort; PostgreSQL + BullMQ already succeeded.
  for (const email of created) {
    const fresh = await prisma.email.findUnique({ where: { id: email.id } });
    if (fresh) {
      await safeIndexEmail(fresh);
    }
  }

  return results;
}

export function resolveScheduleDefaults(input: {
  sendDelayMs?: number;
  hourlyLimit?: number;
}): { sendDelayMs: number; hourlyLimit: number } {
  return {
    sendDelayMs: input.sendDelayMs ?? env.EMAIL_MIN_DELAY_MS,
    hourlyLimit: input.hourlyLimit ?? env.MAX_EMAILS_PER_HOUR,
  };
}
