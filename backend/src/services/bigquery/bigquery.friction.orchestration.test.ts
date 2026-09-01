import { CommentAnalysisRow } from './bigquery.analysis';
import { isEligibleLearningSignal } from './bigquery.friction.orchestration';

const signal = (overrides: Partial<CommentAnalysisRow> = {}): CommentAnalysisRow => ({
  comment_id: 'comment-1', video_id: 'video-1', intent: 'learning_question',
  is_learning_signal: true, canonical_question: 'How do I use two pointers?',
  concept: 'Two Pointers', confusion_strength: 0.7, confidence: 0.8,
  reason: 'Question', model_name: 'phase4-model', prompt_version: 'v1', analyzed_at: '2026-09-01T00:00:00Z',
  ...overrides,
});

describe('Phase 5 source selection', () => {
  it('never sends technical, content, praise, or noise signals into learning clustering', () => {
    expect(isEligibleLearningSignal(signal({ intent: 'technical_error' }))).toBe(false);
    expect(isEligibleLearningSignal(signal({ intent: 'praise' }))).toBe(false);
    expect(isEligibleLearningSignal(signal({ intent: 'noise' }))).toBe(false);
    expect(isEligibleLearningSignal(signal({ intent: 'content_request' }))).toBe(false);
  });

  it('keeps genuine learning questions eligible but excludes curriculum navigation', () => {
    expect(isEligibleLearningSignal(signal({ intent: 'conceptual_confusion' }))).toBe(true);
    expect(isEligibleLearningSignal(signal({ canonical_question: 'How do I identify a two pointer problem?', concept: 'Two Pointers' }))).toBe(true);
    expect(isEligibleLearningSignal(signal({ canonical_question: 'Is the A2Z playlist ordered sequentially?', concept: 'A2Z playlist organization' }))).toBe(false);
    expect(isEligibleLearningSignal(signal({ canonical_question: 'Is DP on trees covered in this playlist?', concept: 'Dynamic Programming' }))).toBe(false);
  });

  it('requires a canonical question and 0.65 confidence', () => {
    expect(isEligibleLearningSignal(signal({ canonical_question: null }))).toBe(false);
    expect(isEligibleLearningSignal(signal({ confidence: 0.64 }))).toBe(false);
    expect(isEligibleLearningSignal(signal())).toBe(true);
  });
});
