/**
 * Clustering Service
 *
 * Groups semantically similar canonical questions into clusters.
 * Uses cosine similarity on embeddings with a configurable threshold.
 */

import { createHash } from 'node:crypto';
import { cosineSimilarity } from '../embedding/embedding.service';
import { areQuestionSignaturesCompatible, deriveQuestionSignature, QuestionSignature } from './question-signature.service';

/**
 * v3 adds question-task compatibility to v2 complete-link cohesion. Derived
 * Phase 5/6 results from earlier versions must be recomputed.
 */
export const CLUSTERING_VERSION = 'v3';

export function getClusterSimilarityThreshold(): number {
  return Number(process.env.QUESTION_CLUSTER_SIMILARITY_THRESHOLD || 0.75);
}

export interface QuestionEmbedding {
  comment_id: string;
  canonical_question: string;
  concept: string | null;
  /** Existing Phase 4 intent, retained for question-task diagnostics. */
  intent?: string;
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

export interface ClusterCohesion {
  minimumPairwiseSimilarity: number;
  meanPairwiseSimilarity: number;
  maximumPairwiseSimilarity: number;
  questionRoles: QuestionSignature[];
  conceptConsistency: number;
}

interface ClusterState {
  members: QuestionEmbedding[];
  representative: QuestionEmbedding;
  centroid: number[];
  cohesion: ClusterCohesion;
}

/** A question is recurring only when independent learner signals share its cluster. */
export function countRecurringQuestionClusters(clusters: QuestionCluster[]): number {
  return clusters.filter((cluster) => cluster.members.length >= 2).length;
}

/** A total ordering makes clustering independent of retrieval order. */
function compareQuestions(a: QuestionEmbedding, b: QuestionEmbedding): number {
  return b.confidence - a.confidence
    || a.canonical_question.localeCompare(b.canonical_question)
    || a.comment_id.localeCompare(b.comment_id);
}

function createDeterministicClusterId(members: QuestionEmbedding[]): string {
  const memberIds = members.map((member) => member.comment_id).sort();
  const digest = createHash('sha256').update(memberIds.join('\u0000')).digest('hex').slice(0, 24);
  return `cluster_${digest}`;
}

export function getCentroidEmbedding(members: QuestionEmbedding[]): number[] {
  if (!members.length) return [];
  const dimensions = members[0].embedding.length;
  return Array.from({ length: dimensions }, (_, index) =>
    members.reduce((sum, member) => sum + member.embedding[index], 0) / members.length
  );
}

/** Calculate cluster diagnostics from all members, not just a representative. */
export function assessClusterCohesion(members: QuestionEmbedding[]): ClusterCohesion {
  const similarities: number[] = [];
  for (let left = 0; left < members.length; left++) {
    for (let right = left + 1; right < members.length; right++) {
      similarities.push(cosineSimilarity(members[left].embedding, members[right].embedding));
    }
  }
  const conceptCounts = new Map<string, number>();
  for (const member of members) {
    const concept = member.concept?.trim().toLocaleLowerCase() || 'uncategorized';
    conceptCounts.set(concept, (conceptCounts.get(concept) || 0) + 1);
  }
  return {
    minimumPairwiseSimilarity: similarities.length ? Math.min(...similarities) : 1,
    meanPairwiseSimilarity: similarities.length
      ? similarities.reduce((sum, similarity) => sum + similarity, 0) / similarities.length
      : 1,
    maximumPairwiseSimilarity: similarities.length ? Math.max(...similarities) : 1,
    questionRoles: members.map((member) => deriveQuestionSignature(member.canonical_question, member.intent)),
    conceptConsistency: Math.max(...conceptCounts.values()) / members.length,
  };
}

/**
 * Return the most central member: highest average cosine similarity to every
 * other member. Ties use the same deterministic ordering as clustering.
 */
export function getRepresentativeMember(members: QuestionEmbedding[]): QuestionEmbedding | null {
  if (!members.length) return null;
  if (members.length === 1) return members[0];

  return [...members].sort((a, b) => {
    const averageSimilarity = (candidate: QuestionEmbedding) => members
      .filter((member) => member.comment_id !== candidate.comment_id)
      .reduce((sum, member) => sum + cosineSimilarity(candidate.embedding, member.embedding), 0)
      / (members.length - 1);
    const difference = averageSimilarity(b) - averageSimilarity(a);
    return difference || compareQuestions(a, b);
  })[0];
}

function buildCluster(members: QuestionEmbedding[]): QuestionCluster {
  const orderedMembers = [...members].sort(compareQuestions);
  const representative = getRepresentativeMember(orderedMembers)!;
  return {
    cluster_id: createDeterministicClusterId(orderedMembers),
    cluster_label: representative.canonical_question,
    primary_concept: representative.concept || 'uncategorized',
    members: orderedMembers,
    average_confusion_strength: orderedMembers.reduce((sum, member) => sum + member.confusion_strength, 0) / orderedMembers.length,
    average_confidence: orderedMembers.reduce((sum, member) => sum + member.confidence, 0) / orderedMembers.length,
    // Keep all source comment ids available as evidence, with the central
    // representative first and the remaining ids deterministically ordered.
    representative_comment_ids: [
      representative.comment_id,
      ...orderedMembers
        .filter((member) => member.comment_id !== representative.comment_id)
        .map((member) => member.comment_id),
    ],
  };
}

function createClusterState(members: QuestionEmbedding[]): ClusterState {
  const orderedMembers = [...members].sort(compareQuestions);
  return {
    members: orderedMembers,
    representative: getRepresentativeMember(orderedMembers)!,
    centroid: getCentroidEmbedding(orderedMembers),
    cohesion: assessClusterCohesion(orderedMembers),
  };
}

function rolesAreCompatible(members: QuestionEmbedding[]): boolean {
  const signatures = members.map((member) => deriveQuestionSignature(member.canonical_question, member.intent));
  return signatures.every((signature, index) =>
    signatures.slice(index + 1).every((other) => areQuestionSignaturesCompatible(signature, other))
  );
}

function compareMergeCandidates(left: ClusterState, right: ClusterState): number {
  const combined = createClusterState([...left.members, ...right.members]);
  const representativeSimilarity = cosineSimilarity(left.representative.embedding, right.representative.embedding);
  const centroidSimilarity = cosineSimilarity(left.centroid, right.centroid);
  return combined.cohesion.minimumPairwiseSimilarity
    + combined.cohesion.meanPairwiseSimilarity
    + representativeSimilarity
    + centroidSimilarity;
}

function stateId(state: ClusterState): string {
  return state.members.map((member) => member.comment_id).sort().join('\u0000');
}

/**
 * Cluster questions with deterministic agglomerative complete-link membership.
 *
 * Two clusters merge only when their representatives are semantically similar,
 * every cross-member pair remains above the configured threshold, and their
 * confidently derived learner-task signatures are compatible. Unknown task
 * signatures are deliberately non-blocking to avoid discarding valid signals.
 */
export function clusterQuestions(
  questions: QuestionEmbedding[],
  threshold = getClusterSimilarityThreshold()
): QuestionCluster[] {
  if (!questions.length) return [];

  let states = [...questions].sort(compareQuestions).map((question) => createClusterState([question]));

  for (;;) {
    const candidates: Array<{ leftIndex: number; rightIndex: number; score: number; id: string }> = [];
    for (let leftIndex = 0; leftIndex < states.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < states.length; rightIndex++) {
        const left = states[leftIndex];
        const right = states[rightIndex];
        const members = [...left.members, ...right.members];
        const cohesion = assessClusterCohesion(members);
        const representativeSimilarity = cosineSimilarity(left.representative.embedding, right.representative.embedding);
        if (
          representativeSimilarity >= threshold
          && cohesion.minimumPairwiseSimilarity >= threshold
          && rolesAreCompatible(members)
        ) {
          candidates.push({
            leftIndex,
            rightIndex,
            score: compareMergeCandidates(left, right),
            id: `${stateId(left)}\u0001${stateId(right)}`,
          });
        }
      }
    }
    if (!candidates.length) break;

    candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const winner = candidates[0];
    const merged = createClusterState([
      ...states[winner.leftIndex].members,
      ...states[winner.rightIndex].members,
    ]);
    states = states.filter((_, index) => index !== winner.leftIndex && index !== winner.rightIndex);
    states.push(merged);
    states.sort((a, b) => stateId(a).localeCompare(stateId(b)));
  }

  return states
    .map((state) => buildCluster(state.members))
    .sort((a, b) => a.cluster_id.localeCompare(b.cluster_id));
}

/**
 * Extract the most representative canonical question from a cluster.
 * Uses the centrally representative canonical question.
 */
export function getRepresentativeLabel(members: QuestionEmbedding[]): string {
  return getRepresentativeMember(members)?.canonical_question || 'unknown';
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
