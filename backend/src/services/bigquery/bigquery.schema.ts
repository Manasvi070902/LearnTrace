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

export const COMMENT_ANALYSIS_TABLE_SCHEMA: TableField[] = [
  { name: 'comment_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'intent', type: 'STRING', mode: 'REQUIRED' },
  { name: 'is_learning_signal', type: 'BOOL', mode: 'REQUIRED' },
  { name: 'canonical_question', type: 'STRING', mode: 'NULLABLE' },
  { name: 'concept', type: 'STRING', mode: 'NULLABLE' },
  { name: 'confusion_strength', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'confidence', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'reason', type: 'STRING', mode: 'REQUIRED' },
  { name: 'model_name', type: 'STRING', mode: 'REQUIRED' },
  { name: 'prompt_version', type: 'STRING', mode: 'REQUIRED' },
  { name: 'analyzed_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const ANALYSIS_RUNS_TABLE_SCHEMA: TableField[] = [
  { name: 'run_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'selected_comment_ids', type: 'STRING', mode: 'REPEATED' },
  { name: 'comments_selected', type: 'INT64', mode: 'REQUIRED' },
  { name: 'comments_cached', type: 'INT64', mode: 'REQUIRED' },
  { name: 'comments_submitted', type: 'INT64', mode: 'REQUIRED' },
  { name: 'gemini_requests', type: 'INT64', mode: 'REQUIRED' },
  { name: 'results_stored', type: 'INT64', mode: 'REQUIRED' },
  { name: 'started_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'completed_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  { name: 'status', type: 'STRING', mode: 'REQUIRED' },
];

export const TABLE_NAMES = {
  VIDEOS: 'videos',
  COMMENTS: 'comments',
  COMMENT_ANALYSIS: 'comment_analysis',
  ANALYSIS_RUNS: 'analysis_runs',
} as const;
