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
import { CommentAnalysisRow, getAnalysisForVideo } from './bigquery.analysis';
import { getStoredEmbedding, storeEmbeddings, EmbeddingRow, StoredEmbedding } from './bigquery.embedding';
import { getVideoClusters, storeClusters, storeClusterMembers, getVideoFrictionScores, storeFrictionScores, ClusterRow, ClusterMemberRow, FrictionRow } from './bigquery.friction';
import { cosineSimilarity, generateEmbeddings, getConfiguredEmbeddingModel } from '../embedding/embedding.service';
import { clusterQuestions, groupClustersByPrimaryConcept, CLUSTERING_VERSION, QuestionEmbedding, QuestionCluster } from '../clustering/clustering.service';
import { normalizeConcept } from '../clustering/concept-normalizer';
import { calculateVideoFriction, SCORING_VERSION, ConceptFrictionInput, validateWeights } from '../friction/friction-scoring.service';
import { getConfiguredGeminiModel } from '../gemini/comment-analysis.service';
import { getVideoStats } from './bigquery.retrieval';
import { deriveSignalDomain } from '../friction/signal-domain.service';

const LEARNING_SIGNAL_MIN_CONFIDENCE = Number(process.env.LEARNING_SIGNAL_MIN_CONFIDENCE || 0.65);
/** Phase 5 consumes only the cached, qualifying Phase 4 learning signals. */
export function isEligibleLearningSignal(analysis: CommentAnalysisRow): boolean {
  return Boolean(
    analysis.is_learning_signal &&
    analysis.canonical_question?.trim() &&
    analysis.confidence >= LEARNING_SIGNAL_MIN_CONFIDENCE &&
    deriveSignalDomain(analysis) === 'learning_conceptual'
  );
}

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
  technicalBarriers: number;
  curriculumNavigationSignals: number;
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
  const learningSignals = allAnalyses.filter(isEligibleLearningSignal);
  const technicalBarriers = allAnalyses.filter((analysis) => deriveSignalDomain(analysis) === 'technical_barrier').length;
  const curriculumNavigationSignals = allAnalyses.filter(
    (analysis) => deriveSignalDomain(analysis) === 'curriculum_navigation'
  ).length;

  const videoStats = await getVideoStats(videoId);
  const availableComments = videoStats?.totalRecords ?? 0;

  console.log(`[Friction Analysis] Valid learning signals: ${learningSignals.length}`);

  if (learningSignals.length === 0) {
    return {
      videoId,
      availableComments,
      aiAnalyzedComments: allAnalyses.length,
      learningSignals: 0,
      canonicalQuestions: 0,
      embeddingsGenerated: 0,
      embeddingsCached: 0,
      questionClusters: 0,
      normalizedConcepts: 0,
      conceptsWithEvidence: 0,
      conceptsInsufficientEvidence: 0,
      technicalBarriers,
      curriculumNavigationSignals,
      frictionScores: [],
    };
  }

  // Step 3: Ensure embeddings exist
  let embeddingsGenerated = 0;
  let embeddingsCached = 0;

  const uniqueQuestions = new Map<string, typeof learningSignals[0]>();
  for (const signal of learningSignals) {
    const question = signal.canonical_question!.trim();
    if (!uniqueQuestions.has(question)) {
      uniqueQuestions.set(question, signal);
    }
  }

  console.log(`[Friction Analysis] Unique canonical questions: ${uniqueQuestions.size}`);

  const embeddingsByQuestion = new Map<string, StoredEmbedding>();
  const embeddingsToGenerate: Array<{ commentId: string; text: string }> = [];

  for (const [question, signal] of uniqueQuestions) {
    const existing = await getStoredEmbedding(
      question,
      embeddingModel,
      PROMPT_VERSION
    );

    if (existing) {
      embeddingsCached++;
      embeddingsByQuestion.set(question, existing);
    } else {
      embeddingsToGenerate.push({
        commentId: signal.comment_id,
        text: question,
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
        canonical_question: embeddingsToGenerate[idx].text,
        concept: uniqueQuestions.get(embeddingsToGenerate[idx].text)?.concept || null,
        embedding: emb.embedding,
        embedding_model: embeddingModel,
        prompt_version: PROMPT_VERSION,
        created_at: now,
      }));

      await storeEmbeddings(embeddingRows);
      for (const row of embeddingRows) {
        embeddingsByQuestion.set(row.canonical_question, row);
      }
      embeddingsGenerated = generated.length;
      console.log(`[Friction Analysis] Generated ${embeddingsGenerated} new embeddings`);
    } catch (error) {
      console.error('[Friction Analysis] Embedding generation failed:', error);
      throw error;
    }
  }

  // Step 4: Every qualifying source comment participates in clustering, while
  // repeated canonical questions reuse the one cached embedding.
  const questionEmbeddings: QuestionEmbedding[] = learningSignals.map((signal) => {
    const question = signal.canonical_question!.trim();
    const stored = embeddingsByQuestion.get(question);
    if (!stored) throw new Error(`Missing embedding for canonical question: ${question}`);
    return {
      comment_id: signal.comment_id,
      canonical_question: question,
      concept: signal.concept,
      embedding: stored.embedding,
      confusion_strength: signal.confusion_strength,
      confidence: signal.confidence,
    };
  });

  console.log(`[Friction Analysis] Total source question embeddings available: ${questionEmbeddings.length}`);

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
      const seed = cluster.members[0];
      const similarity = cosineSimilarity(seed.embedding, member.embedding);
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
  const conceptClusterMap = new Map<string, QuestionCluster[]>();
  for (const cluster of clusters) {
    const concept = normalizeConcept(cluster.primary_concept);
    const current = conceptClusterMap.get(concept) || [];
    current.push(cluster);
    conceptClusterMap.set(concept, current);
  }
  const frictionInputs: ConceptFrictionInput[] = [];
  const normalizedConcepts = new Set<string>();

  for (const [normalized, conceptClusters] of conceptClusterMap) {
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
    availableComments,
    aiAnalyzedComments: allAnalyses.length,
    learningSignals: learningSignals.length,
    canonicalQuestions: uniqueQuestions.size,
    embeddingsGenerated,
    embeddingsCached,
    questionClusters: clusters.length,
    normalizedConcepts: normalizedConcepts.size,
    conceptsWithEvidence,
    conceptsInsufficientEvidence,
    technicalBarriers,
    curriculumNavigationSignals,
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
