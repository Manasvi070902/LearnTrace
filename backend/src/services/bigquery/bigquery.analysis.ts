import { CommentAnalysis, getConfiguredGeminiModel } from '../gemini/comment-analysis.service';
import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';

export interface CommentAnalysisRow {
  comment_id: string;
  video_id: string;
  intent: CommentAnalysis['intent'];
  is_learning_signal: boolean;
  canonical_question: string | null;
  concept: string | null;
  confusion_strength: number;
  confidence: number;
  reason: string;
  model_name: string;
  prompt_version: string;
  analyzed_at: string;
}

export interface AnalysisRun {
  run_id: string;
  video_id: string;
  selected_comment_ids: string[];
  comments_selected: number;
  comments_cached: number;
  comments_submitted: number;
  gemini_requests: number;
  results_stored: number;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed';
}

export function mapAnalysisToRow(videoId: string, analysis: CommentAnalysis, analyzedAt = new Date().toISOString()): CommentAnalysisRow {
  return { comment_id: analysis.commentId, video_id: videoId, intent: analysis.intent, is_learning_signal: analysis.isLearningSignal, canonical_question: analysis.canonicalQuestion, concept: analysis.concept, confusion_strength: analysis.confusionStrength, confidence: analysis.confidence, reason: analysis.reason, model_name: getConfiguredGeminiModel(), prompt_version: 'v1', analyzed_at: analyzedAt };
}

/** Cached Phase 4 results are identified by comment and prompt version. */
export async function getAnalyzedCommentIds(videoId: string, promptVersion: string): Promise<Set<string>> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT comment_id FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.COMMENT_ANALYSIS}\` WHERE video_id = @video_id AND prompt_version = @prompt_version`,
    params: { video_id: videoId, prompt_version: promptVersion }, location: process.env.BIGQUERY_LOCATION,
  });
  return new Set((rows || []).map((row: { comment_id: string }) => row.comment_id));
}

export async function getDailyAnalysisUsage(): Promise<{ requestsToday: number; commentsAnalyzedToday: number; cacheHitsToday: number; lastModelUsed: string | null }> {
  const bq = getBigQueryClient();
  const [runRows] = await bq.query({
    query: `SELECT SUM(gemini_requests) AS requests_today, SUM(IF(status = 'completed', results_stored, 0)) AS comments_analyzed_today, SUM(IF(status = 'completed', comments_cached, 0)) AS cache_hits_today FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.ANALYSIS_RUNS}\` WHERE started_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)`,
    location: process.env.BIGQUERY_LOCATION,
  });
  const [modelRows] = await bq.query({
    query: `SELECT model_name FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.COMMENT_ANALYSIS}\` ORDER BY analyzed_at DESC LIMIT 1`,
    location: process.env.BIGQUERY_LOCATION,
  });
  const row = runRows?.[0] || {};
  return { requestsToday: Number(row.requests_today || 0), commentsAnalyzedToday: Number(row.comments_analyzed_today || 0), cacheHitsToday: Number(row.cache_hits_today || 0), lastModelUsed: modelRows?.[0]?.model_name || null };
}

export async function getCommentsForVideo(videoId: string): Promise<Array<{ comment_id: string; parent_comment_id: string | null; comment_text: string; is_reply: boolean; like_count: number; published_at: string }>> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT comment_id, parent_comment_id, comment_text, is_reply, like_count, CAST(published_at AS STRING) AS published_at FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.COMMENTS}\` WHERE video_id = @video_id ORDER BY published_at, comment_id`,
    params: { video_id: videoId }, location: process.env.BIGQUERY_LOCATION,
  });
  return rows as Array<{ comment_id: string; parent_comment_id: string | null; comment_text: string; is_reply: boolean; like_count: number; published_at: string }>;
}

export async function videoExists(videoId: string): Promise<boolean> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT video_id FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.VIDEOS}\` WHERE video_id = @video_id LIMIT 1`,
    params: { video_id: videoId }, location: process.env.BIGQUERY_LOCATION,
  });
  return rows.length > 0;
}

