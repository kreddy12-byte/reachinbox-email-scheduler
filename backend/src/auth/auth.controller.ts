import type { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export function googleAuthStart(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    next(
      new AppError(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
      ),
    );
    return;
  }

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: true,
  })(req, res, next);
}

export function googleAuthCallback(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  passport.authenticate(
    'google',
    { session: true, failureRedirect: `${env.FRONTEND_URL}/?auth=failed` },
    (err: Error | null, user: Express.User | false) => {
      if (err) {
        next(err);
        return;
      }

      if (!user) {
        res.redirect(`${env.FRONTEND_URL}/?auth=failed`);
        return;
      }

      req.logIn(user, (loginError) => {
        if (loginError) {
          next(loginError);
          return;
        }

        res.redirect(`${env.FRONTEND_URL}/dashboard`);
      });
    },
  )(req, res, next);
}

export function getCurrentUser(req: Request, res: Response): void {
  if (!req.isAuthenticated() || !req.user) {
    throw new AppError('Unauthorized', 401);
  }

  res.status(200).json({
    success: true,
    data: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      avatarUrl: req.user.avatarUrl,
    },
  });
}

export function logout(req: Request, res: Response, next: NextFunction): void {
  req.logout((logoutError) => {
    if (logoutError) {
      next(logoutError);
      return;
    }

    req.session.destroy((destroyError) => {
      if (destroyError) {
        next(destroyError);
        return;
      }

      res.clearCookie('reachinbox.sid');
      res.status(200).json({ success: true });
    });
  });
}
