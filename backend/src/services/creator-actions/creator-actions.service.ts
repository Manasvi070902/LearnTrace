import { CommentAnalysisRow } from '../bigquery/bigquery.analysis';
import { ClusterEvidenceRow, ClusterRow, FrictionRow } from '../bigquery/bigquery.friction';
import { normalizeConcept } from '../clustering/concept-normalizer';
import { deriveSignalDomain } from '../friction/signal-domain.service';
import { AiInterpretation } from '../phase6/interpretation.service';

export type ProductDisposition =
  | 'learning'
  | 'technical'
  | 'curriculum_navigation'
  | 'content_opportunity'
  | 'actionable_feedback'
  | 'positive_signal'
  | 'peer_discussion'
  | 'other_useful'
  | 'noise';

export type EvidenceStrength = 'emerging' | 'recurring' | 'strong';

export interface AudienceSignal extends CommentAnalysisRow {
  comment_text: string;
  is_reply: boolean;
  parent_comment_text?: string | null;
}

export interface ActionEvidence {
  commentId: string;
  commentText: string;
  isReply: boolean;
  parentCommentText: string | null;
}

export interface CreatorAction {
  id: string;
  category: Exclude<ProductDisposition, 'noise'>;
  title: string;
  summary: string;
  suggestedAction: string;
  evidenceStrength: EvidenceStrength;
  supportingSignalCount: number;
  concept: string | null;
  learningFrictionScore: number | null;
  learningFrictionStatus: string | null;
  recurringQuestionCount: number;
  evidenceIds: string[];
  evidence: ActionEvidence[];
  source: 'deterministic' | 'phase6_ai';
  priority: number;
}

export interface LearningCluster extends ClusterRow {
  evidence: Array<ClusterEvidenceRow & { parent_comment_text?: string | null }>;
}

export interface CreatorActionsResult {
  audienceOverview: Record<ProductDisposition, number> & { analyzed: number; recurringLearningQuestions: number };
  creatorActions: CreatorAction[];
  learningInsights: CreatorAction[];
  technicalBarriers: CreatorAction[];
  curriculumNavigation: CreatorAction[];
  contentOpportunities: CreatorAction[];
  improvementOpportunities: CreatorAction[];
  positiveSignals: CreatorAction[];
  peerLearning: CreatorAction[];
  otherUseful: CreatorAction[];
}

const DISPOSITIONS: ProductDisposition[] = [
  'learning', 'technical', 'curriculum_navigation', 'content_opportunity',
  'actionable_feedback', 'positive_signal', 'peer_discussion', 'other_useful', 'noise',
];

