import { Router } from 'express';
import { getHealth } from '../controllers/health.controller.js';
import { asyncHandler } from '../utils/async-handler.js';
import authRoutes from './auth.routes.js';
import emailsRoutes from './emails.routes.js';
import sendersRoutes from './senders.routes.js';
import slackRoutes from './slack.routes.js';

const router = Router();

router.get('/health', asyncHandler(getHealth));
router.use('/auth', authRoutes);
router.use('/emails', emailsRoutes);
router.use('/senders', sendersRoutes);
router.use('/slack', slackRoutes);

export default router;
