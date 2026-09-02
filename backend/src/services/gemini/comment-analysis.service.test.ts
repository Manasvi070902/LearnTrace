import {
  analyzeBatch,
  analyzeComments,
  CommentAnalysis,
  createProviderBatch,
  GeminiBatchValidationError,
  mapBatchResults,
  parseGeminiResponse,
  splitIntoBatches,
  estimateGeminiRequests,
  validateCommentAnalysis,
} from './comment-analysis.service';

const valid = (commentId = 'c1'): CommentAnalysis => ({
  commentId,
  intent: 'learning_question',
  isLearningSignal: true,
  canonicalQuestion: 'What is the complexity?',
  concept: 'Time Complexity',
  confusionStrength: 0.2,
  confidence: 0.9,
  reason: 'It asks a direct educational question.',
});

const input = (count: number) => Array.from({ length: count }, (_, index) => ({ commentId: `c${index + 1}`, text: `Comment ${index + 1}` }));
const response = (items: CommentAnalysis[]) => JSON.stringify({ results: items });
const providerResults = (count: number) => Array.from({ length: count }, (_, index) => valid(`item_${String(index + 1).padStart(3, '0')}`));

describe('comment analysis validation', () => {
  it('accepts valid structured output', () => expect(validateCommentAnalysis(valid()).commentId).toBe('c1'));

  it('rejects invalid intent and out-of-range scores', () => {
    expect(() => validateCommentAnalysis({ ...valid(), intent: 'sentiment' })).toThrow('Invalid intent');
    expect(() => validateCommentAnalysis({ ...valid(), confidence: 1.1 })).toThrow('Invalid confidence');
  });

  it('accepts exactly 50 results and preserves their input mapping', () => {
    const comments = input(50);
    const results = comments.map((comment) => valid(comment.commentId)).reverse();
    expect(mapBatchResults(comments, results).map((item) => item.commentId)).toEqual(comments.map((comment) => comment.commentId));
  });

  it('reports missing result IDs', () => {
    expect(() => mapBatchResults(input(2), [valid('c1')])).toThrow('Expected: 2. Received: 1. Missing IDs: [c2]');
  });

  it('reports extra and unknown result IDs', () => {
    expect(() => mapBatchResults(input(2), [valid('c1'), valid('c2'), valid('unexpected')])).toThrow('Unknown IDs: [unexpected]');
  });

  it('reports duplicate result IDs', () => {
    expect(() => mapBatchResults(input(2), [valid('c1'), valid('c1')])).toThrow('Duplicate IDs: [c1]');
  });

  it('rejects malformed JSON and a missing results envelope', () => {
    expect(() => parseGeminiResponse('{bad')).toThrow('malformed JSON');
    expect(() => parseGeminiResponse(JSON.stringify({ items: [] }))).toThrow('must contain a results array');
  });

  it('allows the prior array envelope during provider-format transition', () => {
    expect(parseGeminiResponse(JSON.stringify([valid()]))).toEqual([valid()]);
  });

  it('uses short batch identifiers and maps them back to the real database comment IDs', () => {
    const comments = [{ commentId: 'UggXE_nsZPzZG3gCoAEC.8Mt7nEtsQiT91X6Fh82SbZ', text: 'A comment' }];
    const providerBatch = createProviderBatch(comments);

    expect(providerBatch.providerComments).toEqual([{ commentId: 'item_001', text: 'A comment' }]);
    expect(providerBatch.mapToSourceComments([valid('item_001')])[0].commentId).toBe(comments[0].commentId);
  });

  it('retries malformed JSON once and persists the successful batch only once', async () => {
    const comments = input(2);
    const requester = jest.fn()
      .mockResolvedValueOnce('{bad')
      .mockResolvedValueOnce(response(providerResults(2)));
    const persisted: string[][] = [];

    await analyzeComments(comments, undefined, async (results) => { persisted.push(results.map((item) => item.commentId)); }, { videoId: 'video-1' }, requester);

    expect(requester).toHaveBeenCalledTimes(2);
    expect(persisted).toEqual([['c1', 'c2']]);
  });

  it('fails clearly after the single validation retry', async () => {
    const requester = jest.fn().mockResolvedValue('{bad');
    await expect(analyzeBatch(input(1), undefined, { videoId: 'video-1' }, requester)).rejects.toThrow('after one retry');
    expect(requester).toHaveBeenCalledTimes(2);
  });

  it('isolates batches: a failed second batch does not duplicate a successful first batch', async () => {
    const previousBatchSize = process.env.GEMINI_BATCH_SIZE;
    process.env.GEMINI_BATCH_SIZE = '2';
    const comments = input(4);
    const requester = jest.fn()
      .mockResolvedValueOnce(response(providerResults(2)))
      .mockResolvedValueOnce(response([valid('item_001')]))
      .mockResolvedValueOnce(response([valid('item_001')]));
    const persisted: string[][] = [];

    try {
      await expect(analyzeComments(comments, undefined, async (results) => { persisted.push(results.map((item) => item.commentId)); }, { videoId: 'video-1' }, requester)).rejects.toThrow('after one retry');
    } finally {
      if (previousBatchSize === undefined) delete process.env.GEMINI_BATCH_SIZE;
      else process.env.GEMINI_BATCH_SIZE = previousBatchSize;
    }

    expect(requester).toHaveBeenCalledTimes(3);
    expect(persisted).toEqual([['c1', 'c2']]);
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
