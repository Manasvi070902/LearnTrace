import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';

/**
 * Statistics returned by the BigQuery verification endpoint.
 */
export interface VideoStats {
  videoId: string;
  videoStored: boolean;
  commentsStored: number;
  repliesStored: number;
  totalRecords: number;
}

/**
 * Queries BigQuery for the stored statistics of a specific video.
 * Returns null if the video has not been stored yet.
 */
export async function getVideoStats(videoId: string): Promise<VideoStats | null> {
  const datasetId = process.env.BIGQUERY_DATASET!;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const bq = getBigQueryClient();

  // Check if the video exists in the videos table
  const [videoRows] = await bq.query({
    query: `
      SELECT video_id
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.VIDEOS}\`
      WHERE video_id = @video_id
      LIMIT 1
    `,
    params: { video_id: videoId },
    location: process.env.BIGQUERY_LOCATION,
  });

  if (!videoRows || videoRows.length === 0) {
    return null;
  }

  // Count top-level comments and replies in the comments table
  const [statsRows] = await bq.query({
    query: `
      SELECT
        COUNTIF(is_reply = false) AS comments_stored,
        COUNTIF(is_reply = true)  AS replies_stored
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.COMMENTS}\`
      WHERE video_id = @video_id
    `,
    params: { video_id: videoId },
    location: process.env.BIGQUERY_LOCATION,
  });

  const stats = statsRows?.[0];
  const commentsStored = Number(stats?.comments_stored ?? 0);
  const repliesStored = Number(stats?.replies_stored ?? 0);

  return {
    videoId,
    videoStored: true,
    commentsStored,
    repliesStored,
    totalRecords: commentsStored + repliesStored,
  };
}
