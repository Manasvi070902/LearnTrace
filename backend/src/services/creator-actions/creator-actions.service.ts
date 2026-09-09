import { CommentAnalysisRow } from '../bigquery/bigquery.analysis';
import { ClusterEvidenceRow, ClusterRow, FrictionRow } from '../bigquery/bigquery.friction';
import { normalizeConcept } from '../clustering/concept-normalizer';
import { areQuestionSignaturesCompatible, deriveQuestionSignature } from '../clustering/question-signature.service';
import { cosineSimilarity } from '../embedding/embedding.service';
import { deriveSignalDomain } from '../friction/signal-domain.service';
import { getMinSignalsForFrictionScore } from '../friction/friction-scoring.service';
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
  /** The representative canonical question, when the action has one. */
  canonicalQuestion: string | null;
  learningFrictionScore: number | null;
  learningFrictionStatus: string | null;
  recurringQuestionCount: number;
  evidenceIds: string[];
  evidence: ActionEvidence[];
  /** Overall praise retained separately from named teaching strengths. */
  isGeneralPositive?: boolean;
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

function hasActionableFeedbackLanguage(text: string): boolean {
  // The model's `feedback` label alone is not enough. A comment belongs in
  // Video Feedback only when it contains a concrete critique or improvement
  // request about the video/teaching—not when it merely reacts positively or
  // discusses a teacher, textbook, or another viewer's point.
  const directRequest = /\b(would benefit|could you|could be better|you should (add|explain|show|cover|improve)|please (add|explain|show|cover|improve|walk through|clarify)|more (examples|detail|explanation)|less (content|talking|acting)|better (title|explanation|example))\b/.test(text);
  const directProblem = /\b(too (fast|slow|long|short)|hard to (follow|understand|hear|read)|difficult to (follow|understand)|not clear|unclear|confusing|missing|lacks?|needs? improvement|can t hear|cannot hear)\b/.test(text);
  const audioProblem = /\b(audio|sound|microphone|volume)\b.{0,40}\b(too|low|poor|bad|unclear|quiet)\b/.test(text);
  const visualProblem = /\b(visual|slide|screen|font|text)\b.{0,40}\b(too|small|hard to read|unclear|poor|bad)\b/.test(text);
  return directRequest || directProblem || audioProblem || visualProblem;
}

function isActionableFeedback(signal: AudienceSignal): boolean {
  return signal.intent === 'feedback' && hasActionableFeedbackLanguage(normalizedText(signal.comment_text));
}

/** A mislabelled feedback comment can still be useful positive audience context. */
function isPositiveReaction(signal: AudienceSignal): boolean {
  const text = normalizedText(signal.comment_text);
  return !signal.is_reply && /\b(amazing|awesome|wonderful|love|enjoy|enjoying|thank you|thanks|great|good stuff|helpful|clear|well explained|appreciate|mindblowing)\b/.test(text)
    && !hasActionableFeedbackLanguage(text);
}

