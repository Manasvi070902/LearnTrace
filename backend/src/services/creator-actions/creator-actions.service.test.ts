import { AudienceSignal, buildCreatorActions, deriveProductDisposition, LearningCluster } from './creator-actions.service';
import { FrictionRow } from '../bigquery/bigquery.friction';

const signal = (overrides: Partial<AudienceSignal> = {}): AudienceSignal => ({
  comment_id: `comment-${Math.random()}`,
  video_id: 'video', intent: 'other', is_learning_signal: false,
  canonical_question: null, concept: null, confusion_strength: 0, confidence: 0.9,
  reason: 'Stored classification', model_name: 'model', prompt_version: 'v1', analyzed_at: '2026-01-01',
  comment_text: 'A stored audience comment.', is_reply: false,
  ...overrides,
});

const cluster = (id: string, count: number): LearningCluster => ({
  cluster_id: id, video_id: 'video', cluster_label: `Question ${id}`, primary_concept: 'Concept', question_count: count,
  average_confusion_strength: .6, average_confidence: .9, representative_comment_ids: [], created_at: '2026-01-01', clustering_version: 'v3',
  evidence: Array.from({ length: count }, (_, index) => ({ cluster_id: id, comment_id: `${id}-${index}`, video_id: 'video', similarity_score: 1, created_at: '2026-01-01', comment_text: `Evidence ${index}`, is_reply: false, published_at: '2026-01-01' })),
});

const friction = (): FrictionRow => ({
  video_id: 'video', normalized_concept: 'concept', learning_friction_score: 72, friction_level: 'High', question_count: 3,
  cluster_count: 1, volume_score: 100, confusion_score: 60, recurrence_score: 100, average_confusion_strength: .6,
  evidence_count: 3, calculated_at: '2026-01-01', scoring_version: 'v1',
});

