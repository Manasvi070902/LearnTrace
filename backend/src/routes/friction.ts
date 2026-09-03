/**
 * Friction Analysis API Route
 *
 * Endpoints:
 * POST /api/analyze/video/:videoId/friction - Compute or refresh friction analysis
 * GET /api/analyze/video/:videoId/friction - Retrieve cached friction analysis
 */

import { Router, Request, Response } from 'express';
import { getAnalysisForVideo, getCommentsForVideo, getVideoChannelId, videoExists } from '../services/bigquery/bigquery.analysis';
import { analyzeFrictionForVideo, getFrictionAnalysisForVideo } from '../services/bigquery/bigquery.friction.orchestration';
import { getVideoClusters, getClusterEvidence } from '../services/bigquery/bigquery.friction';
import { normalizeConcept } from '../services/clustering/concept-normalizer';
import { CLUSTERING_VERSION } from '../services/clustering/clustering.service';
import { getConfiguredDiagnosisModel, buildEvidencePacket, fingerprintEvidence, generateAiInterpretation, isInterpretationEligible, PHASE6_DIAGNOSIS_VERSION } from '../services/phase6/interpretation.service';
import { getCachedDiagnosis, storeDiagnosis } from '../services/bigquery/bigquery.diagnosis';
import { buildCreatorActions } from '../services/creator-actions/creator-actions.service';
import { PROMPT_VERSION } from '../prompts/comment-analysis.prompt';
import { getConfiguredGeminiModel } from '../services/gemini/comment-analysis.service';
import { buildCreatorReplyAssessmentPrompt, buildCreatorReplyContexts, buildResponseWorkflowItems, buildDraftPrompt, creatorReplyAssessmentFingerprint, draftContextFingerprint, newDraftId, RESPONSE_CONTEXT_VERSION, ResponseDraftMode, ResponseWorkflowItem, validateCreatorReplyAssessment, validateDraft } from '../services/response-workflow/response-workflow.service';
import { getCachedCreatorReplyAssessment, getCachedDraftContextKeys, getCachedResponseDraft, getCreatorReplyAssessmentUsageToday, getResponseDraftUsageToday, getWorkflowStates, markWorkflowCreatorReplyAnswered, setWorkflowResolution, storeCreatorReplyAssessment, storeResponseDraft, upsertWorkflowItems } from '../services/bigquery/bigquery.response-workflow';
import { getDailyAnalysisUsage } from '../services/bigquery/bigquery.analysis';

const router = Router();

async function getWorkflowItems(videoId: string): Promise<ResponseWorkflowItem[]> {
  const [analyses, comments, frictionScores, clusterRows, creatorChannelId] = await Promise.all([
    getAnalysisForVideo(videoId, PROMPT_VERSION, getConfiguredGeminiModel()),
    getCommentsForVideo(videoId), getFrictionAnalysisForVideo(videoId),
    getVideoClusters(videoId, CLUSTERING_VERSION), getVideoChannelId(videoId),
  ]);
  const commentsById = new Map(comments.map((comment) => [comment.comment_id, comment]));
  const clusters = await Promise.all(clusterRows.map(async (cluster) => ({
    ...cluster,
    evidence: (await getClusterEvidence(cluster.cluster_id)).map((item) => ({
      ...item,
      parent_comment_text: commentsById.get(item.comment_id)?.parent_comment_id
        ? commentsById.get(commentsById.get(item.comment_id)!.parent_comment_id!)?.comment_text || null : null,
    })),
  })));
  const diagnoses = new Map();
  for (const score of frictionScores || []) {
    const concept = score.normalized_concept;
    const conceptClusters = clusters.filter((cluster) => normalizeConcept(cluster.primary_concept) === concept);
    if (!isInterpretationEligible(score, conceptClusters)) continue;
    const packet = buildEvidencePacket(videoId, concept, score, conceptClusters);
    const cached = await getCachedDiagnosis(videoId, concept, getConfiguredDiagnosisModel(), fingerprintEvidence(packet));
    if (cached) diagnoses.set(concept, cached);
  }
  const actions = buildCreatorActions(analyses.map((analysis) => {
    const source = commentsById.get(analysis.comment_id);
    return { ...analysis, comment_text: source?.comment_text || '', is_reply: source?.is_reply || false,
      parent_comment_text: source?.parent_comment_id ? commentsById.get(source.parent_comment_id)?.comment_text || null : null };
  }), clusters, frictionScores || [], diagnoses);
  return buildResponseWorkflowItems(videoId, actions.creatorActions, comments, creatorChannelId);
}

