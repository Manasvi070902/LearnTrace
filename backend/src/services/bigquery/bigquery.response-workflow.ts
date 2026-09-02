import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';
import { ResponseResolutionSource, ResponseResolutionStatus, ResponseWorkflowItem } from '../response-workflow/response-workflow.service';

export interface StoredWorkflowState {
  workflow_id: string;
  video_id: string;
  resolution_status: ResponseResolutionStatus;
  resolution_source: ResponseResolutionSource;
  resolved_at: string | null;
  creator_reply_comment_id: string | null;
  community_reply_comment_id: string | null;
}

export interface StoredResponseDraft { draft_id: string; workflow_id: string; video_id: string; context_version: string; draft_text: string; model_name: string; created_at: string; }

const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
const options = { location: process.env.BIGQUERY_LOCATION };

export async function getWorkflowStates(videoId: string): Promise<StoredWorkflowState[]> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT workflow_id, video_id, resolution_status, resolution_source, CAST(resolved_at AS STRING) AS resolved_at, creator_reply_comment_id, community_reply_comment_id FROM ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} WHERE video_id = @video_id`,
    params: { video_id: videoId }, ...options,
  });
  return rows as StoredWorkflowState[];
}

/** Persists workflow identity and computed presentation fields without overwriting manual resolution. */
export async function upsertWorkflowItems(items: ResponseWorkflowItem[]): Promise<void> {
  if (!items.length) return;
  const now = new Date().toISOString();
  const rows = items.map((item) => ({
    workflow_id: item.workflowId, video_id: item.videoId, source_category: item.sourceCategory,
    source_insight_id: item.sourceInsightId, title: item.title, normalized_need: item.normalizedNeed,
    supporting_comment_ids: item.supportingCommentIds, priority: item.priority,
    resolution_status: item.resolutionStatus, resolution_source: item.resolutionSource,
    resolved_at: item.resolvedAt, creator_reply_comment_id: item.creatorReplyCommentId,
    community_reply_comment_id: item.communityReplyCommentId, suggested_response_type: item.suggestedResponseType,
    created_at: now, updated_at: now,
  }));
  await getBigQueryClient().query({
    query: `MERGE ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} target USING UNNEST(@rows) source
      ON target.workflow_id = source.workflow_id AND target.video_id = source.video_id
      WHEN MATCHED THEN UPDATE SET source_category = source.source_category, source_insight_id = source.source_insight_id, title = source.title, normalized_need = source.normalized_need, supporting_comment_ids = source.supporting_comment_ids, priority = source.priority, suggested_response_type = source.suggested_response_type, updated_at = TIMESTAMP(source.updated_at)
      WHEN NOT MATCHED THEN INSERT (workflow_id, video_id, source_category, source_insight_id, title, normalized_need, supporting_comment_ids, priority, resolution_status, resolution_source, resolved_at, creator_reply_comment_id, community_reply_comment_id, suggested_response_type, created_at, updated_at)
      VALUES (source.workflow_id, source.video_id, source.source_category, source.source_insight_id, source.title, source.normalized_need, source.supporting_comment_ids, source.priority, source.resolution_status, source.resolution_source, TIMESTAMP(source.resolved_at), source.creator_reply_comment_id, source.community_reply_comment_id, source.suggested_response_type, TIMESTAMP(source.created_at), TIMESTAMP(source.updated_at))`,
    params: { rows },
    types: { rows: [{ workflow_id: 'STRING', video_id: 'STRING', source_category: 'STRING', source_insight_id: 'STRING', title: 'STRING', normalized_need: 'STRING', supporting_comment_ids: ['STRING'], priority: 'STRING', resolution_status: 'STRING', resolution_source: 'STRING', resolved_at: 'STRING', creator_reply_comment_id: 'STRING', community_reply_comment_id: 'STRING', suggested_response_type: 'STRING', created_at: 'STRING', updated_at: 'STRING' }] },
    ...options,
  });
}

export async function setWorkflowResolution(videoId: string, workflowId: string, resolved: boolean): Promise<void> {
  await getBigQueryClient().query({
    query: `UPDATE ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} SET resolution_status = @status, resolution_source = @source, resolved_at = IF(@resolved, CURRENT_TIMESTAMP(), NULL), updated_at = CURRENT_TIMESTAMP() WHERE video_id = @video_id AND workflow_id = @workflow_id`,
    params: { video_id: videoId, workflow_id: workflowId, resolved, status: resolved ? 'resolved' : 'needs_response', source: resolved ? 'manual' : null }, ...options,
  });
}

export async function getCachedResponseDraft(videoId: string, workflowId: string, contextVersion: string): Promise<StoredResponseDraft | null> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT draft_id, workflow_id, video_id, context_version, draft_text, model_name, CAST(created_at AS STRING) AS created_at FROM ${table(TABLE_NAMES.RESPONSE_DRAFTS)} WHERE video_id = @video_id AND workflow_id = @workflow_id AND context_version = @context_version ORDER BY created_at DESC LIMIT 1`,
    params: { video_id: videoId, workflow_id: workflowId, context_version: contextVersion }, ...options,
  });
  return (rows?.[0] as StoredResponseDraft) || null;
}

export async function storeResponseDraft(draft: StoredResponseDraft): Promise<void> {
  await getBigQueryClient().query({
    query: `INSERT INTO ${table(TABLE_NAMES.RESPONSE_DRAFTS)} (draft_id, workflow_id, video_id, context_version, draft_text, model_name, created_at) VALUES (@draft_id, @workflow_id, @video_id, @context_version, @draft_text, @model_name, TIMESTAMP(@created_at))`,
    params: draft, ...options,
  });
}

export async function getResponseDraftUsageToday(): Promise<number> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT COUNT(*) AS requests_today FROM ${table(TABLE_NAMES.RESPONSE_DRAFTS)} WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)`,
    ...options,
  });
  return Number(rows?.[0]?.requests_today || 0);
}
