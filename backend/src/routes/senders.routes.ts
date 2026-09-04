import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import { listSendersHandler } from '../controllers/sender.controller.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.use(requireAuth);
router.get('/', asyncHandler(listSendersHandler));

export default router;
