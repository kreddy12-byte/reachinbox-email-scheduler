import { DelayedError, Worker } from 'bullmq';
import { EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { closeRedisClient } from '../config/redis-client.js';
import { redisConnection } from '../config/redis.js';
import { prisma } from '../db/prisma.js';
import { safeSyncEmailById } from '../elasticsearch/email-search.service.js';
import { EMAIL_QUEUE_NAME } from '../queues/email.queue.js';
import { sanitizeSmtpError, sendEmail } from '../services/email.service.js';
import { checkAndReserveSend } from '../services/rate-limit.service.js';
import { reserveSendSlot } from '../services/send-throttle.service.js';
import type { EmailJobData } from '../types/email-job.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/time.js';

/**
 * Idempotent email worker with Redis-backed hourly limits and min-delay slots.
 *
 * Flow:
 * 1. Idempotency checks
 * 2. Claim SCHEDULED → PROCESSING
 * 3. Reserve hourly rate-limit slot (atomic Lua)
 * 4. If denied: revert to SCHEDULED, update scheduledAt, moveToDelayed (same job ID)
 * 5. Reserve min-delay send slot (atomic Lua)
 * 6. Wait until allowedAt
 * 7. Send via Ethereal → SENT
 *
 * Ordering: earlier scheduledAt / earlier Redis slot reservation are preferred.
 * Strict global order across distributed workers is not guaranteed.
 *
 * Limitation (external SMTP atomicity): exactly-once delivery cannot be guaranteed.
 */
const worker = new Worker<EmailJobData>(
  EMAIL_QUEUE_NAME,
  async (job, token) => {
    const { emailId } = job.data;

    if (!emailId) {
      throw new Error('Invalid job: emailId is required');
    }

    const existing = await prisma.email.findUnique({ where: { id: emailId } });

    if (!existing) {
      throw new Error(`Email not found for job: ${emailId}`);
    }

    if (existing.status === EmailStatus.SENT) {
      logger.info('Email already SENT; skipping duplicate send', {
        jobId: job.id,
        emailId,
      });
      return;
    }

    if (existing.status === EmailStatus.FAILED) {
      logger.warn('Email already FAILED; skipping', { jobId: job.id, emailId });
      return;
    }

    if (existing.status === EmailStatus.PROCESSING) {
      logger.warn('Email already PROCESSING; skipping duplicate send', {
        jobId: job.id,
        emailId,
      });
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
      const current = await prisma.email.findUnique({ where: { id: emailId } });

      if (current?.status === EmailStatus.SENT) {
        logger.info('Email claimed by another worker and already SENT', {
          emailId,
        });
        return;
      }

      logger.warn('Failed to claim email for sending', {
        emailId,
        status: current?.status,
      });
      return;
    }

    await safeSyncEmailById(emailId);

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

      await safeSyncEmailById(emailId);

      const delayMs = Math.max(0, retryAt.getTime() - Date.now());

      logger.info('Rescheduling email due to hourly rate limit', {
        emailId,
        senderId: email.senderId,
        scheduledAt: email.scheduledAt.toISOString(),
        rescheduledAt: retryAt.toISOString(),
        rateLimit: hourlyLimit,
        rateLimitRemaining: rateLimit.remaining,
        bullJobId: job.id,
        status: EmailStatus.SCHEDULED,
      });

      // Same deterministic job ID — move current job into delayed state.
      await job.moveToDelayed(Date.now() + delayMs, token);
      throw new DelayedError();
    }

    const slot = await reserveSendSlot(email.senderId, sendDelayMs, {
      emailId: email.id,
    });

    const waitMs = slot.allowedAt.getTime() - Date.now();
    if (waitMs > 0) {
      logger.info('Waiting for reserved send slot', {
        emailId,
        senderId: email.senderId,
        sendSlot: slot.allowedAt.toISOString(),
        waitMs,
      });
      await sleep(waitMs);
    }

    await prisma.email.update({
      where: { id: emailId },
      data: { attempts: { increment: 1 } },
    });

    const maxAttempts = job.opts.attempts ?? env.EMAIL_JOB_ATTEMPTS;
    const attemptNumber = job.attemptsMade + 1;

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

      await safeSyncEmailById(emailId);

      logger.info('Email sent successfully', {
        emailId: result.emailId,
        senderId: email.senderId,
        recipient: result.recipient,
        messageId: result.messageId,
        previewUrl: result.previewUrl || undefined,
        attemptNumber,
        rateLimit: hourlyLimit,
        rateLimitRemaining: rateLimit.remaining,
        sendSlot: slot.allowedAt.toISOString(),
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

        await safeSyncEmailById(emailId);

        logger.error('Email permanently FAILED after retries', {
          emailId,
          senderId: email.senderId,
          attemptNumber,
          maxAttempts,
          error: sanitized,
          status: EmailStatus.FAILED,
        });
        return;
      }

      await prisma.email.update({
        where: { id: emailId },
        data: {
          status: EmailStatus.SCHEDULED,
          errorMessage: sanitized,
        },
      });

      await safeSyncEmailById(emailId);

      logger.warn('Email send failed; will retry', {
        emailId,
        senderId: email.senderId,
        attemptNumber,
        maxAttempts,
        error: sanitized,
        status: EmailStatus.SCHEDULED,
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: env.WORKER_CONCURRENCY,
  },
);

worker.on('ready', () => {
  logger.info('Email worker ready', {
    queue: EMAIL_QUEUE_NAME,
    concurrency: env.WORKER_CONCURRENCY,
  });
});

worker.on('completed', (job) => {
  logger.info('Email job completed', {
    jobId: job.id,
    emailId: job.data.emailId,
  });
});

worker.on('failed', (job, error) => {
  // DelayedError is an expected control-flow signal for rate-limit reschedule.
  if (error.message === 'DelayedError' || error.name === 'DelayedError') {
    return;
  }

  logger.error('Email job failed', {
    jobId: job?.id,
    emailId: job?.data?.emailId,
    attemptsMade: job?.attemptsMade,
    error: sanitizeSmtpError(error),
  });
});

worker.on('error', (error) => {
  logger.error('Email worker error', { error: sanitizeSmtpError(error) });
});

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutting down email worker', { signal });
  await worker.close();
  await closeRedisClient();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

logger.info('Starting email worker', {
  redisHost: env.REDIS_HOST,
  redisPort: env.REDIS_PORT,
  concurrency: env.WORKER_CONCURRENCY,
  etherealHost: env.ETHEREAL_HOST,
  defaultSendDelayMs: env.EMAIL_MIN_DELAY_MS,
  defaultHourlyLimit: env.MAX_EMAILS_PER_HOUR,
});
