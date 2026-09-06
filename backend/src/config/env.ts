import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

function loadBackendEnv(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'backend', '.env'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
  }
  dotenv.config();
}

loadBackendEnv();

function requireEnv(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function requireNonNegativeInt(key: string, fallback: string): number {
  const value = Number(requireEnv(key, fallback));
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer >= 0`);
  }
  return value;
}

function requirePositiveInt(key: string, fallback: string): number {
  const value = Number(requireEnv(key, fallback));
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) {
    throw new Error(`${key} must be an integer > 0`);
  }
  return value;
}

export const env = {
  DATABASE_URL: requireEnv('DATABASE_URL'),
  PORT: Number(requireEnv('PORT', '3001')),
  FRONTEND_URL: requireEnv('FRONTEND_URL', 'http://localhost:5173'),
  SESSION_SECRET: requireEnv('SESSION_SECRET', 'dev-session-secret-change-me'),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_CALLBACK_URL: requireEnv(
    'GOOGLE_CALLBACK_URL',
    'http://localhost:3001/api/auth/google/callback',
  ),
  ETHEREAL_HOST: requireEnv('ETHEREAL_HOST', 'smtp.ethereal.email'),
  ETHEREAL_PORT: Number(requireEnv('ETHEREAL_PORT', '587')),
  // Optional at boot — createTestAccount can fill these when empty.
  ETHEREAL_USER: process.env.ETHEREAL_USER ?? '',
  ETHEREAL_PASSWORD: process.env.ETHEREAL_PASSWORD ?? '',
  EMAIL_MIN_DELAY_MS: requireNonNegativeInt('EMAIL_MIN_DELAY_MS', '2000'),
  MAX_EMAILS_PER_HOUR: requirePositiveInt('MAX_EMAILS_PER_HOUR', '200'),
  EMAIL_POLL_INTERVAL_MS: requirePositiveInt('EMAIL_POLL_INTERVAL_MS', '3000'),
  EMAIL_POLL_BATCH_SIZE: requirePositiveInt('EMAIL_POLL_BATCH_SIZE', '5'),
  EMAIL_JOB_ATTEMPTS: requirePositiveInt('EMAIL_JOB_ATTEMPTS', '3'),
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID ?? '',
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET ?? '',
  SLACK_REDIRECT_URI: requireEnv(
    'SLACK_REDIRECT_URI',
    'http://localhost:3001/api/slack/oauth/callback',
  ),
  SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID ?? '',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
} as const;

/** Mutable SMTP credentials (may be filled by createTestAccount at startup). */
export const smtpCredentials = {
  user: env.ETHEREAL_USER,
  pass: env.ETHEREAL_PASSWORD,
};
