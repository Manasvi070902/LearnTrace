/**
 * Friction Analysis Orchestration Service
 *
 * Coordinates the Phase 5 pipeline:
 * 1. Load valid learning signals
 * 2. Ensure embeddings exist (generate missing)
 * 3. Cluster semantic questions
 * 4. Normalize concepts
 * 5. Calculate friction scores
 * 6. Store results
 */

import { PROMPT_VERSION } from '../../prompts/comment-analysis.prompt';
import { getAnalysisForVideo } from './bigquery.analysis';
import { getStoredEmbedding, storeEmbeddings, getVideoEmbeddings, EmbeddingRow } from './bigquery.embedding';
import { getVideoClusters, storeClusters, storeClusterMembers, getVideoFrictionScores, storeFrictionScores, ClusterRow, ClusterMemberRow, FrictionRow } from './bigquery.friction';
import { generateEmbeddings, getConfiguredEmbeddingModel } from '../embedding/embedding.service';
import { clusterQuestions, groupClustersByPrimaryConcept, CLUSTERING_VERSION, QuestionEmbedding, QuestionCluster } from '../clustering/clustering.service';
import { normalizeConcept } from '../clustering/concept-normalizer';
import { calculateVideoFriction, SCORING_VERSION, ConceptFrictionInput, validateWeights } from '../friction/friction-scoring.service';
import { getConfiguredGeminiModel } from '../gemini/comment-analysis.service';

const LEARNING_SIGNAL_MIN_CONFIDENCE = Number(process.env.LEARNING_SIGNAL_MIN_CONFIDENCE || 0.65);

export interface FrictionAnalysisReport {
  videoId: string;
  availableComments: number;
  aiAnalyzedComments: number;
  learningSignals: number;
  canonicalQuestions: number;
  embeddingsGenerated: number;
  embeddingsCached: number;
  questionClusters: number;
  normalizedConcepts: number;
  conceptsWithEvidence: number;
  conceptsInsufficientEvidence: number;
  frictionScores: FrictionRow[];
}

/**
 * Execute the complete Phase 5 friction analysis pipeline for a video.
 * Uses existing Phase 4 cached analyses; does not re-call Gemini for analysis.
 */
