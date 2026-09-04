import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';
import {
  disconnectSlackHandler,
  getSlackStatusHandler,
  slackOAuthCallback,
  startSlackOAuth,
} from '../slack/slack.controller.js';

const router = Router();

// Callback must remain reachable after Slack redirects (state binds the user).
router.get('/oauth/callback', asyncHandler(slackOAuthCallback));

router.get('/oauth', requireAuth, asyncHandler(startSlackOAuth));
router.get('/status', requireAuth, asyncHandler(getSlackStatusHandler));
router.post('/disconnect', requireAuth, asyncHandler(disconnectSlackHandler));

export default router;
