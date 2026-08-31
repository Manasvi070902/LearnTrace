/**
 * Friction Scoring Service
 *
 * Calculates deterministic Learning Friction Scores from measurable signals.
 * Friction is NOT assigned by Gemini; it is calculated from stored evidence.
 */

export const SCORING_VERSION = 'v1';

function getFrictionWeights(): { volume: number; confusion: number; recurrence: number } {
  return {
    volume: Number(process.env.FRICTION_WEIGHT_VOLUME || 0.4),
    confusion: Number(process.env.FRICTION_WEIGHT_CONFUSION || 0.35),
    recurrence: Number(process.env.FRICTION_WEIGHT_RECURRENCE || 0.25),
  };
}

function getMinSignalsForFrictionScore(): number {
  return Number(process.env.MIN_SIGNALS_FOR_FRICTION_SCORE || 3);
}

export interface ConceptFrictionInput {
  concept: string;
  questionCount: number;
  clusterCount: number;
  averageConfusionStrength: number;
  maxObservedQuestionCount: number;
  maxObservedClusterCount: number;
}

export interface ConceptFrictionResult {
  concept: string;
  friction_score: number | null;
  friction_level: 'Low' | 'Moderate' | 'High' | 'Critical' | 'Insufficient Evidence';
  question_count: number;
  cluster_count: number;
  volume_score: number | null;
  confusion_score: number | null;
  recurrence_score: number | null;
  average_confusion_strength: number;
  evidence_count: number;
}

/**
 * Validate that weights sum to 1.0 (within floating-point tolerance).
 */
export function validateWeights(): void {
  const weights = getFrictionWeights();
  const sum = weights.volume + weights.confusion + weights.recurrence;
  const tolerance = 0.001;

  if (Math.abs(sum - 1.0) > tolerance) {
    throw new Error(
      `[Friction Scoring] Weights must sum to 1.0. Current sum: ${sum}. ` +
        `Set FRICTION_WEIGHT_VOLUME, FRICTION_WEIGHT_CONFUSION, FRICTION_WEIGHT_RECURRENCE.`
    );
  }
}

/**
 * Normalize a component score to 0–100 scale.
 * Base: count / max_count * 100, clamped to [0, 100].
 */
function normalizeComponentScore(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

/**
 * Calculate friction score for a single concept.
 * Returns null if insufficient evidence; otherwise returns 0–100 score.
 */
export function calculateConceptFriction(
  input: ConceptFrictionInput
): ConceptFrictionResult {
  const minSignals = getMinSignalsForFrictionScore();
  const weights = getFrictionWeights();

  // Check minimum evidence requirement
  if (input.questionCount < minSignals) {
    return {
      concept: input.concept,
      friction_score: null,
      friction_level: 'Insufficient Evidence',
      question_count: input.questionCount,
      cluster_count: input.clusterCount,
      volume_score: null,
      confusion_score: null,
      recurrence_score: null,
      average_confusion_strength: input.averageConfusionStrength,
      evidence_count: input.questionCount,
    };
  }

  // Calculate component scores
  const volumeScore = normalizeComponentScore(
    input.questionCount,
    input.maxObservedQuestionCount || 1
  );

  const confusionScore = Math.max(0, Math.min(100, input.averageConfusionStrength * 100));

  const recurrenceScore = normalizeComponentScore(
    input.clusterCount,
    input.maxObservedClusterCount || 1
  );

  // Weighted friction score
  const frictionScore =
    weights.volume * volumeScore +
    weights.confusion * confusionScore +
    weights.recurrence * recurrenceScore;

  // Determine friction level
  let frictionLevel: 'Low' | 'Moderate' | 'High' | 'Critical';
  if (frictionScore >= 80) frictionLevel = 'Critical';
  else if (frictionScore >= 60) frictionLevel = 'High';
  else if (frictionScore >= 40) frictionLevel = 'Moderate';
  else frictionLevel = 'Low';

  return {
    concept: input.concept,
    friction_score: Math.round(frictionScore * 100) / 100, // Round to 2 decimals
    friction_level: frictionLevel,
    question_count: input.questionCount,
    cluster_count: input.clusterCount,
    volume_score: Math.round(volumeScore * 100) / 100,
    confusion_score: Math.round(confusionScore * 100) / 100,
    recurrence_score: Math.round(recurrenceScore * 100) / 100,
    average_confusion_strength: Math.round(input.averageConfusionStrength * 10000) / 10000,
    evidence_count: input.questionCount,
  };
}

/**
 * Batch calculate friction scores for all concepts in a video.
 * Automatically determines max values for normalization.
 */
export function calculateVideoFriction(
  inputs: ConceptFrictionInput[]
): ConceptFrictionResult[] {
  if (!inputs.length) return [];

  // Find max values for normalization
  const maxQuestionCount = Math.max(
    1,
    ...inputs.map((i) => i.questionCount)
  );

  const maxClusterCount = Math.max(
    1,
    ...inputs.map((i) => i.clusterCount)
  );

  // Calculate scores with actual max values
  return inputs.map((input) =>
    calculateConceptFriction({
      ...input,
      maxObservedQuestionCount: maxQuestionCount,
      maxObservedClusterCount: maxClusterCount,
    })
  );
}