export async function analyzeFrictionForVideo(videoId: string): Promise<FrictionAnalysisReport> {
  // Validate configuration
  validateWeights();

  const embeddingModel = getConfiguredEmbeddingModel();
  const geminModel = getConfiguredGeminiModel();
  const now = new Date().toISOString();

  console.log(`[Friction Analysis] Starting for video '${videoId}'`);
  console.log(`[Friction Analysis] Using embedding model: ${embeddingModel}`);
  console.log(`[Friction Analysis] Min confidence threshold: ${LEARNING_SIGNAL_MIN_CONFIDENCE}`);

  // Step 1: Load all analyses for this video
  const allAnalyses = await getAnalysisForVideo(videoId, PROMPT_VERSION, geminModel);
  console.log(`[Friction Analysis] Total analyzed comments: ${allAnalyses.length}`);

  // Step 2: Filter for valid learning signals
  const learningSignals = allAnalyses.filter(
    (a) =>
      a.is_learning_signal &&
      a.canonical_question &&
      a.confidence >= LEARNING_SIGNAL_MIN_CONFIDENCE
  );

  console.log(`[Friction Analysis] Valid learning signals: ${learningSignals.length}`);

  if (learningSignals.length === 0) {
    return {
      videoId,
      availableComments: allAnalyses.length,
      aiAnalyzedComments: allAnalyses.length,
      learningSignals: 0,
      canonicalQuestions: 0,
      embeddingsGenerated: 0,
      embeddingsCached: 0,
      questionClusters: 0,
      normalizedConcepts: 0,
      conceptsWithEvidence: 0,
      conceptsInsufficientEvidence: 0,
      frictionScores: [],
    };
  }

  // Step 3: Ensure embeddings exist
  let embeddingsGenerated = 0;
  let embeddingsCached = 0;

  const uniqueQuestions = new Map<string, typeof learningSignals[0]>();
  for (const signal of learningSignals) {
    if (!uniqueQuestions.has(signal.canonical_question!)) {
      uniqueQuestions.set(signal.canonical_question!, signal);
    }
  }

  console.log(`[Friction Analysis] Unique canonical questions: ${uniqueQuestions.size}`);

  const embeddingsToGenerate: Array<{
    commentId: string;
    text: string;
    canonical_question: string;
  }> = [];

  for (const [question, signal] of uniqueQuestions) {
    const existing = await getStoredEmbedding(
      signal.comment_id,
      question,
      embeddingModel,
      PROMPT_VERSION
    );

    if (existing) {
      embeddingsCached++;
    } else {
      embeddingsToGenerate.push({
        commentId: signal.comment_id,
        text: question,
        canonical_question: question,
      });
    }
  }

  console.log(`[Friction Analysis] Embeddings cached: ${embeddingsCached}`);
  console.log(`[Friction Analysis] Embeddings to generate: ${embeddingsToGenerate.length}`);

  if (embeddingsToGenerate.length > 0) {
    try {
      const generated = await generateEmbeddings(embeddingsToGenerate.map((e) => e.text));

      const embeddingRows: EmbeddingRow[] = generated.map((emb, idx) => ({
        comment_id: embeddingsToGenerate[idx].commentId,
        video_id: videoId,
        canonical_question: embeddingsToGenerate[idx].canonical_question,
        concept: uniqueQuestions.get(embeddingsToGenerate[idx].canonical_question)?.concept || null,
        embedding: emb.embedding,
        embedding_model: embeddingModel,
        prompt_version: PROMPT_VERSION,
        created_at: now,
      }));

      await storeEmbeddings(embeddingRows);
      embeddingsGenerated = generated.length;
      console.log(`[Friction Analysis] Generated ${embeddingsGenerated} new embeddings`);
    } catch (error) {
      console.error('[Friction Analysis] Embedding generation failed:', error);
      throw error;
    }
  }

  // Step 4: Load all embeddings for clustering
  const allEmbeddings = await getVideoEmbeddings(
    videoId,
    embeddingModel,
    PROMPT_VERSION,
    LEARNING_SIGNAL_MIN_CONFIDENCE
  );

  console.log(`[Friction Analysis] Total embeddings available: ${allEmbeddings.length}`);

  // Step 5: Prepare question embeddings with confusion/confidence
  const questionEmbeddings: QuestionEmbedding[] = allEmbeddings.map((emb) => {
    const signal = learningSignals.find((s) => s.comment_id === emb.comment_id);
    return {
      comment_id: emb.comment_id,
      canonical_question: emb.canonical_question,
      concept: emb.concept,
      embedding: emb.embedding,
      confusion_strength: signal?.confusion_strength || 0.5,
      confidence: signal?.confidence || 0.5,
    };
  });

  // Step 6: Cluster questions
  const clusters = clusterQuestions(questionEmbeddings);
  console.log(`[Friction Analysis] Question clusters created: ${clusters.length}`);

  // Step 7: Store clusters
  const now2 = new Date().toISOString();
  const clusterRows: ClusterRow[] = clusters.map((c) => ({
    cluster_id: c.cluster_id,
    video_id: videoId,
    cluster_label: c.cluster_label,
    primary_concept: c.primary_concept,
    question_count: c.members.length,
    average_confusion_strength: c.average_confusion_strength,
    average_confidence: c.average_confidence,
    representative_comment_ids: c.representative_comment_ids,
    created_at: now2,
    clustering_version: CLUSTERING_VERSION,
  }));

  const memberRows: ClusterMemberRow[] = [];
  for (const cluster of clusters) {
    for (const member of cluster.members) {
      const similarity = 1.0; // Simplified: members are already in the cluster
      memberRows.push({
        cluster_id: cluster.cluster_id,
        comment_id: member.comment_id,
        video_id: videoId,
        similarity_score: similarity,
        created_at: now2,
      });
    }
  }

  await storeClusters(clusterRows);
  if (memberRows.length > 0) {
    await storeClusterMembers(memberRows);
  }

  // Step 8: Normalize concepts and aggregate
  const conceptClusterMap = groupClustersByPrimaryConcept(clusters);
  const frictionInputs: ConceptFrictionInput[] = [];
  const normalizedConcepts = new Set<string>();

  for (const [concept, conceptClusters] of conceptClusterMap) {
    const normalized = normalizeConcept(concept);
    normalizedConcepts.add(normalized);

    const totalQuestions = conceptClusters.reduce((sum, c) => sum + c.members.length, 0);
    const totalConfusion = conceptClusters.reduce(
      (sum, c) => sum + c.members.reduce((s, m) => s + m.confusion_strength, 0),
      0
    );

    frictionInputs.push({
      concept: normalized,
      questionCount: totalQuestions,
      clusterCount: conceptClusters.length,
      averageConfusionStrength: totalConfusion / totalQuestions,
      maxObservedQuestionCount: 1, // Will be set in calculateVideoFriction
      maxObservedClusterCount: 1,
    });
  }

  console.log(`[Friction Analysis] Normalized concepts: ${normalizedConcepts.size}`);

  // Step 9: Calculate friction scores
  const frictionResults = calculateVideoFriction(frictionInputs);

  const conceptsWithEvidence = frictionResults.filter((r) => r.friction_level !== 'Insufficient Evidence').length;
  const conceptsInsufficientEvidence = frictionResults.filter(
    (r) => r.friction_level === 'Insufficient Evidence'
  ).length;

  console.log(`[Friction Analysis] Concepts with evidence: ${conceptsWithEvidence}`);
  console.log(`[Friction Analysis] Concepts insufficient evidence: ${conceptsInsufficientEvidence}`);

  // Step 10: Store friction scores
  const now3 = new Date().toISOString();
  const frictionRows: FrictionRow[] = frictionResults.map((result) => ({
    video_id: videoId,
    normalized_concept: result.concept,
    learning_friction_score: result.friction_score,
    friction_level: result.friction_level,
    question_count: result.question_count,
    cluster_count: result.cluster_count,
    volume_score: result.volume_score,
    confusion_score: result.confusion_score,
    recurrence_score: result.recurrence_score,
    average_confusion_strength: result.average_confusion_strength,
    evidence_count: result.evidence_count,
    calculated_at: now3,
    scoring_version: SCORING_VERSION,
  }));

  await storeFrictionScores(frictionRows);

  return {
    videoId,
    availableComments: allAnalyses.length,
    aiAnalyzedComments: allAnalyses.length,
    learningSignals: learningSignals.length,
    canonicalQuestions: uniqueQuestions.size,
    embeddingsGenerated,
    embeddingsCached,
    questionClusters: clusters.length,
    normalizedConcepts: normalizedConcepts.size,
    conceptsWithEvidence,
    conceptsInsufficientEvidence,
    frictionScores: frictionRows,
  };
}

/**
 * Retrieve cached friction analysis for a video without recomputation.
 */
export async function getFrictionAnalysisForVideo(videoId: string): Promise<FrictionRow[] | null> {
  try {
    const scores = await getVideoFrictionScores(videoId, SCORING_VERSION);
    return scores.length > 0 ? scores : null;
  } catch {
    return null;
  }
}