/** A compliment can contain a clear improvement request; it must not become a teaching strength. */
function praiseContainsConstructiveFeedback(signal: AudienceSignal): boolean {
  return hasActionableFeedbackLanguage(normalizedText(signal.comment_text));
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
    : isPositiveReaction(signal) ? 'positive_signal' : isPeerExplanation(signal) ? 'peer_discussion' : 'other_useful';
  if (signal.intent === 'praise') return praiseContainsConstructiveFeedback(signal) ? 'actionable_feedback' : 'positive_signal';
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

/**
 * Finds a teaching experience that a learner explicitly praised.  This is
 * deliberately domain-general: a lesson's subject or concept is never a
 * "What Worked" theme on its own.
 */
function positiveTeachingTheme(signal: AudienceSignal): string | null {
  const text = normalizedText(signal.comment_text);
  if (/\b(dry run|trace)\b/.test(text)) return 'helpful dry run';
  if (/\b(step by step|stepwise|each step|gradual)\b/.test(text)) return 'step-by-step approach';
  if (/\b(example|examples|demonstration|illustration)\b/.test(text)) return 'worked examples';
  if (/\b(visual|diagram|animation|drawn)\b/.test(text)) return 'visual explanation';
  if (/\b(pace|pacing|speed)\b/.test(text)) return 'good pacing';
  if (/\b(intuition|intuitive)\b/.test(text)) return 'helpful intuition';
  if (/\b(approach|method|strategy)\b/.test(text)) return 'problem-solving approach';
  if (/\b(clear|clarity|well explained|explanation)\b/.test(text)) return 'clear explanation';
  if (/\b(understand|understood|click|helped me)\b/.test(text)) return 'helpful explanation';
  return null;
}

function signalTheme(signal: AudienceSignal, disposition: ProductDisposition): string {
  if (disposition === 'positive_signal') return positiveTeachingTheme(signal) || 'positive feedback';
  if (disposition === 'actionable_feedback') return feedbackTheme(signal);
  // A broad Phase 4 concept such as "Content Opportunity" is useful for
  // categorisation but must not merge different requests into one action.
  // The canonical request preserves the actual thing the learner asked for.
  if (disposition === 'content_opportunity' && signal.canonical_question?.trim()) {
    return signal.canonical_question.trim();
  }
  if (signal.concept?.trim()) return signal.concept.trim();
  if (signal.canonical_question?.trim()) return signal.canonical_question.trim();
  if (disposition === 'technical') return 'technical issue';
  if (disposition === 'curriculum_navigation') return 'curriculum guidance';
  if (disposition === 'content_opportunity') return 'requested coverage';
  if (disposition === 'peer_discussion') return 'peer learning discussion';
  return 'other audience signal';
}

function isSpecificPraise(signal: AudienceSignal): boolean {
  return positiveTeachingTheme(signal) !== null;
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
  idKey = theme,
): CreatorAction {
  const strength = evidenceStrength(signals.length);
  const evidence = signals.map((signal) => ({
    commentId: signal.comment_id,
    commentText: signal.comment_text,
    isReply: signal.is_reply,
    parentCommentText: signal.parent_comment_text || null,
  }));
  const templates: Record<Exclude<CreatorAction['category'], 'learning'>, { title: string; summary: string; action: string }> = {
    technical: { title: 'Technical Barrier', summary: `Learners report difficulty with ${theme}.`, action: `Consider checking the example or setup and adding a clarification about ${theme}.` },
    curriculum_navigation: { title: 'Course & Learning Path', summary: `Learners are asking about ${theme}.`, action: `Consider making guidance about ${theme} easier for learners to find.` },
    content_opportunity: { title: 'Content Opportunity', summary: signals.length === 1 ? `One learner requested ${theme}.` : `Learners are requesting more coverage of ${theme}.`, action: `Consider ${theme} as a future content opportunity.` },
    actionable_feedback: { title: 'Improvement Opportunity', summary: `Audience feedback mentions ${theme}.`, action: `Consider reviewing ${theme} in this part of the presentation.` },
    positive_signal: { title: 'What Worked', summary: `Learners responded positively to ${theme}.`, action: 'Consider preserving this teaching approach in future content.' },
    peer_discussion: { title: 'Peer Learning', summary: 'Audience members are helping explain the material to one another.', action: 'Review this discussion as supporting audience context; no corrective action is implied.' },
    other_useful: { title: 'Other Audience Signal', summary: `Audience members raised a potentially useful signal about ${theme}.`, action: 'Review the supporting comments for context before taking action.' },
  };
  const template = templates[category as Exclude<CreatorAction['category'], 'learning'>];
  const positive = category === 'positive_signal';
  const summary = positive
    ? signals.length === 1
      ? `One comment specifically praised ${theme.toLocaleLowerCase()}.`
      : `Several comments specifically praised ${theme.toLocaleLowerCase()}.`
    : template.summary;
  const suggestedAction = positive
    ? `Continue using ${theme.toLocaleLowerCase()} in future lessons.`
    : template.action;
  return {
    // Some individual feedback cards intentionally share the neutral display
    // theme “presentation feedback”. Their grouping key includes the actual
    // comment, and the persisted workflow ID must retain that uniqueness.
    id: `${category}:${normalizedText(idKey) || 'general'}`,
    category,
    title: template.title,
    summary,
    suggestedAction,
    evidenceStrength: strength,
    supportingSignalCount: signals.length,
    concept: positive ? theme : signals[0]?.concept || null,
    canonicalQuestion: signals[0]?.canonical_question || null,
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
  const generalPositiveSignals: AudienceSignal[] = [];
  for (const signal of signals) {
    if (disposition === 'positive_signal' && !isSpecificPraise(signal)) {
      generalPositiveSignals.push(signal);
      continue;
    }
    const theme = signalTheme(signal, disposition);
    const normalizedTheme = normalizedText(theme) || 'general';
    // A neutral display fallback is not evidence that unrelated feedback
    // comments form a repeated theme.
    const genericContentRequest = disposition === 'content_opportunity'
      && ['learner request', 'content request', 'content opportunity', 'requested coverage', 'more content'].includes(normalizedTheme);
    const key = (disposition === 'actionable_feedback' && normalizedTheme === 'presentation feedback') || genericContentRequest
      ? `${normalizedTheme}:${normalizedText(signal.comment_text) || signal.comment_id}`
      : normalizedTheme;
    groups.set(key, [...(groups.get(key) || []), signal]);
  }
  const actions = [...groups.entries()]
    .map(([key, members]) => makeAction(disposition, signalTheme(members[0], disposition), members, key))
    .filter((action) => action.evidenceIds.length > 0);
  if (disposition === 'positive_signal' && generalPositiveSignals.length > 0) {
    const action = makeAction(disposition, 'general teaching appreciation', generalPositiveSignals);
    actions.push({
      ...action,
      title: 'General teaching appreciation',
      summary: `${generalPositiveSignals.length} positive comment${generalPositiveSignals.length === 1 ? '' : 's'} appreciated the teaching overall without naming a specific approach.`,
      suggestedAction: 'Treat this as overall positive audience feedback while keeping named teaching strengths separate.',
      isGeneralPositive: true,
    });
  }
  return actions;
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
    // Friction and the creator-facing card both operate at concept level.
    const hasClusterFriction = friction?.learning_friction_score != null
      && cluster.question_count >= getMinSignalsForFrictionScore();
    const strength = hasClusterFriction ? 'strong' : recurring ? 'recurring' : 'emerging';
    const diagnosis = hasClusterFriction ? diagnoses.get(concept) : undefined;
    const evidence = cluster.evidence.map((item) => ({
      commentId: item.comment_id,
      commentText: item.comment_text,
      isReply: item.is_reply,
      parentCommentText: item.parent_comment_text || null,
    }));
    const title = diagnosis ? concept : hasClusterFriction
      ? 'Learning Friction'
      : recurring ? 'Recurring Learning Question' : 'Emerging Learning Question';
    const summary = diagnosis?.possibleLearningGap || (hasClusterFriction
      ? 'Learning Friction is supported by the stored evidence. AI interpretation is temporarily unavailable.'
      : recurring
        ? 'Multiple learners are asking a similar question. Evidence is not yet strong enough for a Learning Friction score.'
        : 'An individual learner question was detected. More evidence is needed before treating it as recurring learning friction.');
    const suggestedAction = diagnosis?.recommendedAction || (hasClusterFriction
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
      canonicalQuestion: cluster.cluster_label,
      learningFrictionScore: hasClusterFriction ? friction?.learning_friction_score ?? null : null,
      learningFrictionStatus: hasClusterFriction ? friction?.friction_level ?? null : null,
      recurringQuestionCount: recurring ? 1 : 0,
      evidenceIds: evidence.map((item) => item.commentId),
      evidence,
      source: diagnosis ? 'phase6_ai' : 'deterministic',
      priority: basePriority('learning', strength, hasClusterFriction ? friction?.learning_friction_score ?? null : null),
    };
  });
}

