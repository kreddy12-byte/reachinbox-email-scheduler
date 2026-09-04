import { ensureEmailIndex } from '../elasticsearch/email.index.js';
import { reindexAllEmails } from '../elasticsearch/email-search.service.js';
import { closeElasticsearchClient } from '../elasticsearch/elasticsearch.client.js';
import { logger } from '../utils/logger.js';

async function main(): Promise<void> {
  await ensureEmailIndex();
  const result = await reindexAllEmails();
  logger.info('Elasticsearch reindex finished', result);
  await closeElasticsearchClient();
}

main().catch(async (error) => {
  logger.error('Elasticsearch reindex failed', {
    error: error instanceof Error ? error.message : String(error),
  });
  await closeElasticsearchClient();
  process.exit(1);
});
