import { getBigQueryClient } from './bigquery.client';
import { VIDEOS_TABLE_SCHEMA, COMMENTS_TABLE_SCHEMA, COMMENT_ANALYSIS_TABLE_SCHEMA, ANALYSIS_RUNS_TABLE_SCHEMA, QUESTION_EMBEDDINGS_TABLE_SCHEMA, QUESTION_CLUSTERS_TABLE_SCHEMA, QUESTION_CLUSTER_MEMBERS_TABLE_SCHEMA, LEARNING_FRICTION_TABLE_SCHEMA, TABLE_NAMES } from './bigquery.schema';

/**
 * Ensures the BigQuery dataset and required tables exist.
 * Called once at server startup — safe to call multiple times (idempotent).
 * Tables that already exist are left untouched.
 */
export async function initializeBigQueryTables(): Promise<void> {
  const datasetId = process.env.BIGQUERY_DATASET;
  if (!datasetId) {
    throw new Error(
      '[BigQuery] BIGQUERY_DATASET is not set. Add it to your backend .env file.'
    );
  }

  const bq = getBigQueryClient();
  const dataset = bq.dataset(datasetId);

  // Verify dataset exists (do not auto-create — user created it via GCP console)
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) {
    throw new Error(
      `[BigQuery] Dataset '${datasetId}' does not exist in project '${process.env.GOOGLE_CLOUD_PROJECT_ID}'. ` +
        'Please create it first in the Google Cloud Console or with the gcloud CLI.'
    );
  }

  // Create videos table if it doesn't exist
  await ensureTable(dataset, TABLE_NAMES.VIDEOS, VIDEOS_TABLE_SCHEMA);

  // Create comments table if it doesn't exist
  await ensureTable(dataset, TABLE_NAMES.COMMENTS, COMMENTS_TABLE_SCHEMA);
  await ensureTable(dataset, TABLE_NAMES.COMMENT_ANALYSIS, COMMENT_ANALYSIS_TABLE_SCHEMA);
  await ensureTable(dataset, TABLE_NAMES.ANALYSIS_RUNS, ANALYSIS_RUNS_TABLE_SCHEMA);

  // Phase 5: Create friction analysis tables
  await ensureTable(dataset, TABLE_NAMES.QUESTION_EMBEDDINGS, QUESTION_EMBEDDINGS_TABLE_SCHEMA);
  await ensureTable(dataset, TABLE_NAMES.QUESTION_CLUSTERS, QUESTION_CLUSTERS_TABLE_SCHEMA);
  await ensureTable(dataset, TABLE_NAMES.QUESTION_CLUSTER_MEMBERS, QUESTION_CLUSTER_MEMBERS_TABLE_SCHEMA);
  await ensureTable(dataset, TABLE_NAMES.LEARNING_FRICTION, LEARNING_FRICTION_TABLE_SCHEMA);

  console.log(`[BigQuery] Tables verified in dataset '${datasetId}'.`);
}

async function ensureTable(
  dataset: ReturnType<ReturnType<typeof getBigQueryClient>['dataset']>,
  tableId: string,
  schema: object[]
): Promise<void> {
  const table = dataset.table(tableId);
  const [exists] = await table.exists();
  if (!exists) {
    await dataset.createTable(tableId, { schema });
    console.log(`[BigQuery] Created table '${tableId}'.`);
  } else {
    console.log(`[BigQuery] Table '${tableId}' already exists — skipping creation.`);
  }
}
