import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { PROMPT_VERSION } from '../prompts/comment-analysis.prompt';
import { analyzeComments, getConfiguredGeminiModel, splitCommentBatches, GEMINI_BATCH_SIZE } from '../services/gemini/comment-analysis.service';
import { AnalysisRun, completeAnalysisRun, getAnalysisForVideo, getAnalyzedCommentIds, getCommentsForVideo, getDailyAnalysisUsage, insertAnalysisRun, mapAnalysisToRow, upsertCommentAnalysis, videoExists } from '../services/bigquery/bigquery.analysis';
import { analyzeFrictionForVideo } from '../services/bigquery/bigquery.friction.orchestration';

const router = Router();
const activeVideos = new Set<string>();
let activeAnalysis = false;
let lastRequestAt = 0;

export interface SourceComment { comment_id: string; comment_text: string; is_reply: boolean; like_count: number; published_at: string; }

export interface AnalysisCoveragePlan {
  availableConversations: number;
  alreadyAnalyzed: number;
  targetAnalyzed: number;
  newConversationsRequired: number;
  selected: SourceComment[];
}

function getTargetAnalyzedConversations(): number {
  return Math.max(0, Math.floor(Number(process.env.GEMINI_TARGET_ANALYZED_CONVERSATIONS || 200)));
}

export function buildAnalysisCoveragePlan(
  comments: SourceComment[],
  analyzedCommentIds: Set<string>,
  targetAnalyzed = getTargetAnalyzedConversations()
): AnalysisCoveragePlan {
  const unanalyzed = comments.filter((comment) => !analyzedCommentIds.has(comment.comment_id));
  const newConversationsRequired = Math.max(0, targetAnalyzed - analyzedCommentIds.size);
  return {
    availableConversations: comments.length,
    alreadyAnalyzed: analyzedCommentIds.size,
    targetAnalyzed,
    newConversationsRequired,
    selected: selectFromBuckets(unanalyzed, Math.min(newConversationsRequired, unanalyzed.length)),
  };
}

function selectFromBuckets(comments: SourceComment[], limit: number): SourceComment[] {
  const sorted = [...comments].sort((a, b) => a.published_at.localeCompare(b.published_at) || a.comment_id.localeCompare(b.comment_id));
  const buckets = new Map<string, SourceComment[]>();
  for (const comment of sorted) {
    const bucket = `${comment.is_reply ? 'reply' : 'top'}:${comment.like_count > 0 ? 'liked' : 'unliked'}`;
    buckets.set(bucket, [...(buckets.get(bucket) || []), comment]);
  }
  const selected: SourceComment[] = [];
  while (selected.length < limit && buckets.size) {
    for (const [key, bucket] of buckets) {
      const next = bucket.shift();
      if (next) selected.push(next);
      if (!bucket.length) buckets.delete(key);
      if (selected.length === limit) break;
    }
  }
  return selected;
}

