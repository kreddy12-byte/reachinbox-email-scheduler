import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { sanitizeSmtpError, sendEmail } from './email.service.js';
import { checkAndReserveSend } from './rate-limit.service.js';
import { reserveSendSlot } from './send-throttle.service.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/time.js';

let pollTimer: NodeJS.Timeout | null = null;
let ticking = false;

async function processEmail(emailId: string): Promise<void> {
  const existing = await prisma.email.findUnique({ where: { id: emailId } });

  if (!existing) {
    return;
  }

  if (
    existing.status === EmailStatus.SENT ||
    existing.status === EmailStatus.FAILED ||
    existing.status === EmailStatus.PROCESSING
  ) {
    return;
  }

  const claimed = await prisma.email.updateMany({
    where: { id: emailId, status: EmailStatus.SCHEDULED },
    data: {
      status: EmailStatus.PROCESSING,
      errorMessage: null,
    },
  });

  if (claimed.count === 0) {
    return;
  }

  const email = await prisma.email.findUniqueOrThrow({ where: { id: emailId } });
  const sendDelayMs = email.sendDelayMs;
  const hourlyLimit = email.hourlyLimit;

  const rateLimit = await checkAndReserveSend(email.senderId, hourlyLimit, {
    emailId: email.id,
    userId: email.userId,
  });

  if (!rateLimit.allowed) {
    const retryAt = rateLimit.retryAt ?? new Date(Date.now() + 60 * 60 * 1000);

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: EmailStatus.SCHEDULED,
        scheduledAt: retryAt,
        errorMessage: null,
      },
    });

    logger.info('Rescheduling email due to hourly rate limit', {
      emailId,
      senderId: email.senderId,
      rescheduledAt: retryAt.toISOString(),
      rateLimit: hourlyLimit,
    });
    return;
  }

  const slot = await reserveSendSlot(email.senderId, sendDelayMs, {
    emailId: email.id,
  });

  const waitMs = slot.allowedAt.getTime() - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  await prisma.email.update({
    where: { id: emailId },
    data: { attempts: { increment: 1 } },
  });

  const refreshed = await prisma.email.findUniqueOrThrow({
    where: { id: emailId },
  });
  const attemptNumber = refreshed.attempts;
  const maxAttempts = env.EMAIL_JOB_ATTEMPTS;

  try {
    const result = await sendEmail(emailId);

    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        errorMessage: null,
      },
    });

    logger.info('Email sent successfully', {
      emailId: result.emailId,
      senderId: email.senderId,
      recipient: result.recipient,
      messageId: result.messageId,
      previewUrl: result.previewUrl || undefined,
      attemptNumber,
      status: EmailStatus.SENT,
    });
  } catch (error) {
    const sanitized = sanitizeSmtpError(error);
    const isLastAttempt = attemptNumber >= maxAttempts;

    if (isLastAttempt) {
      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: EmailStatus.FAILED,
          errorMessage: sanitized,
        },
      });

      logger.error('Email permanently FAILED after retries', {
        emailId,
        attemptNumber,
        maxAttempts,
        error: sanitized,
      });
      return;
    }

    // Retry soon via poller
    await prisma.email.update({
      where: { id: emailId },
      data: {
        status: EmailStatus.SCHEDULED,
        scheduledAt: new Date(Date.now() + 5_000),
        errorMessage: sanitized,
      },
    });

    logger.warn('Email send failed; will retry', {
      emailId,
      attemptNumber,
      maxAttempts,
      error: sanitized,
    });
  }
}

async function tick(): Promise<void> {
  if (ticking) {
    return;
  }
  ticking = true;

  try {
    const due = await prisma.email.findMany({
      where: {
        status: EmailStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      take: env.EMAIL_POLL_BATCH_SIZE,
      select: { id: true },
    });

    for (const row of due) {
      await processEmail(row.id);
    }
  } catch (error) {
    logger.error('Email poller tick failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    ticking = false;
  }
}

export function startEmailPoller(): void {
  if (pollTimer) {
    return;
  }

  logger.info('Starting in-process email poller', {
    intervalMs: env.EMAIL_POLL_INTERVAL_MS,
    batchSize: env.EMAIL_POLL_BATCH_SIZE,
  });

  void tick();
  pollTimer = setInterval(() => {
    void tick();
  }, env.EMAIL_POLL_INTERVAL_MS);

  // Allow process to exit on SIGTERM without waiting for the interval alone.
  if (typeof pollTimer.unref === 'function') {
    pollTimer.unref();
  }
}

export function stopEmailPoller(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
