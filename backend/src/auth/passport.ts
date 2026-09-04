import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import type { Profile } from 'passport-google-oauth20';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import type { AuthUser } from '../types/auth.js';
import { logger } from '../utils/logger.js';

function toAuthUser(user: {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}): AuthUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
}

export function configurePassport(): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    logger.warn(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing — Google OAuth routes will fail until configured',
    );
  }

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        done(null, false);
        return;
      }
      done(null, toAuthUser(user));
    } catch (error) {
      done(error);
    }
  });

  passport.use(
    new GoogleStrategy(
      {
        clientID: env.GOOGLE_CLIENT_ID || 'not-configured',
        clientSecret: env.GOOGLE_CLIENT_SECRET || 'not-configured',
        callbackURL: env.GOOGLE_CALLBACK_URL,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        profile: Profile,
        done,
      ) => {
        try {
          // Access/refresh tokens are intentionally not persisted or returned.
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          const name = profile.displayName || email || 'Google User';
          const avatarUrl = profile.photos?.[0]?.value ?? null;

          if (!email) {
            done(new Error('Google account did not provide an email address'));
            return;
          }

          const existingByGoogle = await prisma.user.findUnique({
            where: { googleId },
          });

          if (existingByGoogle) {
            const updated = await prisma.user.update({
              where: { id: existingByGoogle.id },
              data: { name, email, avatarUrl },
            });
            done(null, toAuthUser(updated));
            return;
          }

          const existingByEmail = await prisma.user.findUnique({
            where: { email },
          });

          if (existingByEmail) {
            const linked = await prisma.user.update({
              where: { id: existingByEmail.id },
              data: { googleId, name, avatarUrl },
            });
            done(null, toAuthUser(linked));
            return;
          }

          const created = await prisma.user.create({
            data: {
              googleId,
              name,
              email,
              avatarUrl,
            },
          });

          done(null, toAuthUser(created));
        } catch (error) {
          done(error as Error);
        }
      },
    ),
  );
}
