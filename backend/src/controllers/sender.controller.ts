import type { Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { getOrCreateDefaultSender } from '../services/sender.service.js';
import { AppError } from '../utils/errors.js';

function requireUser(req: Request) {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }
  return req.user;
}

/**
 * List senders owned by the authenticated user.
 * Ensures a default Ethereal sender exists so compose always has an option.
 */
export async function listSendersHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const user = requireUser(req);
  await getOrCreateDefaultSender(user.id);

  const senders = await prisma.sender.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
    },
  });

  res.status(200).json({
    success: true,
    data: {
      senders: senders.map((sender) => ({
        id: sender.id,
        email: sender.email,
        displayName: sender.displayName,
        createdAt: sender.createdAt.toISOString(),
      })),
    },
  });
}
