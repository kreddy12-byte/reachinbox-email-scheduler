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
  REDIS_URL: process.env.REDIS_URL ?? '',
  REDIS_HOST: requireEnv('REDIS_HOST', 'localhost'),
  REDIS_PORT: Number(requireEnv('REDIS_PORT', '6379')),
  ELASTICSEARCH_URL: requireEnv('ELASTICSEARCH_URL', 'http://localhost:9200'),
  ELASTICSEARCH_INDEX: requireEnv('ELASTICSEARCH_INDEX', 'emails'),
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
  ETHEREAL_USER: requireEnv('ETHEREAL_USER'),
  ETHEREAL_PASSWORD: requireEnv('ETHEREAL_PASSWORD'),
  EMAIL_MIN_DELAY_MS: requireNonNegativeInt('EMAIL_MIN_DELAY_MS', '2000'),
  MAX_EMAILS_PER_HOUR: requirePositiveInt('MAX_EMAILS_PER_HOUR', '200'),
  WORKER_CONCURRENCY: requirePositiveInt('WORKER_CONCURRENCY', '5'),
  EMAIL_JOB_ATTEMPTS: requirePositiveInt('EMAIL_JOB_ATTEMPTS', '3'),
  EMAIL_JOB_BACKOFF_MS: requirePositiveInt('EMAIL_JOB_BACKOFF_MS', '5000'),
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID ?? '',
  SLACK_CLIENT_SECRET: process.env.SLACK_CLIENT_SECRET ?? '',
  SLACK_REDIRECT_URI: requireEnv(
    'SLACK_REDIRECT_URI',
    'http://localhost:3001/api/slack/oauth/callback',
  ),
  SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID ?? '',
} as const;
