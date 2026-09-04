import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import { configurePassport } from './auth/passport.js';
import { createSessionMiddleware } from './auth/session.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { ensureEmailIndex } from './elasticsearch/email.index.js';
import { getElasticsearchClient } from './elasticsearch/elasticsearch.client.js';
import { errorHandler } from './middleware/error.middleware.js';
import { setupBullBoard } from './queues/bull-board.js';
import { getEmailQueue } from './queues/email.queue.js';
import routes from './routes/index.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  logger.info('PostgreSQL connection verified');

  try {
    getElasticsearchClient();
    await ensureEmailIndex();
  } catch (error) {
    logger.error('Elasticsearch startup initialization failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  getEmailQueue();
  logger.info('BullMQ email-scheduler queue initialized');

  configurePassport();

  const app = express();

  setupBullBoard(app);

  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(morgan('dev'));
  app.use(express.json());
  app.use(createSessionMiddleware());
  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api', routes);
  app.use(errorHandler);

  app.listen(env.PORT, () => {
    logger.info('Backend listening', {
      port: env.PORT,
      url: `http://localhost:${env.PORT}`,
      bullBoard: `http://localhost:${env.PORT}/admin/queues`,
      frontend: env.FRONTEND_URL,
    });
  });
}

bootstrap().catch((error) => {
  logger.error('Backend failed to start', {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
