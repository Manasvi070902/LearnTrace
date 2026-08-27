import { TableField } from '@google-cloud/bigquery';

/**
 * BigQuery table schema definitions.
 * These are the field descriptors used when creating tables.
 * No application logic lives here — pure configuration.
 */

export const VIDEOS_TABLE_SCHEMA: TableField[] = [
  { name: 'video_id',      type: 'STRING',    mode: 'REQUIRED' },
  { name: 'title',         type: 'STRING',    mode: 'REQUIRED' },
  { name: 'channel_id',    type: 'STRING',    mode: 'REQUIRED' },
  { name: 'channel_title', type: 'STRING',    mode: 'REQUIRED' },
  { name: 'published_at',  type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'view_count',    type: 'INT64',     mode: 'NULLABLE' },
  { name: 'duration',      type: 'STRING',    mode: 'NULLABLE' },
  { name: 'analyzed_at',   type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const COMMENTS_TABLE_SCHEMA: TableField[] = [
  { name: 'comment_id',        type: 'STRING',    mode: 'REQUIRED' },
  { name: 'video_id',          type: 'STRING',    mode: 'REQUIRED' },
  { name: 'parent_comment_id', type: 'STRING',    mode: 'NULLABLE' },
  { name: 'comment_text',      type: 'STRING',    mode: 'REQUIRED' },
  { name: 'published_at',      type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'like_count',        type: 'INT64',     mode: 'REQUIRED' },
  { name: 'reply_count',       type: 'INT64',     mode: 'REQUIRED' },
  { name: 'is_reply',          type: 'BOOL',      mode: 'REQUIRED' },
  { name: 'fetched_at',        type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const TABLE_NAMES = {
  VIDEOS: 'videos',
  COMMENTS: 'comments',
} as const;
