import type { AuthUser } from './auth.js';

declare global {
  namespace Express {
    // Passport populates req.user with our AuthUser shape.
    interface User extends AuthUser {}
  }
}

export {};
