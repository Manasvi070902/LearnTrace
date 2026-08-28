import { mapBatchResults, parseGeminiResponse, validateCommentAnalysis, CommentAnalysis, splitIntoBatches, estimateGeminiRequests } from './comment-analysis.service';

const valid: CommentAnalysis = { commentId: 'c1', intent: 'learning_question', isLearningSignal: true, canonicalQuestion: 'What is the complexity?', concept: 'Time Complexity', confusionStrength: 0.2, confidence: 0.9, reason: 'It asks a direct educational question.' };

describe('comment analysis validation', () => {
  it('accepts valid structured output', () => expect(validateCommentAnalysis(valid).commentId).toBe('c1'));
  it('rejects invalid intent and out-of-range scores', () => {
    expect(() => validateCommentAnalysis({ ...valid, intent: 'sentiment' })).toThrow('Invalid intent');
    expect(() => validateCommentAnalysis({ ...valid, confidence: 1.1 })).toThrow('Invalid confidence');
  });
  it('rejects malformed JSON and partial batches', () => {
    expect(() => parseGeminiResponse('{bad')).toThrow('malformed JSON');
    expect(() => mapBatchResults([{ commentId: 'c1', text: 'x' }, { commentId: 'c2', text: 'y' }], [valid])).toThrow('exactly one');
  });
  it('maps results back to input order by commentId', () => {
    const second = { ...valid, commentId: 'c2' };
    expect(mapBatchResults([{ commentId: 'c1', text: 'x' }, { commentId: 'c2', text: 'y' }], [second, valid]).map((item) => item.commentId)).toEqual(['c1', 'c2']);
  });
  it('calculates request counts for full, partial, and cached samples', () => {
    expect(estimateGeminiRequests(50, 50)).toBe(1);
    expect(estimateGeminiRequests(75, 50)).toBe(2);
    expect(estimateGeminiRequests(10, 50)).toBe(1);
    expect(estimateGeminiRequests(0, 50)).toBe(0);
  });
  it('splits a 50-comment sample into one batch at capacity', () => {
    expect(splitIntoBatches(Array.from({ length: 50 }, (_, index) => index), 50).map((batch) => batch.length)).toEqual([50]);
  });
});