export async function insertAnalysisRun(run: AnalysisRun): Promise<void> {
  await getBigQueryClient().query({
    query: `INSERT INTO \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.ANALYSIS_RUNS}\` (run_id, video_id, selected_comment_ids, comments_selected, comments_cached, comments_submitted, gemini_requests, results_stored, started_at, completed_at, status) VALUES (@run_id, @video_id, @selected_comment_ids, @comments_selected, @comments_cached, @comments_submitted, @gemini_requests, @results_stored, TIMESTAMP(@started_at), NULL, @status)`,
    params: {
      run_id: run.run_id,
      video_id: run.video_id,
      selected_comment_ids: run.selected_comment_ids,
      comments_selected: run.comments_selected,
      comments_cached: run.comments_cached,
      comments_submitted: run.comments_submitted,
      gemini_requests: run.gemini_requests,
      results_stored: run.results_stored,
      started_at: run.started_at,
      status: run.status,
    },
    location: process.env.BIGQUERY_LOCATION,
  });
}

export async function completeAnalysisRun(run: AnalysisRun): Promise<void> {
  await getBigQueryClient().query({
    query: `UPDATE \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.ANALYSIS_RUNS}\` SET comments_cached = @comments_cached, comments_submitted = @comments_submitted, gemini_requests = @gemini_requests, results_stored = @results_stored, completed_at = TIMESTAMP(@completed_at), status = @status WHERE run_id = @run_id`,
    params: run, location: process.env.BIGQUERY_LOCATION,
  });
}

export async function getAnalysisForVideo(videoId: string, promptVersion: string, modelName: string): Promise<CommentAnalysisRow[]> {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT comment_id, video_id, intent, is_learning_signal, canonical_question, concept, confusion_strength, confidence, reason, model_name, prompt_version, CAST(analyzed_at AS STRING) AS analyzed_at FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.COMMENT_ANALYSIS}\` WHERE video_id = @video_id AND prompt_version = @prompt_version AND model_name = @model_name ORDER BY analyzed_at, comment_id`,
    params: { video_id: videoId, prompt_version: promptVersion, model_name: modelName }, location: process.env.BIGQUERY_LOCATION,
  });
  return rows as CommentAnalysisRow[];
}

export async function upsertCommentAnalysis(rows: CommentAnalysisRow[]): Promise<void> {
  if (!rows.length) return;
  const bq = getBigQueryClient();
  const table = `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.COMMENT_ANALYSIS}\``;
  await bq.query({
    query: `MERGE ${table} AS target USING UNNEST(@rows) AS source ON target.comment_id = source.comment_id AND target.prompt_version = source.prompt_version WHEN MATCHED THEN UPDATE SET video_id = source.video_id, intent = source.intent, is_learning_signal = source.is_learning_signal, canonical_question = source.canonical_question, concept = source.concept, confusion_strength = source.confusion_strength, confidence = source.confidence, reason = source.reason, model_name = source.model_name, analyzed_at = TIMESTAMP(source.analyzed_at) WHEN NOT MATCHED THEN INSERT (comment_id, video_id, intent, is_learning_signal, canonical_question, concept, confusion_strength, confidence, reason, model_name, prompt_version, analyzed_at) VALUES (source.comment_id, source.video_id, source.intent, source.is_learning_signal, source.canonical_question, source.concept, source.confusion_strength, source.confidence, source.reason, source.model_name, source.prompt_version, TIMESTAMP(source.analyzed_at))`,
    params: { rows }, location: process.env.BIGQUERY_LOCATION,
    types: {
      rows: [{
        comment_id: 'STRING',
        video_id: 'STRING',
        intent: 'STRING',
        is_learning_signal: 'BOOL',
        canonical_question: 'STRING',
        concept: 'STRING',
        confusion_strength: 'FLOAT64',
        confidence: 'FLOAT64',
        reason: 'STRING',
        model_name: 'STRING',
        prompt_version: 'STRING',
        analyzed_at: 'STRING',
      }],
    },
  });
}
