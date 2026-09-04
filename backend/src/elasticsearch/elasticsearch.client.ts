import { Client } from '@elastic/elasticsearch';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let client: Client | null = null;

/**
 * Shared Elasticsearch client for the process.
 * Do not construct a new Client per request.
 */
export function getElasticsearchClient(): Client {
  if (!client) {
    client = new Client({
      node: env.ELASTICSEARCH_URL,
    });

    logger.info('Elasticsearch client initialized', {
      url: env.ELASTICSEARCH_URL,
      index: env.ELASTICSEARCH_INDEX,
    });
  }

  return client;
}

export async function closeElasticsearchClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}

export async function pingElasticsearch(): Promise<boolean> {
  try {
    return await getElasticsearchClient().ping();
  } catch {
    return false;
  }
}
