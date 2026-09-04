import { env } from './env.js';

export function resolveRedisConnection(): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: object;
  maxRetriesPerRequest: null;
} {
  if (env.REDIS_URL) {
    try {
      const parsed = new URL(env.REDIS_URL);
      const username = parsed.username
        ? decodeURIComponent(parsed.username)
        : undefined;
      const password = parsed.password
        ? decodeURIComponent(parsed.password)
        : undefined;

      return {
        host: parsed.hostname || env.REDIS_HOST,
        port: parsed.port ? Number(parsed.port) : env.REDIS_PORT,
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
        ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
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
 * Prefer REDIS_URL when set (supports password / TLS from managed Redis);
 * otherwise REDIS_HOST + REDIS_PORT.
 * maxRetriesPerRequest must be null for BullMQ workers.
 */
export const redisConnection = resolveRedisConnection();