describe('Creator Actions', () => {
  it('accounts for every analyzed comment exactly once', () => {
    const samples: Array<Partial<AudienceSignal>> = [
      { intent: 'conceptual_confusion', is_learning_signal: true, canonical_question: 'Why does this work?', concept: 'Concept' },
      { intent: 'technical_error', canonical_question: 'My environment cannot run this.', concept: 'Setup' },
      { intent: 'learning_question', is_learning_signal: true, canonical_question: 'Which lesson should I study next?', concept: 'Course sequence' },
      { intent: 'content_request', canonical_question: 'Can you cover another example?', concept: 'Follow-up examples' },
      { intent: 'feedback', comment_text: 'The audio is difficult to hear.' },
      { intent: 'praise', comment_text: 'The visual explanation made this click.' },
      { intent: 'other', is_reply: true, comment_text: 'The reason is that each step reuses the prior result.' },
      { intent: 'other', comment_text: 'An observation about the lesson.' },
      { intent: 'noise', comment_text: 'unrelated' },
    ];
    const signals = Array.from({ length: 100 }, (_, index) => signal({ ...samples[index % samples.length], comment_id: `comment-${index}` }));
    const result = buildCreatorActions(signals, [], []);
    const total = Object.entries(result.audienceOverview)
      .filter(([key]) => key !== 'analyzed' && key !== 'recurringLearningQuestions')
      .reduce((sum, [, value]) => sum + Number(value), 0);
    expect(total).toBe(100);
    expect(result.audienceOverview.analyzed).toBe(100);
  });

  it('keeps noise out of Creator Actions', () => {
    expect(deriveProductDisposition(signal({ intent: 'noise' }))).toBe('noise');
    expect(buildCreatorActions([signal({ intent: 'noise' })], [], []).creatorActions).toEqual([]);
  });

  it('labels an isolated learning cluster as emerging without friction or AI', () => {
    const action = buildCreatorActions([], [cluster('one', 1)], []).learningInsights[0];
    expect(action.title).toBe('Emerging Learning Question');
    expect(action.learningFrictionScore).toBeNull();
    expect(action.source).toBe('deterministic');
  });

  it('labels a recurring but unscored learning cluster as recurring', () => {
    const action = buildCreatorActions([], [cluster('two', 2)], []).learningInsights[0];
    expect(action.title).toBe('Recurring Learning Question');
    expect(action.evidenceStrength).toBe('recurring');
  });

  it('reuses a cached Phase 6A interpretation for strong learning friction', () => {
    const diagnoses = new Map([['concept', { summary: 'Evidence suggests a repeated difficulty.', possibleLearningGap: 'Learners may need a clearer bridge.', recommendedAction: 'Add a worked example.', confidence: .8, evidenceClusterIds: ['strong'] }]]);
    const action = buildCreatorActions([], [cluster('strong', 3)], [friction()], diagnoses).learningInsights[0];
    expect(action.source).toBe('phase6_ai');
    expect(action.suggestedAction).toBe('Add a worked example.');
  });

  it('keeps strong deterministic learning evidence visible when Phase 6A is unavailable', () => {
    const action = buildCreatorActions([], [cluster('strong', 3)], [friction()]).learningInsights[0];
    expect(action.title).toBe('Learning Friction');
    expect(action.summary).toContain('temporarily unavailable');
    expect(action.evidenceIds).toHaveLength(3);
  });

  it('aggregates technical, curriculum, content, and feedback signals without treating them as friction', () => {
    const signals = [
      signal({ comment_id: 't1', intent: 'technical_error', concept: 'Environment setup', comment_text: 'The setup fails.' }),
      signal({ comment_id: 't2', intent: 'technical_error', concept: 'Environment setup', comment_text: 'The setup still fails.' }),
      signal({ comment_id: 'c1', intent: 'learning_question', canonical_question: 'What should I study before this?', concept: 'Prerequisites' }),
      signal({ comment_id: 'c2', intent: 'learning_question', canonical_question: 'Which prerequisite should I complete first?', concept: 'Prerequisites' }),
      signal({ comment_id: 'r1', intent: 'content_request', concept: 'Advanced examples' }),
      signal({ comment_id: 'r2', intent: 'content_request', concept: 'Advanced examples' }),
      signal({ comment_id: 'f1', intent: 'feedback', comment_text: 'The audio is too quiet.' }),
      signal({ comment_id: 'f2', intent: 'feedback', comment_text: 'Audio volume is low.' }),
    ];
    const result = buildCreatorActions(signals, [], []);
    expect(result.technicalBarriers).toHaveLength(1);
    expect(result.curriculumNavigation).toHaveLength(1);
    expect(result.contentOpportunities).toHaveLength(1);
    expect(result.improvementOpportunities).toHaveLength(1);
    expect(result.creatorActions.every((action) => action.learningFrictionScore === null)).toBe(true);
  });

  it('promotes specific praise but retains generic praise only in accounting', () => {
    const result = buildCreatorActions([
      signal({ comment_id: 'specific', intent: 'praise', comment_text: 'The visual explanation made this click.' }),
      signal({ comment_id: 'generic', intent: 'praise', comment_text: 'Awesome!' }),
    ], [], []);
    expect(result.audienceOverview.positive_signal).toBe(2);
    expect(result.positiveSignals).toHaveLength(1);
  });

  it('treats a peer explanation as discussion rather than learner confusion', () => {
    const peer = signal({ intent: 'other', is_reply: true, comment_text: 'The reason is that the previous result value is reused at each state.' });
    expect(deriveProductDisposition(peer)).toBe('peer_discussion');
    expect(buildCreatorActions([peer], [], []).peerLearning).toHaveLength(1);
  });

  it('does not turn conversational reply feedback into an improvement action', () => {
    const conversational = signal({ intent: 'feedback', is_reply: true, comment_text: 'Glad it was helpful!' });
    const actionable = signal({ intent: 'feedback', is_reply: true, comment_text: 'Could you slow the pace and clarify this step?' });
    expect(deriveProductDisposition(conversational)).toBe('other_useful');
    expect(deriveProductDisposition(actionable)).toBe('actionable_feedback');
  });

  it('does not treat non-educational reply chatter as peer explanation', () => {
    const chatter = signal({ intent: 'other', is_reply: true, comment_text: 'I think they agreed because they changed it to medium now.' });
    expect(deriveProductDisposition(chatter)).toBe('other_useful');
  });

  it('keeps an unclustered conceptual signal visible without calling it recurring', () => {
    const result = buildCreatorActions([
      signal({ comment_id: 'unclustered', intent: 'conceptual_confusion', is_learning_signal: true, concept: 'State transition logic', canonical_question: null, comment_text: 'I am still confused about the transition.' }),
    ], [], []);
    expect(result.learningInsights).toHaveLength(1);
    expect(result.learningInsights[0]).toMatchObject({ title: 'Emerging Learning Signal', recurringQuestionCount: 0, supportingSignalCount: 1 });
  });

  it('preserves reply context in Creator Action evidence', () => {
    const result = buildCreatorActions([
      signal({ intent: 'feedback', is_reply: true, parent_comment_text: 'Can someone explain the setup?', comment_text: 'Could you clarify the setup?' }),
    ], [], []);
    expect(result.improvementOpportunities[0].evidence[0]).toMatchObject({ isReply: true, parentCommentText: 'Can someone explain the setup?' });
  });

  it('orders strong learning friction ahead of other recurring actions', () => {
    const result = buildCreatorActions([
      signal({ intent: 'technical_error', concept: 'Setup', comment_text: 'The setup fails.' }),
      signal({ intent: 'technical_error', concept: 'Setup', comment_text: 'The setup fails again.' }),
    ], [cluster('strong', 3)], [friction()]);
    expect(result.creatorActions[0].category).toBe('learning');
  });
});
