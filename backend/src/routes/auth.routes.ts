import { Router } from 'express';
import {
  getCurrentUser,
  googleAuthCallback,
  googleAuthStart,
  logout,
} from '../auth/auth.controller.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.get('/google', googleAuthStart);
router.get('/google/callback', googleAuthCallback);
router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    getCurrentUser(req, res);
  }),
);
router.post(
  '/logout',
  requireAuth,
  (req, res, next) => {
    logout(req, res, next);
  },
);

export default router;