/**
 * An incremental analysis can leave adjacent clusters for exactly the same
 * creator-facing concept. They are one learner need, not duplicate cards.
 * Clustering is intentionally stricter than the audience view, so consolidate
 * neighbouring clusters by their normalized concept here.
 */
export function getSemanticTopicSimilarityThreshold(): number {
  const configured = Number(process.env.QUESTION_TOPIC_SIMILARITY_THRESHOLD || 0.66);
  return Number.isFinite(configured) ? Math.min(0.95, Math.max(0.5, configured)) : 0.66;
}

function conceptWords(cluster: LearningCluster): Set<string> {
  return new Set(normalizedText(`${cluster.primary_concept} ${cluster.cluster_label}`).split(' ').filter((word) => word.length > 2 && !['what', 'which', 'does', 'this', 'that', 'the', 'and', 'for', 'from', 'with', 'video', 'used', 'use', 'anyone', 'know', 'can', 'get', 'guide', 'tool', 'app', 'application', 'program', 'software'].includes(word)));
}

function clusterVector(cluster: LearningCluster, embeddings: ReadonlyMap<string, number[]>): number[] | null {
  const vectors = cluster.evidence
    .map((item) => embeddings.get(item.comment_id))
    .filter((vector): vector is number[] => Boolean(vector?.length));
  if (!vectors.length) return null;
  const dimensions = vectors[0].length;
  if (vectors.some((vector) => vector.length !== dimensions)) return null;
  return Array.from({ length: dimensions }, (_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length);
}

/** Identifies the answer being requested, not a video-specific subject. */
function questionPurpose(cluster: LearningCluster): 'tool_identification' | null {
  const text = normalizedText(cluster.cluster_label);
  const asksWhoOrWhat = /\b(what|which|name|anyone know|does anyone know|can someone tell)\b/.test(text);
  const namesAResource = /\b(tool|app|application|program|software)\b/.test(text);
  return asksWhoOrWhat && namesAResource ? 'tool_identification' : null;
}

function clustersCanShareTopic(left: LearningCluster, right: LearningCluster, embeddings: ReadonlyMap<string, number[]>): boolean {
  const leftConcept = normalizeConcept(left.primary_concept);
  const rightConcept = normalizeConcept(right.primary_concept);
  const leftRole = deriveQuestionSignature(left.cluster_label);
  const rightRole = deriveQuestionSignature(right.cluster_label);
  if (!areQuestionSignaturesCompatible(leftRole, rightRole)) return false;
  if (leftConcept === rightConcept) return true;

  // Different model labels must still share a meaningful descriptive word
  // before an embedding can join them. Resource nouns such as "tool" are too
  // broad on their own and are handled by the narrower purpose check below.
  const leftWords = conceptWords(left);
  const hasSharedTopicWord = [...conceptWords(right)].some((word) => leftWords.has(word));
  const sharesToolIdentificationPurpose = questionPurpose(left) === 'tool_identification'
    && questionPurpose(right) === 'tool_identification';
  if (!hasSharedTopicWord && !sharesToolIdentificationPurpose) return false;
  const leftVector = clusterVector(left, embeddings);
  const rightVector = clusterVector(right, embeddings);
  if (!leftVector || !rightVector) return false;
  const similarity = cosineSimilarity(leftVector, rightVector);
  if (hasSharedTopicWord && similarity >= getSemanticTopicSimilarityThreshold()) return true;
  // Short resource-identification questions are often paraphrased with very
  // little shared vocabulary ("drawing" vs "diagramming"). Treat them as the
  // same topic only when both ask for the name of a tool/app/etc. and their
  // existing embeddings still show a meaningful relationship.
  return sharesToolIdentificationPurpose && similarity >= 0.54;
}

function mergeTopicMembers(key: string, members: LearningCluster[]): LearningCluster {
  if (members.length === 1) return members[0];
    const first = members[0];
    const evidenceByCommentId = new Map<string, LearningCluster['evidence'][number]>();
    for (const member of members) {
      for (const item of member.evidence) {
        if (!evidenceByCommentId.has(item.comment_id)) evidenceByCommentId.set(item.comment_id, item);
      }
    }
    const memberTotal = members.reduce((sum, member) => sum + member.question_count, 0);
    const questionCount = evidenceByCommentId.size || memberTotal;
    const weight = Math.max(1, memberTotal);
  return {
      ...first,
      cluster_id: `merged:${key}`,
      question_count: questionCount,
      average_confusion_strength: members.reduce((sum, member) => sum + member.average_confusion_strength * member.question_count, 0) / weight,
      average_confidence: members.reduce((sum, member) => sum + member.average_confidence * member.question_count, 0) / weight,
      representative_comment_ids: [...new Set(members.flatMap((member) => member.representative_comment_ids))],
      evidence: [...evidenceByCommentId.values()],
  };
}

/**
 * Builds the creator-facing semantic-topic layer on top of strict stored
 * clusters. It never changes stored clusters or their membership. A candidate
 * must be compatible with every cluster already in a topic, preventing one
 * loosely related comment from chaining unrelated topics together.
 */
export function groupClustersIntoSemanticTopics(
  clusters: LearningCluster[],
  embeddings: ReadonlyMap<string, number[]> = new Map(),
): LearningCluster[] {
  const topics: LearningCluster[][] = [];
  for (const cluster of [...clusters].sort((left, right) => left.cluster_id.localeCompare(right.cluster_id))) {
    const compatibleTopic = topics.find((topic) => topic.every((member) => clustersCanShareTopic(member, cluster, embeddings)));
    if (compatibleTopic) compatibleTopic.push(cluster);
    else topics.push([cluster]);
  }
  return topics.map((members) => mergeTopicMembers(normalizeConcept(members[0].primary_concept), members));
}

/**
 * Keep a genuine stored learner signal visible when Phase 5 cannot cluster it
 * (for example, because Phase 4 had no canonical question). This is a Phase
 * 6B presentation decision only: it never changes clustering or recurrence.
 */
function buildUnclusteredLearningInsights(signals: AudienceSignal[], clusters: LearningCluster[]): CreatorAction[] {
  const clusteredCommentIds = new Set(clusters.flatMap((cluster) => cluster.evidence.map((item) => item.comment_id)));
  const unclustered = signals.filter((signal) => deriveProductDisposition(signal) === 'learning' && !clusteredCommentIds.has(signal.comment_id));
  // An absent cluster means recurrence was not proven. In particular, a broad
  // concept or a missing canonical question must never merge unrelated source
  // comments into a misleading "3+ learners" signal.
  return unclustered.map((signal) => {
    const concept = signal.concept?.trim() || null;
    const evidence = [{
      commentId: signal.comment_id,
      commentText: signal.comment_text,
      isReply: signal.is_reply,
      parentCommentText: signal.parent_comment_text || null,
    }];
    return {
      id: `learning:unclustered:${signal.comment_id}`,
      category: 'learning' as const,
      title: 'Emerging Learning Signal',
      summary: 'A learner difficulty was detected, but it could not yet be grouped into a recurring canonical question.',
      suggestedAction: 'Review the supporting comment for context and monitor for a similar learner question.',
      // Shared Phase 4 concepts alone are not verified recurrence. They remain
      // emerging until Phase 5 groups the same learner question.
      evidenceStrength: 'emerging' as const,
      supportingSignalCount: 1,
      concept,
      canonicalQuestion: signal.canonical_question || null,
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

/**
 * BigQuery should already return one latest analysis per comment, but creator
 * views must remain correct if an import or legacy row introduces a duplicate.
 */
function uniqueSignalsByCommentId(signals: AudienceSignal[]): AudienceSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    if (!signal.comment_id || seen.has(signal.comment_id)) return false;
    seen.add(signal.comment_id);
    return true;
  });
}

export function buildCreatorActions(
  signals: AudienceSignal[],
  clusters: LearningCluster[],
  frictionScores: FrictionRow[],
  diagnoses = new Map<string, AiInterpretation>(),
  topicEmbeddings: ReadonlyMap<string, number[]> = new Map(),
): CreatorActionsResult {
  const uniqueSignals = uniqueSignalsByCommentId(signals);
  const mergedLearningClusters = groupClustersIntoSemanticTopics(clusters, topicEmbeddings);
  const dispositionGroups = new Map<ProductDisposition, AudienceSignal[]>();
  for (const disposition of DISPOSITIONS) dispositionGroups.set(disposition, []);
  for (const signal of uniqueSignals) {
    const disposition = deriveProductDisposition(signal);
    dispositionGroups.get(disposition)!.push(signal);
  }
  const learningInsights = [
    ...buildLearningInsights(mergedLearningClusters, frictionScores, diagnoses),
    ...buildUnclusteredLearningInsights(uniqueSignals, mergedLearningClusters),
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
      analyzed: uniqueSignals.length,
      recurringLearningQuestions: mergedLearningClusters.filter((cluster) => cluster.question_count >= 2).length,
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