async function generateResponseDraft(item: ResponseWorkflowItem, mode: ResponseDraftMode): Promise<{ text: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');
  const model = process.env.GEMINI_RESPONSE_MODEL?.trim() || getConfiguredDiagnosisModel();
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({ model, contents: buildDraftPrompt(item, mode, item.phase6Interpretation), config: { temperature: 0.3 } });
  return { text: validateDraft(response.text || ''), model };
}

function parseJsonResponse(text: string, description: string): unknown {
  try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new Error(`Gemini returned malformed ${description} JSON.`); }
}

async function assessCreatorReply(item: ResponseWorkflowItem): Promise<{ outcome: 'answered' | 'partial' | 'not_answered'; confidence: number; reason: string; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');
  if (!item.creatorReplyText?.trim()) throw new Error('No creator reply is available to assess.');
  const model = process.env.GEMINI_RESPONSE_MODEL?.trim() || getConfiguredDiagnosisModel();
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({ model, contents: buildCreatorReplyAssessmentPrompt(item), config: { responseMimeType: 'application/json', temperature: 0 } });
  return { ...validateCreatorReplyAssessment(parseJsonResponse(response.text || '', 'reply assessment')), model };
}

function safeAiError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : '';
  if (/503|unavailable|high demand|temporar/i.test(message)) return 'AI is temporarily busy. Please try again in a minute.';
  if (/429|resource.?exhausted|rate limit|quota/i.test(message)) return 'The AI request limit has been reached. Please try again later.';
  if (/api.?key|authentication|permission/i.test(message)) return 'The AI service is not configured correctly.';
  return fallback;
}

/**
 * POST /api/analyze/video/:videoId/friction
 *
 * Compute or refresh friction analysis for a video.
 * Reads from existing Phase 4 cached analyses.
 * Generates missing embeddings; uses cached embeddings where available.
 * Clusters, normalizes, scores, and stores results.
 */
router.post('/video/:videoId/friction', async (req: Request, res: Response) => {
  const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : '';

  if (!videoId) {
    return res.status(400).json({ status: 'error', error: 'Missing videoId.' });
  }

  try {
    // Verify video exists
    if (!(await videoExists(videoId))) {
      return res.status(404).json({
        status: 'error',
        error: `Video '${videoId}' was not found in BigQuery.`,
      });
    }

    // Run friction analysis
    const report = await analyzeFrictionForVideo(videoId);

    return res.json({
      status: 'success',
      videoId,
      report: {
        availableComments: report.availableComments,
        aiAnalyzedComments: report.aiAnalyzedComments,
        learningSignals: report.learningSignals,
        canonicalQuestions: report.canonicalQuestions,
        embeddingsGenerated: report.embeddingsGenerated,
        embeddingsCached: report.embeddingsCached,
        questionClusters: report.questionClusters,
        normalizedConcepts: report.normalizedConcepts,
        conceptsWithEvidence: report.conceptsWithEvidence,
        conceptsInsufficientEvidence: report.conceptsInsufficientEvidence,
        technicalBarriers: report.technicalBarriers,
        curriculumNavigationSignals: report.curriculumNavigationSignals,
      },
      confusionMap: report.frictionScores,
    });
  } catch (error) {
    console.error(`[Friction API] Error analyzing video '${videoId}':`, error);
    const message = error instanceof Error ? error.message : 'Friction analysis failed.';
    return res.status(500).json({
      status: 'error',
      error: message,
      videoId,
    });
  }
});

/**
 * GET /api/analyze/video/:videoId/friction
 *
 * Retrieve cached friction analysis without recomputation.
 * Returns 404 if no analysis exists for this video.
 */
