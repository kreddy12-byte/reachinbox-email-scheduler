import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import {
  getConfiguredSlackChannelId,
  postSlackMessage,
  tryAcquireSlackRateLimitNotifyLock,
} from './slack.service.js';

export interface HourlyLimitReachedPayload {
  senderId: string;
  /** Optional hint from Email.userId; ownership is resolved via Sender.userId. */
  userId?: string;
  emailId?: string;
  hourlyLimit: number;
  retryAt: Date;
  current: number;
}

/**
 * Best-effort Slack notification when a sender hits the hourly limit.
 * Resolves SlackConnection through Sender → User (never via session).
 * Never throws to callers — email scheduling must continue.
 */
export async function notifyHourlyLimitReached(
  payload: HourlyLimitReachedPayload,
): Promise<void> {
  try {
    const sender = await prisma.sender.findUnique({
      where: { id: payload.senderId },
      select: { id: true, email: true, userId: true },
    });

    if (!sender) {
      logger.info('Slack notification skipped: sender not found', {
        senderId: payload.senderId,
        emailId: payload.emailId,
      });
      return;
    }

    const userId = sender.userId;

    if (payload.userId && payload.userId !== userId) {
      logger.warn('Slack notify userId mismatch; using Sender.userId', {
        senderId: payload.senderId,
        emailUserId: payload.userId,
        senderUserId: userId,
        emailId: payload.emailId,
      });
    }

    const connection = await prisma.slackConnection.findUnique({
      where: { userId },
      select: {
        accessToken: true,
        channelId: true,
        teamId: true,
      },
    });

    const connectionFound = connection !== null;
    const tokenConfigured = !!(
      connection?.accessToken && connection.accessToken.trim()
    );

    let channelId = connection?.channelId?.trim() || null;
    if (!channelId) {
      const envChannelId = getConfiguredSlackChannelId();
      if (envChannelId && connectionFound) {
        await prisma.slackConnection.update({
          where: { userId },
          data: { channelId: envChannelId },
        });
        channelId = envChannelId;
      }
    }

    const channelConfigured = !!channelId;

    logger.info('Slack rate-limit notify lookup', {
      senderId: payload.senderId,
      userId,
      emailId: payload.emailId,
      connectionFound,
      channelConfigured,
      tokenConfigured,
    });

    if (!connectionFound) {
      logger.info('Slack notification skipped: user has no Slack connection', {
        userId,
        senderId: payload.senderId,
        connectionFound: false,
        channelConfigured: false,
        tokenConfigured: false,
      });
      return;
    }

    if (!channelConfigured) {
      logger.info('Slack notification skipped: no channelId configured', {
        userId,
        senderId: payload.senderId,
        connectionFound: true,
        channelConfigured: false,
        tokenConfigured,
      });
      return;
    }

    if (!tokenConfigured) {
      logger.info('Slack notification skipped: access token missing', {
        userId,
        senderId: payload.senderId,
        connectionFound: true,
        channelConfigured: true,
        tokenConfigured: false,
      });
      return;
    }

    const acquired = await tryAcquireSlackRateLimitNotifyLock(payload.senderId);
    if (!acquired) {
      logger.info('Slack rate-limit notification already sent this hour', {
        senderId: payload.senderId,
        userId,
      });
      return;
    }

    const senderEmail = sender.email;
    const text = [
      '*ReachInbox rate limit reached*',
      '',
      `Sender: ${senderEmail}`,
      `Hourly limit: ${payload.hourlyLimit}`,
      '',
      'The hourly sending limit has been reached. Remaining scheduled emails for this sender have been rescheduled to the next UTC hour.',
    ].join('\n');

    await postSlackMessage({
      accessToken: connection!.accessToken,
      channelId: channelId!,
      text,
    });

    logger.info('Slack rate-limit notification sent', {
      userId,
      senderId: payload.senderId,
      hourlyLimit: payload.hourlyLimit,
      retryAt: payload.retryAt.toISOString(),
      connectionFound: true,
      channelConfigured: true,
      tokenConfigured: true,
    });
  } catch (error) {
    logger.error('Slack rate-limit notification failed', {
      senderId: payload.senderId,
      userId: payload.userId,
      error: error instanceof Error ? error.message || error.name : String(error),
    });
  }
}
