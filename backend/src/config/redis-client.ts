import Redis from 'ioredis';
import { redisConnection } from './redis.js';
import { logger } from '../utils/logger.js';

let redisClient: Redis | null = null;

/**
 * Shared ioredis client for atomic Lua rate-limit / throttle scripts.
 * Separate from BullMQ's internal connections but uses the same Redis host.
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: redisConnection.host,
      port: redisConnection.port,
      maxRetriesPerRequest: null,
    });

    redisClient.on('error', (error) => {
      logger.error('Redis client error', { error: error.message });
    });
  }

  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
