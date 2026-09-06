import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export interface ScheduleResult {
  emailId: string;
  scheduledAt: Date;
  alreadyScheduled: boolean;
}

/**
 * Mark / verify an email is ready for the in-process poller.
 * No external queue — due rows are picked up by scheduledAt.
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

  logger.info('Email ready for poller', {
    emailId: email.id,
    scheduledAt: email.scheduledAt.toISOString(),
    sendDelayMs: email.sendDelayMs,
    hourlyLimit: email.hourlyLimit,
  });

  return {
    emailId: email.id,
    scheduledAt: email.scheduledAt,
    alreadyScheduled: true,
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
 * Persist SCHEDULED emails; the API poller sends them when due.
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

  return created.map((email) => ({
    emailId: email.id,
    scheduledAt: email.scheduledAt,
    alreadyScheduled: false,
  }));
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
