import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { getRedisClient } from '../config/redis-client.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { formatUtcHourKey, secondsUntil, startOfNextUtcHour } from '../utils/time.js';

const SLACK_AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const SLACK_OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_POST_MESSAGE_URL = 'https://slack.com/api/chat.postMessage';
const OAUTH_STATE_TTL_SECONDS = 600;

export interface SlackStatus {
  connected: boolean;
  teamId?: string;
  teamName?: string | null;
  channelId?: string | null;
}

interface SlackOAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  scope?: string;
  team?: { id?: string; name?: string };
  bot_user_id?: string;
}

interface SlackPostMessageResponse {
  ok: boolean;
  error?: string;
}

function assertSlackConfigured(): void {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new Error('Slack OAuth is not configured');
  }
}

export function buildSlackAuthorizationUrl(state: string): string {
  assertSlackConfigured();

  const params = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    scope: 'chat:write',
    redirect_uri: env.SLACK_REDIRECT_URI,
    state,
  });

  return `${SLACK_AUTHORIZE_URL}?${params.toString()}`;
}

export async function createSlackOAuthState(userId: string): Promise<string> {
  const state = randomBytes(32).toString('hex');
  const redis = getRedisClient();
  await redis.set(
    `slack-oauth-state:${state}`,
    userId,
    'EX',
    OAUTH_STATE_TTL_SECONDS,
  );
  return state;
}

export async function consumeSlackOAuthState(
  state: string,
): Promise<string | null> {
  const redis = getRedisClient();
  const key = `slack-oauth-state:${state}`;
  const userId = await redis.get(key);
  if (!userId) {
    return null;
  }
  await redis.del(key);
  return userId;
}

export async function exchangeSlackOAuthCode(
  code: string,
): Promise<{ accessToken: string; teamId: string; teamName: string | null }> {
  assertSlackConfigured();

  const body = new URLSearchParams({
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    code,
    redirect_uri: env.SLACK_REDIRECT_URI,
  });

  const response = await fetch(SLACK_OAUTH_ACCESS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = (await response.json()) as SlackOAuthAccessResponse;

  if (!payload.ok || !payload.access_token || !payload.team?.id) {
    logger.error('Slack OAuth token exchange failed', {
      error: payload.error ?? 'unknown_error',
    });
    throw new Error('Slack OAuth token exchange failed');
  }

  return {
    accessToken: payload.access_token,
    teamId: payload.team.id,
    teamName: payload.team.name ?? null,
  };
}

/** Trimmed SLACK_CHANNEL_ID from env, or null when unset/blank. Never log the value. */
export function getConfiguredSlackChannelId(): string | null {
  const trimmed = env.SLACK_CHANNEL_ID.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function saveSlackConnection(input: {
  userId: string;
  accessToken: string;
  teamId: string;
  teamName: string | null;
}): Promise<void> {
  const channelId = getConfiguredSlackChannelId();
  logger.info('Saving Slack connection', {
    userId: input.userId,
    teamId: input.teamId,
    channelConfigured: channelId !== null,
  });

  await prisma.slackConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      accessToken: input.accessToken,
      teamId: input.teamId,
      teamName: input.teamName,
      channelId,
    },
    update: {
      accessToken: input.accessToken,
      teamId: input.teamId,
      teamName: input.teamName,
      channelId,
    },
  });
}

export async function getSlackStatus(userId: string): Promise<SlackStatus> {
  const connection = await prisma.slackConnection.findUnique({
    where: { userId },
    select: {
      teamId: true,
      teamName: true,
      channelId: true,
    },
  });

  if (!connection) {
    return { connected: false };
  }

  let channelId = connection.channelId?.trim() || null;
  const envChannelId = getConfiguredSlackChannelId();

  // Backfill when env was set after OAuth (or was empty at connect time).
  if (!channelId && envChannelId) {
    await prisma.slackConnection.update({
      where: { userId },
      data: { channelId: envChannelId },
    });
    channelId = envChannelId;
    logger.info('Backfilled Slack channelId from environment', {
      userId,
      channelConfigured: true,
    });
  }

  return {
    connected: true,
    teamId: connection.teamId,
    teamName: connection.teamName,
    channelId,
  };
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.deleteMany({ where: { userId } });
}

export async function postSlackMessage(input: {
  accessToken: string;
  channelId: string;
  text: string;
}): Promise<void> {
  const response = await fetch(SLACK_POST_MESSAGE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel: input.channelId,
      text: input.text,
    }),
  });

  const payload = (await response.json()) as SlackPostMessageResponse;

  if (!payload.ok) {
    // Surface Slack error codes only — never log tokens or channel secrets beyond ids already known.
    logger.error('Slack chat.postMessage failed', {
      slackError: payload.error ?? 'chat.postMessage_failed',
      channelConfigured: !!input.channelId?.trim(),
      tokenConfigured: !!input.accessToken?.trim(),
    });
    throw new Error(payload.error ?? 'chat.postMessage_failed');
  }
}

/**
 * Acquire a Redis NX lock so only one worker sends Slack for this sender/hour.
 */
export async function tryAcquireSlackRateLimitNotifyLock(
  senderId: string,
): Promise<boolean> {
  const now = new Date();
  const key = `slack-rate-limit-notified:${senderId}:${formatUtcHourKey(now)}`;
  const ttlSeconds = secondsUntil(startOfNextUtcHour(now), now) + 3600;
  const result = await getRedisClient().set(key, '1', 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}
