import { YouTubeVideoMetadata, YouTubeComment, YouTubeReply } from '../youtube/youtube.types';

/**
 * BigQuery row type for the `videos` table.
 */
export interface VideoRow {
  video_id: string;
  title: string;
  channel_id: string;
  channel_title: string;
  published_at: string; // ISO 8601 string — BigQuery TIMESTAMP accepts this format
  view_count: number | null;
  duration: string | null;
  analyzed_at: string;
}

/**
 * BigQuery row type for the `comments` table.
 * Used for both top-level comments and replies.
 */
export interface CommentRow {
  comment_id: string;
  video_id: string;
  parent_comment_id: string | null;
  comment_text: string;
  published_at: string;
  like_count: number;
  reply_count: number;
  is_reply: boolean;
  fetched_at: string;
}

/**
 * Maps a YouTubeVideoMetadata object to a BigQuery `videos` table row.
 * analyzedAt defaults to current UTC time if not provided.
 */
export function mapVideoToRow(
  video: YouTubeVideoMetadata,
  analyzedAt: string = new Date().toISOString()
): VideoRow {
  return {
    video_id: video.videoId,
    title: video.title,
    channel_id: video.channelId,
    channel_title: video.channelTitle,
    published_at: video.publishedAt,
    view_count: video.viewCount !== undefined ? parseInt(video.viewCount, 10) : null,
    duration: video.duration ?? null,
    analyzed_at: analyzedAt,
  };
}

/**
 * Maps a top-level YouTubeComment to a BigQuery `comments` table row.
 * is_reply = false, parent_comment_id = null.
 */
export function mapCommentToRow(
  comment: YouTubeComment,
  videoId: string,
  fetchedAt: string = new Date().toISOString()
): CommentRow {
  return {
    comment_id: comment.id,
    video_id: videoId,
    parent_comment_id: null,
    comment_text: comment.textOriginal || comment.textDisplay,
    published_at: comment.publishedAt,
    like_count: comment.likeCount ?? 0,
    reply_count: comment.totalReplyCount ?? 0,
    is_reply: false,
    fetched_at: fetchedAt,
  };
}

/**
 * Maps a YouTubeReply to a BigQuery `comments` table row.
 * is_reply = true, parent_comment_id = the parent thread ID.
 */
export function mapReplyToRow(
  reply: YouTubeReply,
  videoId: string,
  parentCommentId: string,
  fetchedAt: string = new Date().toISOString()
): CommentRow {
  return {
    comment_id: reply.id,
    video_id: videoId,
    parent_comment_id: parentCommentId,
    comment_text: reply.textOriginal || reply.textDisplay,
    published_at: reply.publishedAt,
    like_count: reply.likeCount ?? 0,
    reply_count: 0, // replies don't have reply counts
    is_reply: true,
    fetched_at: fetchedAt,
  };
}

/**
 * Flattens a list of top-level comments (including their replies) into
 * a single array of CommentRow objects ready for BigQuery insertion.
 */
export function flattenCommentsToRows(
  comments: YouTubeComment[],
  videoId: string,
  fetchedAt: string = new Date().toISOString()
): CommentRow[] {
  const rows: CommentRow[] = [];
  for (const comment of comments) {
    rows.push(mapCommentToRow(comment, videoId, fetchedAt));
    for (const reply of comment.replies ?? []) {
      rows.push(mapReplyToRow(reply, videoId, comment.id, fetchedAt));
    }
  }
  return rows;
}
