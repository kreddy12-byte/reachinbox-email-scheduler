import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import { configurePassport } from './auth/passport.js';
import { createSessionMiddleware } from './auth/session.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { errorHandler } from './middleware/error.middleware.js';
import routes from './routes/index.js';
import { ensureSmtpCredentials } from './services/email.service.js';
import { startEmailPoller } from './services/email-poller.service.js';
import { logger } from './utils/logger.js';

async function bootstrap(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
  logger.info('PostgreSQL connection verified');

  await ensureSmtpCredentials();
  configurePassport();

  const app = express();

  // Render (and other reverse proxies) terminate TLS; needed for secure cookies.
  app.set('trust proxy', 1);

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

  startEmailPoller();

  app.listen(env.PORT, () => {
    logger.info('Backend listening', {
      port: env.PORT,
      url: `http://localhost:${env.PORT}`,
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