router.get('/video/:videoId/friction', async (req: Request, res: Response) => {
  const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : '';

  if (!videoId) {
    return res.status(400).json({ status: 'error', error: 'Missing videoId.' });
  }

  try {
    const scores = await getFrictionAnalysisForVideo(videoId);

    if (!scores) {
      return res.status(404).json({
        status: 'error',
        error: `No friction analysis available for video '${videoId}'. Run POST first.`,
        videoId,
      });
    }

    return res.json({
      status: 'success',
      videoId,
      confusionMap: scores,
    });
  } catch (error) {
    console.error(`[Friction API] Error retrieving analysis for '${videoId}':`, error);
    return res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve friction analysis.',
      videoId,
    });
  }
});

/**
 * GET /api/analyze/video/:videoId/friction/concept/:concept/clusters
 *
 * Retrieve clusters for a specific concept (used for Concept Detail view).
 */
router.get('/video/:videoId/friction/concept/:concept/clusters', async (req: Request, res: Response) => {
  const videoId = typeof req.params.videoId === 'string' ? req.params.videoId : '';
  const concept = typeof req.params.concept === 'string' ? req.params.concept : '';

  if (!videoId || !concept) {
    return res.status(400).json({ status: 'error', error: 'Missing videoId or concept.' });
  }

  try {
    // Get all clusters for the video
    const allClusters = await getVideoClusters(videoId, CLUSTERING_VERSION);
    const conceptClusters = allClusters.filter((c) => normalizeConcept(c.primary_concept) === concept);

    if (!conceptClusters.length) {
      return res.status(404).json({
        status: 'error',
        error: `No clusters found for concept '${concept}'.`,
      });
    }

    // For each cluster, get member evidence
    const clustersWithEvidence = await Promise.all(
      conceptClusters.map(async (cluster) => {
        const evidence = await getClusterEvidence(cluster.cluster_id);
        return {
          ...cluster,
          evidence,
        };
      })
    );

    return res.json({
      status: 'success',
      videoId,
      concept,
      clusters: clustersWithEvidence,
    });
  } catch (error) {
    console.error(`[Friction API] Error retrieving clusters for '${videoId}' concept '${concept}':`, error);
    return res.status(500).json({
      status: 'error',
      error: 'Failed to retrieve clusters.',
      videoId,
      concept,
    });
  }
});

async function getInterpretationContext(videoId: string, concept: string) {
  const scores = await getFrictionAnalysisForVideo(videoId);
  const score = scores?.find((item) => item.normalized_concept === concept);
  if (!score) return null;
  const clusters = (await getVideoClusters(videoId, CLUSTERING_VERSION))
    .filter((cluster) => normalizeConcept(cluster.primary_concept) === concept);
  return { score, clusters };
}

const insufficientInterpretation = () => ({
  eligible: false,
  message: 'Not enough repeated evidence for an AI interpretation yet.',
  supportingText: 'LearnTrace needs recurring evidence of the same learning difficulty before suggesting a learning gap or educational action.',
});

router.get('/video/:videoId/concepts/:concept/diagnosis', async (req: Request, res: Response) => {
  try {
    const videoId = String(req.params.videoId);
    const concept = String(req.params.concept);
    const context = await getInterpretationContext(videoId, concept);
    if (!context) return res.status(404).json({ status: 'error', error: 'Concept was not found in stored Phase 5 data.' });
    if (!isInterpretationEligible(context.score, context.clusters)) return res.json({ status: 'success', ...insufficientInterpretation() });
    const clusters = await Promise.all(context.clusters.map(async (cluster) => ({ ...cluster, evidence: await getClusterEvidence(cluster.cluster_id) })));
    const packet = buildEvidencePacket(videoId, concept, context.score, clusters);
    const cached = await getCachedDiagnosis(videoId, concept, getConfiguredDiagnosisModel(), fingerprintEvidence(packet));
    return res.json({ status: 'success', eligible: true, cached: Boolean(cached), interpretation: cached || null, evidence: packet });
  } catch (error) {
    return res.status(500).json({ status: 'error', error: error instanceof Error ? error.message : 'Could not retrieve AI interpretation.' });
  }
});

