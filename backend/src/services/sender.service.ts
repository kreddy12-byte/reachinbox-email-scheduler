import { prisma } from '../db/prisma.js';

/**
 * Optional default sender for the authenticated user when senderId is omitted.
 * Still scoped to the authenticated user — never shared across accounts.
 */
const DEFAULT_SENDER_EMAIL = 'default-sender@ethereal.email';

export async function getOrCreateDefaultSender(userId: string) {
  const existing = await prisma.sender.findFirst({
    where: { userId, email: DEFAULT_SENDER_EMAIL },
  });

  if (existing) {
    return existing;
  }

  return prisma.sender.create({
    data: {
      userId,
      email: DEFAULT_SENDER_EMAIL,
      displayName: 'Default Sender',
      etherealUser: null,
    },
  });
}

export async function findOwnedSender(userId: string, senderId: string) {
  return prisma.sender.findFirst({
    where: { id: senderId, userId },
  });
}
