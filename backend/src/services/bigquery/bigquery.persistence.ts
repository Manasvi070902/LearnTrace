import { getBigQueryClient } from './bigquery.client';
import { mapVideoToRow, flattenCommentsToRows, VideoRow, CommentRow } from './bigquery.mapper';
import { YouTubeVideoMetadata, YouTubeComment } from '../youtube/youtube.types';
import { TABLE_NAMES } from './bigquery.schema';

/**
 * Result shape returned after persisting a video analysis to BigQuery.
 */
export interface PersistenceResult {
  videoStored: boolean;
  commentsStored: number;
}

/**
 * Upserts a video record into the `videos` table.
 * Uses MERGE DML to guarantee idempotency — re-analyzing the same video
 * updates the existing row rather than inserting a duplicate.
 */
export async function upsertVideo(video: YouTubeVideoMetadata): Promise<void> {
  const datasetId = process.env.BIGQUERY_DATASET!;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const bq = getBigQueryClient();
  const row = mapVideoToRow(video);

  const query = `
    MERGE \`${projectId}.${datasetId}.${TABLE_NAMES.VIDEOS}\` AS target
    USING (
      SELECT
        @video_id     AS video_id,
        @title        AS title,
        @channel_id   AS channel_id,
        @channel_title AS channel_title,
        TIMESTAMP(@published_at) AS published_at,
        @view_count   AS view_count,
        @duration     AS duration,
        TIMESTAMP(@analyzed_at) AS analyzed_at
    ) AS source
    ON target.video_id = source.video_id
    WHEN MATCHED THEN
      UPDATE SET
        title         = source.title,
        channel_id    = source.channel_id,
        channel_title = source.channel_title,
        published_at  = source.published_at,
        view_count    = source.view_count,
        duration      = source.duration,
        analyzed_at   = source.analyzed_at
    WHEN NOT MATCHED THEN
      INSERT (video_id, title, channel_id, channel_title, published_at, view_count, duration, analyzed_at)
      VALUES (source.video_id, source.title, source.channel_id, source.channel_title,
              source.published_at, source.view_count, source.duration, source.analyzed_at)
  `;

  await bq.query({
    query,
    params: {
      video_id:      row.video_id,
      title:         row.title,
      channel_id:    row.channel_id,
      channel_title: row.channel_title,
      published_at:  row.published_at,
      view_count:    row.view_count,
      duration:      row.duration,
      analyzed_at:   row.analyzed_at,
    },
    location: process.env.BIGQUERY_LOCATION,
  });
}

/**
 * Upserts all comments and replies for a video into the `comments` table.
 * Uses MERGE DML per batch — idempotent even across repeated analysis runs.
 * Returns the total number of rows stored.
 */
export async function upsertComments(
  comments: YouTubeComment[],
  videoId: string
): Promise<number> {
  const datasetId = process.env.BIGQUERY_DATASET!;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const bq = getBigQueryClient();

  // Reconcile the complete result so rows removed by YouTube do not remain stale.
  await deleteCommentsForVideo(bq, projectId, datasetId, videoId);

  if (comments.length === 0) return 0;

  const fetchedAt = new Date().toISOString();
  const rows = flattenCommentsToRows(comments, videoId, fetchedAt);

  if (rows.length === 0) return 0;

  // BigQuery MERGE has a limit on the number of rows in the USING clause via VALUES.
  // We batch in chunks of 500 to stay safely under limits.
  const BATCH_SIZE = 500;
  let totalStored = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await mergeBatchComments(bq, projectId, datasetId, batch);
    totalStored += batch.length;
  }

  return totalStored;
}

async function deleteCommentsForVideo(
  bq: ReturnType<typeof getBigQueryClient>,
  projectId: string,
  datasetId: string,
  videoId: string
): Promise<void> {
  await bq.query({
    query: `
      DELETE FROM \`${projectId}.${datasetId}.${TABLE_NAMES.COMMENTS}\`
      WHERE video_id = @video_id
    `,
    params: { video_id: videoId },
    location: process.env.BIGQUERY_LOCATION,
  });
}

/**
 * Executes a MERGE DML for a batch of comment rows.
 * Uses a VALUES subquery so we can MERGE multiple rows at once.
 */
async function mergeBatchComments(
  bq: ReturnType<typeof getBigQueryClient>,
  projectId: string,
  datasetId: string,
  batch: CommentRow[]
): Promise<void> {
  // Build the VALUES list for the USING clause
  // Each row becomes a typed comment record including nullable author identity.
  const valueRows = batch.map((r) => {
    const parentId = r.parent_comment_id ? `'${escapeSql(r.parent_comment_id)}'` : 'NULL';
    const authorChannelId = r.author_channel_id ? `'${escapeSql(r.author_channel_id)}'` : 'NULL';
    const authorName = r.author_name ? `'${escapeSql(r.author_name)}'` : 'NULL';
    return (
      `('${escapeSql(r.comment_id)}','${escapeSql(r.video_id)}',${parentId},` +
      `'${escapeSql(r.comment_text)}',TIMESTAMP('${r.published_at}'),` +
      `${r.like_count},${r.reply_count},${r.is_reply},${authorChannelId},${authorName},TIMESTAMP('${r.fetched_at}'))`
    );
  });

  const query = `
    MERGE \`${projectId}.${datasetId}.${TABLE_NAMES.COMMENTS}\` AS target
    USING (
      SELECT * FROM UNNEST([
        STRUCT<
          comment_id STRING, video_id STRING, parent_comment_id STRING,
          comment_text STRING, published_at TIMESTAMP,
          like_count INT64, reply_count INT64, is_reply BOOL, author_channel_id STRING, author_name STRING, fetched_at TIMESTAMP
        >
        ${valueRows.join(',\n        ')}
      ])
    ) AS source
    ON target.comment_id = source.comment_id
    WHEN MATCHED THEN
      UPDATE SET
        video_id          = source.video_id,
        parent_comment_id = source.parent_comment_id,
        comment_text      = source.comment_text,
        published_at      = source.published_at,
        like_count        = source.like_count,
        reply_count       = source.reply_count,
        is_reply          = source.is_reply,
        author_channel_id = source.author_channel_id,
        author_name       = source.author_name,
        fetched_at        = source.fetched_at
    WHEN NOT MATCHED THEN
      INSERT (comment_id, video_id, parent_comment_id, comment_text,
              published_at, like_count, reply_count, is_reply, author_channel_id, author_name, fetched_at)
      VALUES (source.comment_id, source.video_id, source.parent_comment_id, source.comment_text,
              source.published_at, source.like_count, source.reply_count, source.is_reply, source.author_channel_id, source.author_name, source.fetched_at)
  `;

  await bq.query({
    query,
    location: process.env.BIGQUERY_LOCATION,
  });
}

/**
 * Escapes single quotes in strings for safe SQL literal embedding.
 * Only used internally for BigQuery STRUCT literals (not for user input exposed externally).
 */
function escapeSql(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
}

/**
 * Orchestrates the full persistence of a video analysis result.
 */
export async function persistAnalysisResult(
  video: YouTubeVideoMetadata,
  comments: YouTubeComment[]
): Promise<PersistenceResult> {
  await upsertVideo(video);
  const commentsStored = await upsertComments(comments, video.videoId);
  return {
    videoStored: true,
    commentsStored,
  };
}