router.post('/video/:videoId/concepts/:concept/diagnosis', async (req: Request, res: Response) => {
  try {
    const videoId = String(req.params.videoId);
    const concept = String(req.params.concept);
    const context = await getInterpretationContext(videoId, concept);
    if (!context) return res.status(404).json({ status: 'error', error: 'Concept was not found in stored Phase 5 data.' });
    if (!isInterpretationEligible(context.score, context.clusters)) return res.json({ status: 'success', ...insufficientInterpretation() });
    const clusters = await Promise.all(context.clusters.map(async (cluster) => ({ ...cluster, evidence: await getClusterEvidence(cluster.cluster_id) })));
    const packet = buildEvidencePacket(videoId, concept, context.score, clusters);
    const fingerprint = fingerprintEvidence(packet);
    const modelName = getConfiguredDiagnosisModel();
    const cached = await getCachedDiagnosis(videoId, concept, modelName, fingerprint);
    if (cached) return res.json({ status: 'success', eligible: true, cached: true, interpretation: cached, evidence: packet });
    const interpretation = await generateAiInterpretation(packet);
    const row = { ...interpretation, video_id: videoId, concept, concept_key: concept, learning_friction_score: context.score.learning_friction_score!, friction_level: context.score.friction_level, evidence_fingerprint: fingerprint, model_name: modelName, diagnosis_version: PHASE6_DIAGNOSIS_VERSION, created_at: new Date().toISOString() };
    await storeDiagnosis(row);
    return res.json({ status: 'success', eligible: true, cached: false, interpretation: row, evidence: packet });
  } catch {
    return res.status(503).json({ status: 'error', error: 'AI interpretation is temporarily unavailable.' });
  }
});

/**
 * GET /api/analyze/video/:videoId/creator-actions
 *
 * Builds a creator-facing overview from cached Phase 4/5/6A records only.
 * This endpoint never generates Gemini content or embeddings.
 */
