import { Router } from 'express';
import {
  getScheduledEmailsHandler,
  getSentEmailsHandler,
  scheduleEmailsHandler,
  searchEmailsHandler,
} from '../controllers/email.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(requireAuth);

router.post('/schedule', asyncHandler(scheduleEmailsHandler));
router.get('/scheduled', asyncHandler(getScheduledEmailsHandler));
router.get('/sent', asyncHandler(getSentEmailsHandler));
router.get('/search', asyncHandler(searchEmailsHandler));

export default router;
