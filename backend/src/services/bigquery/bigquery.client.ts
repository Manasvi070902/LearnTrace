import { BigQuery } from '@google-cloud/bigquery';

/**
 * Singleton BigQuery client initialized using Google Application Default Credentials (ADC).
 *
 * Requires:
 *   GOOGLE_CLOUD_PROJECT_ID — your GCP project ID
 *   BIGQUERY_LOCATION       — dataset/job location (e.g. "asia-south1")
 *
 * Local development: run `gcloud auth application-default login` once before starting the server.
 * ADC credentials are picked up automatically by the library — no service account key needed.
 */

let _client: BigQuery | null = null;

export function getBigQueryClient(): BigQuery {
  if (_client) return _client;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const location = process.env.BIGQUERY_LOCATION || 'US';

  if (!projectId) {
    throw new Error(
      '[BigQuery] GOOGLE_CLOUD_PROJECT_ID is not set. ' +
        'Add it to your backend .env file and restart the server.'
    );
  }

  _client = new BigQuery({ projectId, location });
  console.log(
    `[BigQuery] Client initialized — project: ${projectId}, location: ${location}`
  );

  return _client;
}

/** Resets the singleton (used in tests). */
export function resetBigQueryClient(): void {
  _client = null;
}
