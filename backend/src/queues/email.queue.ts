import { Queue } from 'bullmq';
import { env } from '../config/env.js';
import { redisConnection } from '../config/redis.js';
import type { EmailJobData } from '../types/email-job.js';
import { logger } from '../utils/logger.js';

export const EMAIL_QUEUE_NAME = 'email-scheduler';
export const EMAIL_JOB_NAME = 'send-email';

export function buildEmailJobId(emailId: string): string {
  // BullMQ rejects ":" in custom job IDs; keep a deterministic, unique prefix.
  return `email-${emailId}`;
}

let emailQueue: Queue<EmailJobData> | null = null;

export function getEmailQueue(): Queue<EmailJobData> {
  if (!emailQueue) {
    emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 500,
        attempts: env.EMAIL_JOB_ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: env.EMAIL_JOB_BACKOFF_MS,
        },
      },
    });

    emailQueue.on('error', (error) => {
      logger.error('Email queue error', { error: error.message });
    });
  }

  return emailQueue;
}

export async function closeEmailQueue(): Promise<void> {
  if (emailQueue) {
    await emailQueue.close();
    emailQueue = null;
  }
}
