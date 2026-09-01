/**
 * Clustering Service
 *
 * Groups semantically similar canonical questions into clusters.
 * Uses cosine similarity on embeddings with a configurable threshold.
 */

import { cosineSimilarity } from '../embedding/embedding.service';

export const CLUSTERING_VERSION = 'v1';

export function getClusterSimilarityThreshold(): number {
  return Number(process.env.QUESTION_CLUSTER_SIMILARITY_THRESHOLD || 0.75);
}

export interface QuestionEmbedding {
  comment_id: string;
  canonical_question: string;
  concept: string | null;
  embedding: number[];
  confusion_strength: number;
  confidence: number;
}

export interface QuestionCluster {
  cluster_id: string;
  cluster_label: string;
  primary_concept: string;
  members: QuestionEmbedding[];
  average_confusion_strength: number;
  average_confidence: number;
  representative_comment_ids: string[];
}

/** A question is recurring only when independent learner signals share its cluster. */
export function countRecurringQuestionClusters(clusters: QuestionCluster[]): number {
  return clusters.filter((cluster) => cluster.members.length >= 2).length;
}

/**
 * Cluster questions using greedy single-pass clustering.
 * Higher-confidence questions are more likely to become cluster seeds.
 */
export function clusterQuestions(
  questions: QuestionEmbedding[],
  threshold = getClusterSimilarityThreshold()
): QuestionCluster[] {
  if (!questions.length) return [];

  // Sort by confidence descending (seed with high-confidence questions first)
  const sorted = [...questions].sort((a, b) => b.confidence - a.confidence);

  const clusters: QuestionCluster[] = [];
  const assigned = new Set<string>();

  for (const question of sorted) {
    if (assigned.has(question.comment_id)) continue;

    const cluster: QuestionCluster = {
      cluster_id: `cluster_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      cluster_label: question.canonical_question,
      primary_concept: question.concept || 'uncategorized',
      members: [question],
      average_confusion_strength: question.confusion_strength,
      average_confidence: question.confidence,
      representative_comment_ids: [question.comment_id],
    };

    assigned.add(question.comment_id);

    // Try to assign other questions to this cluster
    for (const candidate of sorted) {
      if (assigned.has(candidate.comment_id)) continue;

      const similarity = cosineSimilarity(question.embedding, candidate.embedding);
      if (similarity >= threshold) {
        cluster.members.push(candidate);
        assigned.add(candidate.comment_id);
        cluster.representative_comment_ids.push(candidate.comment_id);

        // Update cluster averages
        const totalConfusion = cluster.members.reduce((sum, m) => sum + m.confusion_strength, 0);
        cluster.average_confusion_strength = totalConfusion / cluster.members.length;

        const totalConfidence = cluster.members.reduce((sum, m) => sum + m.confidence, 0);
        cluster.average_confidence = totalConfidence / cluster.members.length;
      }
    }

    cluster.cluster_label = getRepresentativeLabel(cluster.members);
    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Extract the most representative canonical question from a cluster.
 * For MVP: use the highest-confidence question in the cluster.
 */
export function getRepresentativeLabel(members: QuestionEmbedding[]): string {
  if (!members.length) return 'unknown';

  const sorted = [...members].sort((a, b) => b.confidence - a.confidence);
  return sorted[0].canonical_question;
}

/**
 * Group clusters by concept for aggregation.
 */
export function groupClustersByPrimaryConcept(
  clusters: QuestionCluster[]
): Map<string, QuestionCluster[]> {
  const grouped = new Map<string, QuestionCluster[]>();

  for (const cluster of clusters) {
    const concept = cluster.primary_concept;
    if (!grouped.has(concept)) {
      grouped.set(concept, []);
    }
    grouped.get(concept)!.push(cluster);
  }

  return grouped;
}
