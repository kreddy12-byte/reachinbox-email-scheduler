import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import {
  buildSlackAuthorizationUrl,
  consumeSlackOAuthState,
  createSlackOAuthState,
  disconnectSlack,
  exchangeSlackOAuthCode,
  getSlackStatus,
  saveSlackConnection,
} from './slack.service.js';

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }
  return req.user;
}

export async function startSlackOAuth(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);

  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) {
    throw new AppError('Slack OAuth is not configured', 503);
  }

  const state = await createSlackOAuthState(user.id);
  const url = buildSlackAuthorizationUrl(state);
  res.redirect(url);
}

export async function slackOAuthCallback(
  req: Request,
  res: Response,
  _next: NextFunction,
): Promise<void> {
  const dashboard = `${env.FRONTEND_URL}/dashboard`;

  try {
    const errorParam =
      typeof req.query.error === 'string' ? req.query.error : undefined;
    if (errorParam) {
      res.redirect(`${dashboard}?slack=error`);
      return;
    }

    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state =
      typeof req.query.state === 'string' ? req.query.state : undefined;

    if (!code || !state) {
      res.redirect(`${dashboard}?slack=error`);
      return;
    }

    const userId = await consumeSlackOAuthState(state);
    if (!userId) {
      res.redirect(`${dashboard}?slack=invalid_state`);
      return;
    }

    // Ensure the session user matches the state-bound user when present.
    if (req.user && req.user.id !== userId) {
      res.redirect(`${dashboard}?slack=error`);
      return;
    }

    const tokens = await exchangeSlackOAuthCode(code);
    await saveSlackConnection({
      userId,
      accessToken: tokens.accessToken,
      teamId: tokens.teamId,
      teamName: tokens.teamName,
    });

    res.redirect(`${dashboard}?slack=connected`);
  } catch (error) {
    logger.error('Slack OAuth callback failed', {
      error: error instanceof Error ? error.message || error.name : String(error),
    });
    res.redirect(`${dashboard}?slack=error`);
  }
}

export async function getSlackStatusHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  const status = await getSlackStatus(user.id);

  res.status(200).json({
    success: true,
    data: status,
  });
}

export async function disconnectSlackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  await disconnectSlack(user.id);

  res.status(200).json({
    success: true,
  });
}
