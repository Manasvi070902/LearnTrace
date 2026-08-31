const query = jest.fn();

jest.mock('./bigquery.client', () => ({
  getBigQueryClient: () => ({ query }),
}));

import { getStoredEmbedding } from './bigquery.embedding';

describe('embedding cache', () => {
  beforeEach(() => {
    query.mockReset();
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'project';
    process.env.BIGQUERY_DATASET = 'dataset';
  });

  it('reuses an embedding by canonical question rather than comment id', async () => {
    query.mockResolvedValueOnce([[{
      comment_id: 'first-comment', video_id: 'first-video', canonical_question: 'When should I use two pointers?',
      concept: 'Two Pointers', embedding: [0.1, 0.2], embedding_model: 'gemini-embedding-001', prompt_version: 'v1', created_at: '2026-09-01T00:00:00Z',
    }]]);

    const cached = await getStoredEmbedding('When should I use two pointers?', 'gemini-embedding-001', 'v1');

    expect(cached?.embedding).toEqual([0.1, 0.2]);
    expect(query.mock.calls[0][0].query).not.toContain('comment_id = @comment_id');
    expect(query.mock.calls[0][0].params).toMatchObject({ canonical_question: 'When should I use two pointers?' });
  });
});
