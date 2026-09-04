import { env } from './env.js';

function resolveRedisConnection(): {
  host: string;
  port: number;
  maxRetriesPerRequest: null;
} {
  if (env.REDIS_URL) {
    try {
      const parsed = new URL(env.REDIS_URL);
      return {
        host: parsed.hostname || env.REDIS_HOST,
        port: parsed.port ? Number(parsed.port) : env.REDIS_PORT,
        maxRetriesPerRequest: null,
      };
    } catch {
      // Fall through to host/port when REDIS_URL is malformed.
    }
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    maxRetriesPerRequest: null,
  };
}

/**
 * Shared BullMQ / ioredis connection options.
 * Prefer REDIS_URL when set; otherwise REDIS_HOST + REDIS_PORT.
 * maxRetriesPerRequest must be null for BullMQ workers.
 */
export const redisConnection = resolveRedisConnection();