function normalizedText(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function isPeerExplanation(signal: AudienceSignal): boolean {
  if (!signal.is_reply || !['other', 'disagreement', 'feedback'].includes(signal.intent)) return false;
  const text = normalizedText(signal.comment_text);
  const hasExplanation = /\b(because|therefore|thus|means|the reason|for example|for instance)\b/.test(text);
  const hasLearningStructure = /\b(example|case|input|output|result|value|method|solution|approach|algorithm|state|step|relation|recurrence|condition|index|variable)\b/.test(text);
  return hasExplanation && (hasLearningStructure || text.length >= 180);
}

function isActionableFeedback(signal: AudienceSignal): boolean {
  if (signal.intent !== 'feedback') return false;
  if (!signal.is_reply) return true;
  const text = normalizedText(signal.comment_text);
  return /\b(audio|sound|microphone|volume|visual|slide|screen|font|pace|speed|too fast|too slow|walk through|clarify|could you|should|please|need)\b/.test(text);
}

/** Assign exactly one creator-facing disposition to every analyzed record. */
export function deriveProductDisposition(signal: AudienceSignal): ProductDisposition {
  if (signal.intent === 'content_request') return 'content_opportunity';
  const domain = deriveSignalDomain(signal);
  if (domain === 'learning_conceptual') return 'learning';
  if (domain === 'technical_barrier') return 'technical';
  if (domain === 'curriculum_navigation') return 'curriculum_navigation';
  if (signal.intent === 'feedback') return isActionableFeedback(signal)
    ? 'actionable_feedback'
    : isPeerExplanation(signal) ? 'peer_discussion' : 'other_useful';
  if (signal.intent === 'praise') return 'positive_signal';
  if (isPeerExplanation(signal)) return 'peer_discussion';
  if (signal.intent === 'noise') return 'noise';
  return 'other_useful';
}

function evidenceStrength(count: number): EvidenceStrength {
  return count >= 3 ? 'strong' : count >= 2 ? 'recurring' : 'emerging';
}

function feedbackTheme(signal: AudienceSignal): string {
  if (signal.concept?.trim()) return signal.concept.trim();
  const text = normalizedText(signal.comment_text);
  if (/\b(audio|sound|microphone|volume)\b/.test(text)) return 'audio clarity';
  if (/\b(visual|slide|screen|font|text|read)\b/.test(text)) return 'visual clarity';
  if (/\b(fast|slow|pace|speed)\b/.test(text)) return 'presentation pace';
  if (/\b(example|demonstration|walk through)\b/.test(text)) return 'example clarity';
  return 'presentation feedback';
}

function signalTheme(signal: AudienceSignal, disposition: ProductDisposition): string {
  if (disposition === 'actionable_feedback') return feedbackTheme(signal);
  if (signal.concept?.trim()) return signal.concept.trim();
  if (signal.canonical_question?.trim()) return signal.canonical_question.trim();
  if (disposition === 'technical') return 'technical issue';
  if (disposition === 'curriculum_navigation') return 'curriculum guidance';
  if (disposition === 'content_opportunity') return 'requested coverage';
  if (disposition === 'positive_signal') return 'positive response';
  if (disposition === 'peer_discussion') return 'peer learning discussion';
  return 'other audience signal';
}

function isSpecificPraise(signal: AudienceSignal): boolean {
  const text = normalizedText(signal.comment_text);
  return /\b(explain|example|visual|step by step|clear|understand|click|helped|teaching)\b/.test(text);
}

function basePriority(category: CreatorAction['category'], strength: EvidenceStrength, frictionScore: number | null): number {
  if (category === 'learning' && frictionScore !== null) return 1000 + frictionScore;
  const categoryWeight: Record<CreatorAction['category'], number> = {
    learning: 700, technical: 650, curriculum_navigation: 500, content_opportunity: 400,
    actionable_feedback: 550, positive_signal: 100, peer_discussion: 150, other_useful: 200,
  };
  const strengthWeight: Record<EvidenceStrength, number> = { strong: 30, recurring: 20, emerging: 10 };
  return categoryWeight[category] + strengthWeight[strength];
}

function makeAction(
  category: CreatorAction['category'],
  theme: string,
  signals: AudienceSignal[],
): CreatorAction {
  const strength = evidenceStrength(signals.length);
  const evidence = signals.slice(0, 3).map((signal) => ({
    commentId: signal.comment_id,
    commentText: signal.comment_text,
    isReply: signal.is_reply,
    parentCommentText: signal.parent_comment_text || null,
  }));
  const templates: Record<Exclude<CreatorAction['category'], 'learning'>, { title: string; summary: string; action: string }> = {
    technical: { title: 'Technical Barrier', summary: `Learners report difficulty with ${theme}.`, action: `Consider checking the example or setup and adding a clarification about ${theme}.` },
    curriculum_navigation: { title: 'Curriculum / Navigation Signal', summary: `Learners are asking about ${theme}.`, action: `Consider clarifying prerequisites, scope, location, or recommended sequence for ${theme}.` },
    content_opportunity: { title: 'Content Opportunity', summary: signals.length === 1 ? `One learner requested ${theme}.` : `Learners are requesting more coverage of ${theme}.`, action: `Consider ${theme} as a future content opportunity.` },
    actionable_feedback: { title: 'Improvement Opportunity', summary: `Audience feedback mentions ${theme}.`, action: `Consider reviewing ${theme} in this part of the presentation.` },
    positive_signal: { title: 'What Worked', summary: `Learners responded positively to ${theme}.`, action: 'Consider preserving this teaching approach in future content.' },
    peer_discussion: { title: 'Peer Learning', summary: 'Audience members are helping explain the material to one another.', action: 'Review this discussion as supporting audience context; no corrective action is implied.' },
    other_useful: { title: 'Other Audience Signal', summary: `Audience members raised a potentially useful signal about ${theme}.`, action: 'Review the supporting comments for context before taking action.' },
  };
  const template = templates[category as Exclude<CreatorAction['category'], 'learning'>];
  return {
    id: `${category}:${normalizedText(theme) || 'general'}`,
    category,
    title: template.title,
    summary: template.summary,
    suggestedAction: template.action,
    evidenceStrength: strength,
    supportingSignalCount: signals.length,
    concept: signals[0]?.concept || null,
    learningFrictionScore: null,
    learningFrictionStatus: null,
    recurringQuestionCount: 0,
    evidenceIds: evidence.map((item) => item.commentId),
    evidence,
    source: 'deterministic',
    priority: basePriority(category, strength, null),
  };
}

function groupSignals(signals: AudienceSignal[], disposition: CreatorAction['category']): CreatorAction[] {
  const groups = new Map<string, AudienceSignal[]>();
  for (const signal of signals) {
    if (disposition === 'positive_signal' && !isSpecificPraise(signal)) continue;
    const theme = signalTheme(signal, disposition);
    const key = normalizedText(theme) || 'general';
    groups.set(key, [...(groups.get(key) || []), signal]);
  }
  return [...groups.entries()]
    .map(([, members]) => makeAction(disposition, signalTheme(members[0], disposition), members))
    .filter((action) => action.evidenceIds.length > 0);
}

function buildLearningInsights(
  clusters: LearningCluster[],
  frictionScores: FrictionRow[],
  diagnoses: Map<string, AiInterpretation>,
): CreatorAction[] {
  return clusters.map((cluster) => {
    const concept = normalizeConcept(cluster.primary_concept);
    const friction = frictionScores.find((score) => score.normalized_concept === concept) || null;
    const recurring = cluster.question_count >= 2;
    const hasFrictionScore = friction?.learning_friction_score != null;
    const strength = hasFrictionScore ? 'strong' : recurring ? 'recurring' : 'emerging';
    const diagnosis = friction && diagnoses.get(concept);
    const evidence = cluster.evidence.slice(0, 3).map((item) => ({
      commentId: item.comment_id,
      commentText: item.comment_text,
      isReply: item.is_reply,
      parentCommentText: item.parent_comment_text || null,
    }));
    const title = diagnosis ? concept : hasFrictionScore
      ? 'Learning Friction'
      : recurring ? 'Recurring Learning Question' : 'Emerging Learning Question';
    const summary = diagnosis?.possibleLearningGap || (hasFrictionScore
      ? 'Learning Friction is supported by the stored evidence. AI interpretation is temporarily unavailable.'
      : recurring
        ? 'Multiple learners are asking a similar question. Evidence is not yet strong enough for a Learning Friction score.'
        : 'An individual learner question was detected. More evidence is needed before treating it as recurring learning friction.');
    const suggestedAction = diagnosis?.recommendedAction || (hasFrictionScore
      ? 'Review the recurring evidence and use the existing AI interpretation option when it becomes available.'
      : recurring
        ? 'Monitor this recurring learner question and consider clarifying it if more evidence accumulates.'
        : 'Keep this learner question visible as an emerging area for attention.');
    return {
      id: `learning:${cluster.cluster_id}`,
      category: 'learning' as const,
      title,
      summary,
      suggestedAction,
      evidenceStrength: strength,
      supportingSignalCount: cluster.question_count,
      concept,
      learningFrictionScore: friction?.learning_friction_score ?? null,
      learningFrictionStatus: hasFrictionScore ? friction?.friction_level ?? null : null,
      recurringQuestionCount: recurring ? 1 : 0,
      evidenceIds: evidence.map((item) => item.commentId),
      evidence,
      source: diagnosis ? 'phase6_ai' : 'deterministic',
      priority: basePriority('learning', strength, friction?.learning_friction_score ?? null),
    };
  });
}

/**
 * Keep a genuine stored learner signal visible when Phase 5 cannot cluster it
 * (for example, because Phase 4 had no canonical question). This is a Phase
 * 6B presentation decision only: it never changes clustering or recurrence.
 */
function buildUnclusteredLearningInsights(signals: AudienceSignal[], clusters: LearningCluster[]): CreatorAction[] {
  const clusteredCommentIds = new Set(clusters.flatMap((cluster) => cluster.evidence.map((item) => item.comment_id)));
  const unclustered = signals.filter((signal) => deriveProductDisposition(signal) === 'learning' && !clusteredCommentIds.has(signal.comment_id));
  const groups = new Map<string, AudienceSignal[]>();
  for (const signal of unclustered) {
    const theme = signal.concept?.trim() || signal.canonical_question?.trim() || 'uncategorized learner difficulty';
    const key = normalizedText(theme);
    groups.set(key, [...(groups.get(key) || []), signal]);
  }
  return [...groups.entries()].map(([, members]) => {
    const concept = members[0].concept?.trim() || null;
    const evidence = members.slice(0, 3).map((signal) => ({
      commentId: signal.comment_id,
      commentText: signal.comment_text,
      isReply: signal.is_reply,
      parentCommentText: signal.parent_comment_text || null,
    }));
    return {
      id: `learning:unclustered:${normalizedText(concept || members[0].canonical_question || 'general')}`,
      category: 'learning' as const,
      title: 'Emerging Learning Signal',
      summary: 'A learner difficulty was detected, but it could not yet be grouped into a recurring canonical question.',
      suggestedAction: 'Review the supporting comment for context and monitor for a similar learner question.',
      // Shared Phase 4 concepts alone are not verified recurrence. They remain
      // emerging until Phase 5 groups the same learner question.
      evidenceStrength: 'emerging' as const,
      supportingSignalCount: members.length,
      concept,
      learningFrictionScore: null,
      learningFrictionStatus: null,
      recurringQuestionCount: 0,
      evidenceIds: evidence.map((item) => item.commentId),
      evidence,
      source: 'deterministic' as const,
      priority: basePriority('learning', 'emerging', null),
    };
  });
}

export function buildCreatorActions(
  signals: AudienceSignal[],
  clusters: LearningCluster[],
  frictionScores: FrictionRow[],
  diagnoses = new Map<string, AiInterpretation>(),
): CreatorActionsResult {
  const dispositionGroups = new Map<ProductDisposition, AudienceSignal[]>();
  for (const disposition of DISPOSITIONS) dispositionGroups.set(disposition, []);
  for (const signal of signals) {
    const disposition = deriveProductDisposition(signal);
    dispositionGroups.get(disposition)!.push(signal);
  }
  const learningInsights = [
    ...buildLearningInsights(clusters, frictionScores, diagnoses),
    ...buildUnclusteredLearningInsights(signals, clusters),
  ];
  const technicalBarriers = groupSignals(dispositionGroups.get('technical')!, 'technical');
  const curriculumNavigation = groupSignals(dispositionGroups.get('curriculum_navigation')!, 'curriculum_navigation');
  const contentOpportunities = groupSignals(dispositionGroups.get('content_opportunity')!, 'content_opportunity');
  const improvementOpportunities = groupSignals(dispositionGroups.get('actionable_feedback')!, 'actionable_feedback');
  const positiveSignals = groupSignals(dispositionGroups.get('positive_signal')!, 'positive_signal');
  const peerLearning = groupSignals(dispositionGroups.get('peer_discussion')!, 'peer_discussion');
  const otherUseful = groupSignals(dispositionGroups.get('other_useful')!, 'other_useful');
  const creatorActions = [
    ...learningInsights, ...technicalBarriers, ...curriculumNavigation, ...contentOpportunities,
    ...improvementOpportunities, ...positiveSignals, ...peerLearning, ...otherUseful,
  ].sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const audienceOverview = Object.fromEntries(DISPOSITIONS.map((disposition) => [disposition, dispositionGroups.get(disposition)!.length])) as Record<ProductDisposition, number>;
  return {
    audienceOverview: {
      ...audienceOverview,
      analyzed: signals.length,
      recurringLearningQuestions: clusters.filter((cluster) => cluster.question_count >= 2).length,
    },
    creatorActions,
    learningInsights,
    technicalBarriers,
    curriculumNavigation,
    contentOpportunities,
    improvementOpportunities,
    positiveSignals,
    peerLearning,
    otherUseful,
  };
}
