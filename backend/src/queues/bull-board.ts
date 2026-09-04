import type { Express, RequestHandler } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getEmailQueue } from '../queues/email.queue.js';
import { logger } from '../utils/logger.js';

/**
 * Placeholder for future authentication.
 * Queue dashboard is development-accessible today and should be
 * protected behind authentication in production.
 */
const developmentDashboardGate: RequestHandler = (_req, _res, next) => {
  next();
};

export function setupBullBoard(app: Express): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(getEmailQueue())],
    serverAdapter,
  });

  app.use('/admin/queues', developmentDashboardGate, serverAdapter.getRouter());

  logger.info('Bull Board mounted', { path: '/admin/queues', queue: 'email-scheduler' });
}
