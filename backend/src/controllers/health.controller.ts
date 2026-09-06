import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';

async function checkDatabase(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch {
    return 'error';
  }
}

export async function getHealth(_req: Request, res: Response): Promise<void> {
  const database = await checkDatabase();
  const ok = database === 'ok';

  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    services: {
      database,
      poller: 'ok',
    },
  });
}
