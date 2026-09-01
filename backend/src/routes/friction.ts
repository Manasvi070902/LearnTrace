/**
 * Friction Analysis API Route
 *
 * Endpoints:
 * POST /api/analyze/video/:videoId/friction - Compute or refresh friction analysis
 * GET /api/analyze/video/:videoId/friction - Retrieve cached friction analysis
 */

import { Router, Request, Response } from 'express';
import { videoExists } from '../services/bigquery/bigquery.analysis';
import { analyzeFrictionForVideo, getFrictionAnalysisForVideo } from '../services/bigquery/bigquery.friction.orchestration';
import { getVideoClusters, getClusterEvidence } from '../services/bigquery/bigquery.friction';
import { normalizeConcept } from '../services/clustering/concept-normalizer';
import { CLUSTERING_VERSION } from '../services/clustering/clustering.service';
import { getConfiguredDiagnosisModel, buildEvidencePacket, fingerprintEvidence, generateAiInterpretation, isInterpretationEligible, PHASE6_DIAGNOSIS_VERSION } from '../services/phase6/interpretation.service';
import { getCachedDiagnosis, storeDiagnosis } from '../services/bigquery/bigquery.diagnosis';

const router = Router();

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

export default router;
