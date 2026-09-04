import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { getElasticsearchClient } from './elasticsearch.client.js';

export const EMAIL_INDEX_MAPPING = {
  properties: {
    id: { type: 'keyword' as const },
    userId: { type: 'keyword' as const },
    senderId: { type: 'keyword' as const },
    recipient: {
      type: 'text' as const,
      fields: {
        keyword: { type: 'keyword' as const },
      },
    },
    subject: { type: 'text' as const },
    body: { type: 'text' as const },
    status: { type: 'keyword' as const },
    scheduledAt: { type: 'date' as const },
    sentAt: { type: 'date' as const },
    createdAt: { type: 'date' as const },
    updatedAt: { type: 'date' as const },
  },
};

/**
 * Ensure the emails index exists with the expected mapping.
 * Safe to call on every startup — never deletes an existing index.
 */
export async function ensureEmailIndex(): Promise<void> {
  const client = getElasticsearchClient();
  const index = env.ELASTICSEARCH_INDEX;

  const exists = await client.indices.exists({ index });

  if (exists) {
    logger.info('Elasticsearch index already exists', { index });
    return;
  }

  await client.indices.create({
    index,
    mappings: EMAIL_INDEX_MAPPING,
  });

  logger.info('Elasticsearch index created', { index });
}
