import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';
import { AnalyzeVideoResponse } from '../youtube/youtube.types';
import { fetchVideoMetadata } from '../youtube/youtube.service';

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

/**
 * Rehydrates an already stored video for read-only views. It never invokes AI.
 * Old rows predate youtube_comment_count, so they make one lightweight YouTube
 * metadata request to avoid presenting the stored row count as a false 100%.
 */
export async function getCachedVideoAnalysis(videoId: string): Promise<AnalyzeVideoResponse | null> {
  const datasetId = process.env.BIGQUERY_DATASET!;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const bq = getBigQueryClient();
  const [videoRows] = await bq.query({
    query: `SELECT video_id, title, channel_id, channel_title, CAST(published_at AS STRING) AS published_at, CAST(view_count AS STRING) AS view_count, duration, youtube_comment_count FROM \`${projectId}.${datasetId}.${TABLE_NAMES.VIDEOS}\` WHERE video_id = @video_id LIMIT 1`,
    params: { video_id: videoId }, location: process.env.BIGQUERY_LOCATION,
  });
  const video = videoRows?.[0];
  if (!video) return null;

  let reportedCommentCount: number | undefined = video.youtube_comment_count === null || video.youtube_comment_count === undefined
    ? undefined
    : Number(video.youtube_comment_count);

  if (reportedCommentCount === undefined) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (apiKey) {
      try {
        const metadata = await fetchVideoMetadata(videoId, apiKey);
        const count = Number(metadata.commentCount);
        if (Number.isFinite(count) && count >= 0) reportedCommentCount = count;
      } catch (error) {
        console.warn(`[BigQuery] Could not refresh YouTube comment count for cached video '${videoId}'.`, error);
      }
    }
  }

  const [commentRows] = await bq.query({
    query: `SELECT comment_id, parent_comment_id, comment_text, CAST(published_at AS STRING) AS published_at, like_count, reply_count, is_reply, author_name, author_profile_image_url FROM \`${projectId}.${datasetId}.${TABLE_NAMES.COMMENTS}\` WHERE video_id = @video_id ORDER BY published_at, comment_id`,
    params: { video_id: videoId }, location: process.env.BIGQUERY_LOCATION,
  });
  const topLevel = new Map<string, any>();
  const replies: any[] = [];
  for (const row of commentRows || []) {
    const normalized = {
      id: row.comment_id, videoId, authorDisplayName: row.author_name || 'Anonymous',
      authorProfileImageUrl: row.author_profile_image_url || undefined,
      textDisplay: row.comment_text, textOriginal: row.comment_text,
      likeCount: Number(row.like_count || 0), publishedAt: row.published_at,
      updatedAt: row.published_at,
    };
    if (row.is_reply) replies.push({ ...normalized, parentId: row.parent_comment_id });
    else topLevel.set(row.comment_id, { ...normalized, totalReplyCount: Number(row.reply_count || 0), replies: [] });
  }
  for (const reply of replies) topLevel.get(reply.parentId)?.replies.push(reply);
  const comments = [...topLevel.values()];
  const totalRepliesFetched = replies.length;
  return {
    status: 'success',
    video: {
      videoId: video.video_id, title: video.title, channelId: video.channel_id,
      channelTitle: video.channel_title, publishedAt: video.published_at,
      viewCount: video.view_count || undefined, duration: video.duration || undefined,
      commentCount: reportedCommentCount === undefined ? undefined : String(reportedCommentCount),
      // Thumbnails are not persisted in the current schema. Use YouTube's
      // standard derived URL without changing that schema.
      thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
    },
    totalCommentsFetched: comments.length,
    totalRepliesFetched,
    totalRepliesExpected: replies.length,
    missingReplies: 0,
    // Do not substitute our stored count here. That made incomplete cached
    // retrievals appear as 100% coverage (for example 192/192 instead of 192/194).
    youtubeCommentCount: reportedCommentCount,
    missingRecords: reportedCommentCount === undefined
      ? undefined
      : Math.max(0, reportedCommentCount - (comments.length + totalRepliesFetched)),
    comments,
    commentsDisabled: false,
  };
}
