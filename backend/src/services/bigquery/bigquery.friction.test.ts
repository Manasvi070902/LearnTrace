const query = jest.fn();

jest.mock('./bigquery.client', () => ({
  getBigQueryClient: () => ({ query }),
}));

import { getClusterEvidence } from './bigquery.friction';

describe('cluster evidence', () => {
  beforeEach(() => {
    query.mockReset();
    process.env.GOOGLE_CLOUD_PROJECT_ID = 'project';
    process.env.BIGQUERY_DATASET = 'dataset';
  });

  it('returns the real source comment joined from BigQuery', async () => {
    query.mockResolvedValueOnce([[{
      cluster_id: 'cluster-1', comment_id: 'comment-1', video_id: 'video-1', similarity_score: 0.91,
      created_at: '2026-09-01T00:00:00Z', comment_text: 'I do not understand two pointers yet.', is_reply: false,
      published_at: '2026-08-31T00:00:00Z',
    }]]);

    const evidence = await getClusterEvidence('cluster-1');

    expect(evidence).toEqual(expect.arrayContaining([expect.objectContaining({
      comment_id: 'comment-1', comment_text: 'I do not understand two pointers yet.',
    })]));
    expect(query.mock.calls[0][0].query).toContain('INNER JOIN');
  });
});
