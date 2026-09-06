import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';

export interface SendSlotResult {
  allowedAt: Date;
  senderId: string;
  delayMs: number;
}

/**
 * Per-sender min-delay slots stored in Postgres (single-API process safe).
 * nextSendAt = max(now, previous nextSendAt) + delayMs after reservation.
 * Reservation returns the time this send may leave.
 */
export async function reserveSendSlot(
  senderId: string,
  sendDelayMs: number,
  options?: { emailId?: string },
): Promise<SendSlotResult> {
  if (!Number.isFinite(sendDelayMs) || sendDelayMs < 0) {
    throw new Error(`sendDelayMs must be >= 0 (got ${sendDelayMs})`);
  }

  const now = new Date();

  const allowedAt = await prisma.$transaction(async (tx) => {
    const existing = await tx.senderSendSlot.findUnique({
      where: { senderId },
    });

    const base = existing
      ? Math.max(now.getTime(), existing.nextSendAt.getTime())
      : now.getTime();
    const slotAt = new Date(base);

    await tx.senderSendSlot.upsert({
      where: { senderId },
      create: {
        senderId,
        nextSendAt: new Date(slotAt.getTime() + sendDelayMs),
      },
      update: {
        nextSendAt: new Date(slotAt.getTime() + sendDelayMs),
      },
    });

    return slotAt;
  });

  logger.info('Send slot reserved', {
    senderId,
    emailId: options?.emailId,
    sendDelayMs,
    sendSlot: allowedAt.toISOString(),
    waitMs: Math.max(0, allowedAt.getTime() - now.getTime()),
  });

  return {
    allowedAt,
    senderId,
    delayMs: sendDelayMs,
  };
}
