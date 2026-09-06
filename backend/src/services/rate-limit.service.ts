import { EmailStatus } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { notifyHourlyLimitReached } from '../slack/slack-notification.service.js';
import { logger } from '../utils/logger.js';
import { formatUtcHourKey, startOfNextUtcHour } from '../utils/time.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  current: number;
  limit: number;
  retryAt?: Date;
  windowKey: string;
}

function utcHourBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      0,
      0,
      0,
    ),
  );
  const end = startOfNextUtcHour(now);
  return { start, end };
}

/**
 * Postgres hourly limit: count SENT (by sentAt) + other PROCESSING rows this UTC hour.
 * `excludeEmailId` is the email currently being processed (already claimed).
 */
export async function checkAndReserveSend(
  senderId: string,
  hourlyLimit: number,
  options?: { emailId?: string; userId?: string },
): Promise<RateLimitResult> {
  if (!Number.isFinite(hourlyLimit) || hourlyLimit <= 0) {
    throw new Error(`hourlyLimit must be > 0 (got ${hourlyLimit})`);
  }

  const now = new Date();
  const retryAt = startOfNextUtcHour(now);
  const { start, end } = utcHourBounds(now);
  const windowKey = `email-rate:${senderId}:${formatUtcHourKey(now)}`;

  const current = await prisma.email.count({
    where: {
      senderId,
      ...(options?.emailId ? { id: { not: options.emailId } } : {}),
      OR: [
        {
          status: EmailStatus.SENT,
          sentAt: { gte: start, lt: end },
        },
        {
          status: EmailStatus.PROCESSING,
          updatedAt: { gte: start },
        },
      ],
    },
  });

  const allowed = current < hourlyLimit;
  const remaining = Math.max(0, hourlyLimit - current - (allowed ? 1 : 0));

  const result: RateLimitResult = {
    allowed,
    remaining,
    current: allowed ? current + 1 : current,
    limit: hourlyLimit,
    windowKey,
    ...(allowed ? {} : { retryAt }),
  };

  if (!allowed) {
    void notifyHourlyLimitReached({
      senderId,
      userId: options?.userId,
      emailId: options?.emailId,
      hourlyLimit,
      retryAt,
      current,
    }).catch((error: unknown) => {
      logger.error('Unexpected Slack notify rejection', {
        senderId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    logger.info('Hourly rate limit reached; send denied', {
      senderId,
      emailId: options?.emailId,
      rateLimit: hourlyLimit,
      rateLimitRemaining: remaining,
      current,
      rescheduledAt: retryAt.toISOString(),
      windowKey,
    });
  } else {
    logger.info('Hourly rate limit reserved', {
      senderId,
      emailId: options?.emailId,
      rateLimit: hourlyLimit,
      rateLimitRemaining: remaining,
      current: result.current,
      windowKey,
    });
  }

  return result;
}

export async function getHourlySendCount(senderId: string): Promise<number> {
  const now = new Date();
  const { start, end } = utcHourBounds(now);
  return prisma.email.count({
    where: {
      senderId,
      OR: [
        {
          status: EmailStatus.SENT,
          sentAt: { gte: start, lt: end },
        },
        {
          status: EmailStatus.PROCESSING,
          updatedAt: { gte: start },
        },
      ],
    },
  });
}