router.get('/video/:videoId/creator-actions', async (req: Request, res: Response) => {
  try {
    const videoId = String(req.params.videoId);
    const [analyses, comments, frictionScores, clusterRows, creatorChannelId] = await Promise.all([
      getAnalysisForVideo(videoId, PROMPT_VERSION, getConfiguredGeminiModel()),
      getCommentsForVideo(videoId),
      getFrictionAnalysisForVideo(videoId),
      getVideoClusters(videoId, CLUSTERING_VERSION),
      getVideoChannelId(videoId),
    ]);
    const commentsById = new Map(comments.map((comment) => [comment.comment_id, comment]));
    const clusters = await Promise.all(clusterRows.map(async (cluster) => ({
      ...cluster,
      evidence: (await getClusterEvidence(cluster.cluster_id)).map((item) => {
        const source = commentsById.get(item.comment_id);
        return {
          ...item,
          parent_comment_text: source?.parent_comment_id
            ? commentsById.get(source.parent_comment_id)?.comment_text || null
            : null,
        };
      }),
    })));

    // Reuse an existing valid Phase 6A interpretation when available. There is
    // deliberately no generation path in this read-only endpoint.
    const diagnoses = new Map();
    for (const score of frictionScores || []) {
      const conceptClusters = clusters.filter((cluster) => normalizeConcept(cluster.primary_concept) === score.normalized_concept);
      if (!isInterpretationEligible(score, conceptClusters)) continue;
      const packet = buildEvidencePacket(videoId, score.normalized_concept, score, conceptClusters);
      const cached = await getCachedDiagnosis(videoId, score.normalized_concept, getConfiguredDiagnosisModel(), fingerprintEvidence(packet));
      if (cached) diagnoses.set(score.normalized_concept, cached);
    }

    const result = buildCreatorActions(
      analyses.map((analysis) => {
        const source = commentsById.get(analysis.comment_id);
        return {
          ...analysis,
          comment_text: source?.comment_text || '',
          is_reply: source?.is_reply || false,
          parent_comment_text: source?.parent_comment_id
            ? commentsById.get(source.parent_comment_id)?.comment_text || null
            : null,
        };
      }),
      clusters,
      frictionScores || [],
      diagnoses,
    );
    return res.json({
      status: 'success',
      videoId,
      ...result,
      creatorReplies: buildCreatorReplyContexts(result.creatorActions, comments, creatorChannelId),
      // Retained for development/data-quality inspection; the normal creator
      // UI intentionally does not foreground non-actionable noise.
      debug: { commentAccounting: result.audienceOverview },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', error: error instanceof Error ? error.message : 'Could not load creator actions.' });
  }
});

/**
 * A persisted creator workflow over existing actionable insights. Reading this
 * endpoint does not call Gemini or reclassify any comment.
 */
router.get('/video/:videoId/response-workflow', async (req: Request, res: Response) => {
  try {
    const videoId = String(req.params.videoId);
    if (!(await videoExists(videoId))) return res.status(404).json({ status: 'error', error: 'Video was not found.' });
    const computed = await getWorkflowItems(videoId);
    await upsertWorkflowItems(computed);
    const states = new Map((await getWorkflowStates(videoId)).map((state) => [state.workflow_id, state]));
    const statefulItems = computed.map((item) => {
      const state = states.get(item.workflowId);
      return state ? { ...item, resolutionStatus: state.resolution_status, resolutionSource: state.resolution_source, resolvedAt: state.resolved_at, creatorReplyCommentId: state.creator_reply_comment_id || item.creatorReplyCommentId, communityReplyCommentId: state.community_reply_comment_id } : item;
    });
    const [cachedDraftKeys, replyAssessments] = await Promise.all([
      getCachedDraftContextKeys(videoId, statefulItems.map((item) => item.workflowId)),
      Promise.all(statefulItems.map(async (item) => {
        if (!item.creatorReplyText?.trim()) return [item.workflowId, null] as const;
        const cached = await getCachedCreatorReplyAssessment(videoId, item.workflowId, creatorReplyAssessmentFingerprint(item));
        return [item.workflowId, cached] as const;
      })),
    ]);
    const assessmentByWorkflowId = new Map(replyAssessments);
    const items = statefulItems.map((item) => {
      const assessment = assessmentByWorkflowId.get(item.workflowId);
      const modes = [item.primaryDraftMode, item.secondaryDraftMode].filter((mode): mode is ResponseDraftMode => Boolean(mode));
      return {
        ...item,
        hasDraft: cachedDraftKeys.has(`${item.workflowId}:${draftContextFingerprint(item, item.primaryDraftMode, item.phase6Interpretation)}`),
        cachedDraftModes: modes.filter((mode) => cachedDraftKeys.has(`${item.workflowId}:${draftContextFingerprint(item, mode, item.phase6Interpretation)}`)),
        creatorReplyAssessment: assessment ? {
          outcome: assessment.outcome, confidence: assessment.confidence, reason: assessment.reason,
          model: assessment.model_name, createdAt: assessment.created_at,
        } : null,
      };
    });
    const needsResponse = items.filter((item) => item.resolutionStatus === 'needs_response' || item.resolutionStatus === 'unclear');
    const resolved = items.filter((item) => item.resolutionStatus === 'resolved' || item.resolutionStatus === 'community_answered');
    return res.json({ status: 'success', videoId, needsResponse, resolved, summary: { total: items.length, needsResponse: needsResponse.length, resolved: resolved.length } });
  } catch (error) {
    return res.status(500).json({ status: 'error', error: error instanceof Error ? error.message : 'Could not load response workflow.' });
  }
});

router.post('/video/:videoId/response-workflow/:workflowId/resolution', async (req: Request, res: Response) => {
  try {
    const resolved = req.body?.resolved;
    if (typeof resolved !== 'boolean') return res.status(400).json({ status: 'error', error: 'resolved must be true or false.' });
    await setWorkflowResolution(String(req.params.videoId), String(req.params.workflowId), resolved);
    return res.json({ status: 'success', resolved });
  } catch (error) { return res.status(500).json({ status: 'error', error: error instanceof Error ? error.message : 'Could not update workflow resolution.' }); }
});

/** Gemini is invoked only after an explicit draft/re-generate click. */
router.post('/video/:videoId/response-workflow/:workflowId/draft', async (req: Request, res: Response) => {
  try {
    const videoId = String(req.params.videoId); const workflowId = String(req.params.workflowId);
    const items = await getWorkflowItems(videoId);
    const item = items.find((candidate) => candidate.workflowId === workflowId);
    if (!item) return res.status(404).json({ status: 'error', error: 'Response workflow item was not found.' });
    const requestedMode = req.body?.mode;
    const allowedModes = [item.primaryDraftMode, item.secondaryDraftMode].filter((mode): mode is ResponseDraftMode => Boolean(mode));
    const mode = requestedMode === undefined ? item.primaryDraftMode : requestedMode as ResponseDraftMode;
    if (!allowedModes.includes(mode)) return res.status(400).json({ status: 'error', error: 'This draft mode is not available for the selected insight.' });
    const contextVersion = draftContextFingerprint(item, mode, item.phase6Interpretation);
    const regenerate = req.body?.regenerate === true;
    if (!regenerate) {
      const cached = await getCachedResponseDraft(videoId, workflowId, contextVersion);
      if (cached) return res.json({ status: 'success', cached: true, draft: cached });
    }
    const [usage, draftUsage] = await Promise.all([getDailyAnalysisUsage(), getResponseDraftUsageToday()]);
    const limit = Number(process.env.GEMINI_MAX_REQUESTS_PER_DAY || 10);
    if (usage.requestsToday + draftUsage >= limit) return res.status(429).json({ status: 'error', error: 'The configured daily AI request limit has been reached.' });
    const generated = await generateResponseDraft(item, mode);
    const draft = { draft_id: newDraftId(), workflow_id: workflowId, video_id: videoId, context_version: contextVersion, draft_text: generated.text, model_name: generated.model, created_at: new Date().toISOString() };
    await storeResponseDraft(draft);
    return res.json({ status: 'success', cached: false, draft });
  } catch (error) { return res.status(503).json({ status: 'error', error: safeAiError(error, 'A reply draft is temporarily unavailable.') }); }
});

/** Explicitly checks a detected creator reply; results are cached against its exact context. */
router.post('/video/:videoId/response-workflow/:workflowId/creator-reply-check', async (req: Request, res: Response) => {
  try {
    const videoId = String(req.params.videoId); const workflowId = String(req.params.workflowId);
    const items = await getWorkflowItems(videoId);
    const item = items.find((candidate) => candidate.workflowId === workflowId);
    if (!item) return res.status(404).json({ status: 'error', error: 'Response workflow item was not found.' });
    if (!item.creatorReplyText?.trim()) return res.status(400).json({ status: 'error', error: 'No creator reply is available to assess.' });
    const contextVersion = creatorReplyAssessmentFingerprint(item);
    const cached = await getCachedCreatorReplyAssessment(videoId, workflowId, contextVersion);
    if (cached) return res.json({ status: 'success', cached: true, assessment: cached });
    const [usage, draftUsage, checkUsage] = await Promise.all([getDailyAnalysisUsage(), getResponseDraftUsageToday(), getCreatorReplyAssessmentUsageToday()]);
    const limit = Number(process.env.GEMINI_MAX_REQUESTS_PER_DAY || 10);
    if (usage.requestsToday + draftUsage + checkUsage >= limit) return res.status(429).json({ status: 'error', error: 'The configured daily AI request limit has been reached.' });
    const assessment = await assessCreatorReply(item);
    const stored = { workflow_id: workflowId, video_id: videoId, context_version: contextVersion, outcome: assessment.outcome, confidence: assessment.confidence, reason: assessment.reason, model_name: assessment.model, created_at: new Date().toISOString() };
    await storeCreatorReplyAssessment(stored);
    if (assessment.outcome === 'answered' && assessment.confidence >= 0.8) await markWorkflowCreatorReplyAnswered(videoId, workflowId);
    return res.json({ status: 'success', cached: false, assessment: stored, resolved: assessment.outcome === 'answered' && assessment.confidence >= 0.8 });
  } catch (error) { return res.status(503).json({ status: 'error', error: safeAiError(error, 'Creator-reply review is temporarily unavailable.') }); }
});

/**
 * Explicitly checks a detected creator reply. The result is cached against the
 * exact learner need and reply text, so reopening an insight never reuses Gemini.
 */

export default router;