router.post('/video/:videoId/learning-signals', async (req: Request, res: Response) => {
  const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : '';
  if (!videoId) return res.status(400).json({ status: 'error', error: 'Missing videoId.' });

  try {
    if (!(await videoExists(videoId))) return res.status(404).json({ status: 'error', error: 'Video was not found in BigQuery.' });
    if (activeAnalysis || activeVideos.has(videoId)) return res.status(429).json({ status: 'error', error: 'An analysis is already running. Try again later.' });
    activeVideos.add(videoId);
    activeAnalysis = true;
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const available = await getCommentsForVideo(videoId);
    const allCached = await getAnalyzedCommentIds(videoId, PROMPT_VERSION);
    const plan = buildAnalysisCoveragePlan(available, allCached);
    const selected = plan.selected;
    const pending = selected;
    const requests = splitCommentBatches(pending.map((comment) => ({ commentId: comment.comment_id, text: comment.comment_text })), Number(process.env.GEMINI_BATCH_SIZE || GEMINI_BATCH_SIZE)).length;
    const usage = await getDailyAnalysisUsage();
    const dailyRequestLimit = Math.max(0, Number(process.env.GEMINI_MAX_REQUESTS_PER_DAY || 10));
    if (requests > Math.max(0, dailyRequestLimit - usage.requestsToday)) {
      activeVideos.delete(videoId); activeAnalysis = false;
      return res.status(429).json({ status: 'error', error: 'Additional AI analysis could not be completed because the configured development AI limit was reached.' });
    }
    console.log(`[Learning Signals] LearnTrace AI Pre-flight\nAvailable conversations: ${plan.availableConversations}\nAlready analyzed: ${plan.alreadyAnalyzed}\nTarget: ${plan.targetAnalyzed}\nNew conversations required: ${plan.newConversationsRequired}\nSelected: ${selected.length}\nBatch size: ${process.env.GEMINI_BATCH_SIZE || GEMINI_BATCH_SIZE}\nEstimated Gemini requests: ${requests}\nRemaining application request budget: ${Math.max(0, dailyRequestLimit - usage.requestsToday)}`);
    const run: AnalysisRun = { run_id: runId, video_id: videoId, selected_comment_ids: selected.map((comment) => comment.comment_id), comments_selected: selected.length, comments_cached: 0, comments_submitted: pending.length, gemini_requests: requests, results_stored: 0, started_at: startedAt, completed_at: null, status: 'running' };
    await insertAnalysisRun(run);
    let requestsMade = 0;
    let fresh = [];
    try {
      fresh = pending.length ? await analyzeComments(pending.map((comment) => ({ commentId: comment.comment_id, text: comment.comment_text })), async () => {
        const minInterval = 60_000 / Math.max(1, Number(process.env.GEMINI_MAX_REQUESTS_PER_MINUTE || 2));
        const wait = minInterval - (Date.now() - lastRequestAt);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
        lastRequestAt = Date.now();
        requestsMade += 1;
      }, async (batchResults) => {
        await upsertCommentAnalysis(batchResults.map((analysis) => mapAnalysisToRow(videoId, analysis)));
        run.results_stored += batchResults.length;
      }) : [];
      run.gemini_requests = requestsMade;
      run.status = 'completed';
      run.completed_at = new Date().toISOString();
      await completeAnalysisRun(run);
    } catch (error) {
      run.gemini_requests = requestsMade;
      run.status = 'failed'; run.completed_at = new Date().toISOString();
      await completeAnalysisRun(run).catch(() => undefined);
      throw error;
    } finally { activeVideos.delete(videoId); activeAnalysis = false; }
    const analyses = await getAnalysisForVideo(videoId, PROMPT_VERSION, getConfiguredGeminiModel());
    const frictionReport = await analyzeFrictionForVideo(videoId);
    return res.json({
      status: 'success', videoId, availableComments: plan.availableConversations, alreadyAnalyzed: plan.alreadyAnalyzed,
      targetAnalyzed: plan.targetAnalyzed, newConversationsRequired: plan.newConversationsRequired, commentsSelected: selected.length,
      commentsCached: 0, commentsSubmitted: pending.length, geminiRequests: requests,
      resultsStored: fresh.length, commentsAnalyzed: analyses.length,
      learningSignals: analyses.filter((analysis) => analysis.is_learning_signal).length,
      intentCounts: analyses.reduce<Record<string, number>>((counts, analysis) => {
        counts[analysis.intent] = (counts[analysis.intent] || 0) + 1;
        return counts;
      }, {}), analyses,
      frictionReport: {
        availableComments: frictionReport.availableComments,
        aiAnalyzedComments: frictionReport.aiAnalyzedComments,
        learningSignals: frictionReport.learningSignals,
        canonicalQuestions: frictionReport.canonicalQuestions,
        embeddingsGenerated: frictionReport.embeddingsGenerated,
        embeddingsCached: frictionReport.embeddingsCached,
        questionClusters: frictionReport.questionClusters,
        normalizedConcepts: frictionReport.normalizedConcepts,
        conceptsWithEvidence: frictionReport.conceptsWithEvidence,
        conceptsInsufficientEvidence: frictionReport.conceptsInsufficientEvidence,
        technicalBarriers: frictionReport.technicalBarriers,
      },
      confusionMap: frictionReport.frictionScores,
    });
  } catch (error) {
    activeVideos.delete(videoId);
    activeAnalysis = false;
    console.error(`[Learning Signals] Analysis failed for '${videoId}':`, error);
    const message = error instanceof Error ? error.message : 'Learning-signal analysis failed.';
    const quotaFailure = /quota|billing credits|exhausted/i.test(message);
    return res.status(message.includes('GEMINI_API_KEY') || quotaFailure ? 503 : 500).json({ status: 'error', error: message });
  }
});

/** Read cached Phase 4 results for development validation; never calls Gemini. */
router.get('/video/:videoId/learning-signals', async (req: Request, res: Response) => {
  const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : '';
  if (!videoId) return res.status(400).json({ status: 'error', error: 'Missing videoId.' });
  try {
    const analyses = await getAnalysisForVideo(videoId, PROMPT_VERSION, getConfiguredGeminiModel());
    return res.json({
      status: 'success',
      videoId,
      commentsAnalyzed: analyses.length,
      learningSignals: analyses.filter((analysis) => analysis.is_learning_signal).length,
      analyses,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not retrieve cached learning signals.';
    return res.status(500).json({ status: 'error', error: message });
  }
});

router.get('/usage', async (_req: Request, res: Response) => {
  try {
    const usage = await getDailyAnalysisUsage();
    return res.json({ ...usage, configuredDailyLimit: Number(process.env.GEMINI_MAX_REQUESTS_PER_DAY || 10) });
  } catch {
    return res.status(500).json({ status: 'error', error: 'Unable to retrieve development AI usage.' });
  }
});

export default router;
