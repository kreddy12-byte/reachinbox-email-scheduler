import type { Email, EmailStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

export interface EmailSearchDocument {
  id: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SearchEmailsOptions {
  status?: EmailStatus;
  page?: number;
  limit?: number;
}

export interface SearchEmailsResult {
  items: EmailSearchDocument[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function toEmailSearchDocument(email: Email): EmailSearchDocument {
  return {
    id: email.id,
    userId: email.userId,
    senderId: email.senderId,
    recipient: email.recipient,
    subject: email.subject,
    body: email.body,
    scheduledAt: email.scheduledAt.toISOString(),
    sentAt: email.sentAt ? email.sentAt.toISOString() : null,
    status: email.status,
    createdAt: email.createdAt.toISOString(),
    updatedAt: email.updatedAt.toISOString(),
  };
}

/**
 * Postgres search replacing Elasticsearch (ILIKE on recipient/subject/body).
 */
export async function searchEmails(
  userId: string,
  q: string | undefined,
  options: SearchEmailsOptions = {},
): Promise<SearchEmailsResult> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 20;
  const skip = (page - 1) * limit;
  const query = q?.trim() ?? '';

  const where: Prisma.EmailWhereInput = {
    userId,
    ...(options.status ? { status: options.status } : {}),
    ...(query
      ? {
          OR: [
            { recipient: { contains: query, mode: 'insensitive' } },
            { subject: { contains: query, mode: 'insensitive' } },
            { body: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, emails] = await Promise.all([
    prisma.email.count({ where }),
    prisma.email.findMany({
      where,
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: limit,
    }),
  ]);

  return {
    items: emails.map(toEmailSearchDocument),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
