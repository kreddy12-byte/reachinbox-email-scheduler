import type { Email, EmailStatus } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { getElasticsearchClient } from './elasticsearch.client.js';

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

export async function indexEmail(email: Email): Promise<void> {
  const client = getElasticsearchClient();
  const document = toEmailSearchDocument(email);

  await client.index({
    index: env.ELASTICSEARCH_INDEX,
    id: email.id,
    document,
    refresh: true,
  });
}

export async function updateEmailIndex(email: Email): Promise<void> {
  // Upsert so status updates work even if the initial index call failed.
  await indexEmail(email);
}

export async function deleteEmailIndex(emailId: string): Promise<void> {
  const client = getElasticsearchClient();

  try {
    await client.delete({
      index: env.ELASTICSEARCH_INDEX,
      id: emailId,
      refresh: true,
    });
  } catch (error) {
    const statusCode =
      error && typeof error === 'object' && 'meta' in error
        ? (error as { meta?: { statusCode?: number } }).meta?.statusCode
        : undefined;

    if (statusCode === 404) {
      return;
    }

    throw error;
  }
}

/**
 * Best-effort indexing — never throws to callers.
 * PostgreSQL remains the source of truth for scheduling/sending.
 */
export async function safeIndexEmail(email: Email): Promise<void> {
  try {
    await indexEmail(email);
  } catch (error) {
    logger.error('Elasticsearch indexing failed', {
      emailId: email.id,
      status: email.status,
      error:
        error instanceof Error
          ? error.message || error.name
          : String(error),
    });
  }
}

export async function safeSyncEmailById(emailId: string): Promise<void> {
  try {
    const email = await prisma.email.findUnique({ where: { id: emailId } });
    if (!email) {
      return;
    }
    await updateEmailIndex(email);
  } catch (error) {
    logger.error('Elasticsearch sync failed', {
      emailId,
      error:
        error instanceof Error
          ? error.message || error.name
          : String(error),
    });
  }
}

export async function searchEmails(
  userId: string,
  query: string | undefined,
  options: SearchEmailsOptions = {},
): Promise<SearchEmailsResult> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const from = (page - 1) * limit;
  const q = query?.trim();

  const filter: object[] = [{ term: { userId } }];

  if (options.status) {
    filter.push({ term: { status: options.status } });
  }

  const must: object[] = [];

  if (q) {
    must.push({
      bool: {
        should: [
          {
            multi_match: {
              query: q,
              fields: ['recipient', 'subject', 'body'],
              type: 'best_fields',
              fuzziness: 'AUTO',
            },
          },
          {
            term: {
              'recipient.keyword': q,
            },
          },
          {
            wildcard: {
              'recipient.keyword': {
                value: `*${q}*`,
                case_insensitive: true,
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  }

  const client = getElasticsearchClient();
  const response = await client.search<EmailSearchDocument>({
    index: env.ELASTICSEARCH_INDEX,
    from,
    size: limit,
    track_total_hits: true,
    query: {
      bool: {
        filter,
        ...(must.length > 0 ? { must } : {}),
      },
    },
    sort: [{ scheduledAt: { order: 'desc' } }, { createdAt: { order: 'desc' } }],
  });

  const total =
    typeof response.hits.total === 'number'
      ? response.hits.total
      : (response.hits.total?.value ?? 0);

  const items = response.hits.hits
    .map((hit) => hit._source)
    .filter((doc): doc is EmailSearchDocument => Boolean(doc));

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

const REINDEX_BATCH_SIZE = 500;

/**
 * Reindex all PostgreSQL emails into Elasticsearch using the bulk API.
 */
export async function reindexAllEmails(): Promise<{ indexed: number }> {
  let cursor: string | undefined;
  let indexed = 0;
  const client = getElasticsearchClient();
  const index = env.ELASTICSEARCH_INDEX;

  for (;;) {
    const batch = await prisma.email.findMany({
      take: REINDEX_BATCH_SIZE,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) {
      break;
    }

    const operations = batch.flatMap((email) => [
      { index: { _index: index, _id: email.id } },
      toEmailSearchDocument(email),
    ]);

    const result = await client.bulk({ refresh: false, operations });

    if (result.errors) {
      const failed = result.items.filter((item) => item.index?.error);
      logger.error('Elasticsearch bulk reindex had errors', {
        failedCount: failed.length,
        sample: failed[0]?.index?.error,
      });
    }

    indexed += batch.length;
    cursor = batch[batch.length - 1]?.id;

    logger.info('Elasticsearch reindex batch complete', {
      batchSize: batch.length,
      indexed,
    });

    if (batch.length < REINDEX_BATCH_SIZE) {
      break;
    }
  }

  await client.indices.refresh({ index });

  return { indexed };
}
