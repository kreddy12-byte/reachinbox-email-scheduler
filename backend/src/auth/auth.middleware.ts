import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors.js';

/**
 * Requires an authenticated session with a resolved User.
 * Never trusts client-supplied userId for identity.
 */
export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (req.isAuthenticated() && req.user) {
    next();
    return;
  }

  next(new AppError('Unauthorized', 401));
}
