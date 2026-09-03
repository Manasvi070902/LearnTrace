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
  { name: 'author_channel_id', type: 'STRING',    mode: 'NULLABLE' },
  { name: 'author_name',       type: 'STRING',    mode: 'NULLABLE' },
  { name: 'author_profile_image_url', type: 'STRING', mode: 'NULLABLE' },
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

export const QUESTION_EMBEDDINGS_TABLE_SCHEMA: TableField[] = [
  { name: 'comment_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'canonical_question', type: 'STRING', mode: 'REQUIRED' },
  { name: 'concept', type: 'STRING', mode: 'NULLABLE' },
  { name: 'embedding', type: 'FLOAT64', mode: 'REPEATED' },
  { name: 'embedding_model', type: 'STRING', mode: 'REQUIRED' },
  { name: 'prompt_version', type: 'STRING', mode: 'REQUIRED' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const QUESTION_CLUSTERS_TABLE_SCHEMA: TableField[] = [
  { name: 'cluster_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'cluster_label', type: 'STRING', mode: 'REQUIRED' },
  { name: 'primary_concept', type: 'STRING', mode: 'REQUIRED' },
  { name: 'question_count', type: 'INT64', mode: 'REQUIRED' },
  { name: 'average_confusion_strength', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'average_confidence', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'representative_comment_ids', type: 'STRING', mode: 'REPEATED' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'clustering_version', type: 'STRING', mode: 'REQUIRED' },
];

export const QUESTION_CLUSTER_MEMBERS_TABLE_SCHEMA: TableField[] = [
  { name: 'cluster_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'comment_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'similarity_score', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const LEARNING_FRICTION_TABLE_SCHEMA: TableField[] = [
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'normalized_concept', type: 'STRING', mode: 'REQUIRED' },
  { name: 'learning_friction_score', type: 'FLOAT64', mode: 'NULLABLE' },
  { name: 'friction_level', type: 'STRING', mode: 'REQUIRED' },
  { name: 'question_count', type: 'INT64', mode: 'REQUIRED' },
  { name: 'cluster_count', type: 'INT64', mode: 'REQUIRED' },
  { name: 'volume_score', type: 'FLOAT64', mode: 'NULLABLE' },
  { name: 'confusion_score', type: 'FLOAT64', mode: 'NULLABLE' },
  { name: 'recurrence_score', type: 'FLOAT64', mode: 'NULLABLE' },
  { name: 'average_confusion_strength', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'evidence_count', type: 'INT64', mode: 'REQUIRED' },
  { name: 'calculated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'scoring_version', type: 'STRING', mode: 'REQUIRED' },
];

export const CONCEPT_DIAGNOSIS_TABLE_SCHEMA: TableField[] = [
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'concept', type: 'STRING', mode: 'REQUIRED' },
  { name: 'concept_key', type: 'STRING', mode: 'REQUIRED' },
  { name: 'learning_friction_score', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'friction_level', type: 'STRING', mode: 'REQUIRED' },
  { name: 'summary', type: 'STRING', mode: 'REQUIRED' },
  { name: 'possible_learning_gap', type: 'STRING', mode: 'REQUIRED' },
  { name: 'recommended_action', type: 'STRING', mode: 'REQUIRED' },
  { name: 'confidence', type: 'FLOAT64', mode: 'REQUIRED' },
  { name: 'evidence_cluster_ids', type: 'STRING', mode: 'REPEATED' },
  { name: 'evidence_fingerprint', type: 'STRING', mode: 'REQUIRED' },
  { name: 'model_name', type: 'STRING', mode: 'REQUIRED' },
  { name: 'diagnosis_version', type: 'STRING', mode: 'REQUIRED' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const RESPONSE_WORKFLOW_TABLE_SCHEMA: TableField[] = [
  { name: 'workflow_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'source_category', type: 'STRING', mode: 'REQUIRED' },
  { name: 'source_insight_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'title', type: 'STRING', mode: 'REQUIRED' },
  { name: 'normalized_need', type: 'STRING', mode: 'NULLABLE' },
  { name: 'supporting_comment_ids', type: 'STRING', mode: 'REPEATED' },
  { name: 'priority', type: 'STRING', mode: 'REQUIRED' },
  { name: 'resolution_status', type: 'STRING', mode: 'REQUIRED' },
  { name: 'resolution_source', type: 'STRING', mode: 'NULLABLE' },
  { name: 'resolved_at', type: 'TIMESTAMP', mode: 'NULLABLE' },
  { name: 'creator_reply_comment_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'community_reply_comment_id', type: 'STRING', mode: 'NULLABLE' },
  { name: 'suggested_response_type', type: 'STRING', mode: 'REQUIRED' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const RESPONSE_DRAFTS_TABLE_SCHEMA: TableField[] = [
  { name: 'draft_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'workflow_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'video_id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'context_version', type: 'STRING', mode: 'REQUIRED' },
  { name: 'draft_text', type: 'STRING', mode: 'REQUIRED' },
  { name: 'model_name', type: 'STRING', mode: 'REQUIRED' },
  { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
];

export const TABLE_NAMES = {
  VIDEOS: 'videos',
  COMMENTS: 'comments',
  COMMENT_ANALYSIS: 'comment_analysis',
  ANALYSIS_RUNS: 'analysis_runs',
  QUESTION_EMBEDDINGS: 'question_embeddings',
  QUESTION_CLUSTERS: 'question_clusters',
  QUESTION_CLUSTER_MEMBERS: 'question_cluster_members',
  LEARNING_FRICTION: 'learning_friction',
  CONCEPT_DIAGNOSIS: 'concept_diagnosis',
  RESPONSE_WORKFLOW: 'response_workflow',
  RESPONSE_DRAFTS: 'response_drafts',
} as const;
