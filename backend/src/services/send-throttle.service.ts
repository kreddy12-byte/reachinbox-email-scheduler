import { getRedisClient } from '../config/redis-client.js';
import { logger } from '../utils/logger.js';

export interface SendSlotResult {
  allowedAt: Date;
  senderId: string;
  delayMs: number;
}

/**
 * Distributed per-sender send-slot reservation.
 * Redis key: email-send-slot:{senderId}
 *
 * nextSendTime = max(now, lastReserved + delayMs)
 * Multiple workers receive non-overlapping slots.
 */
const RESERVE_SEND_SLOT_LUA = `
local key = KEYS[1]
local nowMs = tonumber(ARGV[1])
local delayMs = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local last = tonumber(redis.call('GET', key) or '0')
local nextSend = math.max(nowMs, last + delayMs)

redis.call('SET', key, tostring(nextSend))
redis.call('EXPIRE', key, ttl)

return {tostring(nextSend)}
`;

export async function reserveSendSlot(
  senderId: string,
  sendDelayMs: number,
  options?: { emailId?: string },
): Promise<SendSlotResult> {
  if (!Number.isFinite(sendDelayMs) || sendDelayMs < 0) {
    throw new Error(`sendDelayMs must be >= 0 (got ${sendDelayMs})`);
  }

  const nowMs = Date.now();
  // Keep slot state long enough for large backlog pacing (e.g. 1000+ emails).
  const ttlSeconds = Math.max(
    3600,
    Math.ceil((sendDelayMs * 2000) / 1000) + 3600,
  );

  const redis = getRedisClient();
  const raw = (await redis.eval(
    RESERVE_SEND_SLOT_LUA,
    1,
    `email-send-slot:${senderId}`,
    String(nowMs),
    String(sendDelayMs),
    String(ttlSeconds),
  )) as [string];

  const allowedAt = new Date(Number(raw[0]));

  logger.info('Send slot reserved', {
    senderId,
    emailId: options?.emailId,
    sendDelayMs,
    sendSlot: allowedAt.toISOString(),
    waitMs: Math.max(0, allowedAt.getTime() - nowMs),
  });

  return {
    allowedAt,
    senderId,
    delayMs: sendDelayMs,
  };
}
