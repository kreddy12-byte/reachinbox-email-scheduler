import { getRedisClient } from '../config/redis-client.js';
import { notifyHourlyLimitReached } from '../slack/slack-notification.service.js';
import { logger } from '../utils/logger.js';
import {
  formatUtcHourKey,
  secondsUntil,
  startOfNextUtcHour,
} from '../utils/time.js';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  current: number;
  limit: number;
  retryAt?: Date;
  windowKey: string;
}

/**
 * Atomic check-and-increment for per-sender hourly limits.
 * Redis key: email-rate:{senderId}:{YYYYMMDDHH} (UTC)
 *
 * Lua guarantees no concurrent workers can exceed the limit.
 */
const CHECK_AND_RESERVE_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local nextWindowMs = ARGV[3]

local current = tonumber(redis.call('GET', key) or '0')

if current >= limit then
  return {0, current, 0, nextWindowMs}
end

local newCount = redis.call('INCR', key)
if newCount == 1 then
  redis.call('EXPIRE', key, ttl)
end

local remaining = limit - newCount
if remaining < 0 then
  remaining = 0
end

return {1, newCount, remaining, '0'}
`;

function buildRateKey(senderId: string, now: Date): string {
  return `email-rate:${senderId}:${formatUtcHourKey(now)}`;
}

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
  const key = buildRateKey(senderId, now);
  // Keep counter through the next hour boundary with a small buffer.
  const ttlSeconds = secondsUntil(retryAt, now) + 3600;

  const redis = getRedisClient();
  const raw = (await redis.eval(
    CHECK_AND_RESERVE_LUA,
    1,
    key,
    String(hourlyLimit),
    String(ttlSeconds),
    String(retryAt.getTime()),
  )) as [number | string, number | string, number | string, string];

  const allowed = Number(raw[0]) === 1;
  const current = Number(raw[1]);
  const remaining = Number(raw[2]);

  const result: RateLimitResult = {
    allowed,
    remaining,
    current,
    limit: hourlyLimit,
    windowKey: key,
    ...(allowed ? {} : { retryAt }),
  };

  if (!allowed) {
    // Best-effort Slack notify with Redis NX dedupe inside the Slack service.
    // Must never affect email scheduling / rescheduling.
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
      windowKey: key,
    });
  } else {
    logger.info('Hourly rate limit reserved', {
      senderId,
      emailId: options?.emailId,
      rateLimit: hourlyLimit,
      rateLimitRemaining: remaining,
      current,
      windowKey: key,
    });
  }

  return result;
}

/**
 * Read-only peek at the current hourly counter (for tests/diagnostics).
 */
export async function getHourlySendCount(senderId: string): Promise<number> {
  const key = buildRateKey(senderId, new Date());
  const value = await getRedisClient().get(key);
  return value ? Number(value) : 0;
}
