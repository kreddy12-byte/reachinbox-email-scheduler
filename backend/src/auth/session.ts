import session from 'express-session';
import { env } from '../config/env.js';

/**
 * Development session store: MemoryStore (default).
 * Sessions are lost on API restart. Use a persistent store (e.g. Redis)
 * for production.
 */
export function createSessionMiddleware() {
  const isProduction = process.env.NODE_ENV === 'production';

  return session({
    name: 'reachinbox.sid',
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Production frontend and API are separate origins on Render;
      // SameSite=None is required for credentialed cross-origin fetches.
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  });
}
