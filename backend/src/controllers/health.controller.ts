import type { Request, Response } from 'express';
import { getRedisClient } from '../config/redis-client.js';
import { prisma } from '../db/prisma.js';
import { pingElasticsearch } from '../elasticsearch/elasticsearch.client.js';

async function checkDatabase(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkRedis(): Promise<'ok' | 'error'> {
  try {
    const result = await getRedisClient().ping();
    return result === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const [database, redis, elasticsearch] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    pingElasticsearch().then((ok) => (ok ? 'ok' : 'error') as 'ok' | 'error'),
  ]);

  // Elasticsearch outage must not fail the overall app health check.
  const criticalOk = database === 'ok' && redis === 'ok';

  res.status(criticalOk ? 200 : 503).json({
    status: criticalOk ? 'ok' : 'degraded',
    services: {
      database,
      redis,
      elasticsearch,
    },
  });
}
