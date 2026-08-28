import { mapAnalysisToRow } from './bigquery.analysis';

describe('BigQuery analysis row mapping', () => {
  it('maps analysis fields and metadata', () => {
    const row = mapAnalysisToRow('video-1', { commentId: 'comment-1', intent: 'praise', isLearningSignal: false, canonicalQuestion: null, concept: null, confusionStrength: 0, confidence: 1, reason: 'Generic praise.' });
    expect(row).toMatchObject({ comment_id: 'comment-1', video_id: 'video-1', prompt_version: 'v1', model_name: 'gemini-3.6-flash' });
  });
});