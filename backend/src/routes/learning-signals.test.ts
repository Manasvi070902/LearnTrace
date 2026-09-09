import { buildAnalysisCoveragePlan, SourceComment } from './learning-signals';

const comments: SourceComment[] = Array.from({ length: 260 }, (_, index) => ({
  comment_id: `comment-${index + 1}`,
  comment_text: `Comment ${index + 1}`,
  is_reply: index % 2 === 0,
  like_count: index % 3 === 0 ? 1 : 0,
  published_at: `2026-01-${String((index % 28) + 1).padStart(2, '0')}T00:00:00Z`,
}));

const analyzed = (count: number) => new Set(comments.slice(0, count).map((comment) => comment.comment_id));

describe('analysis coverage planning', () => {
  it.each([
    [50, 100, 100],
    [180, 100, 80],
    [200, 100, 60],
    [200, 50, 50],
  ])('selects up to %i new conversations for batch size %i', (existing, target, expected) => {
    const plan = buildAnalysisCoveragePlan(comments, analyzed(existing), target);
    expect(plan.alreadyAnalyzed).toBe(existing);
    expect(plan.newConversationsRequired).toBe(expected);
    expect(plan.selected).toHaveLength(expected);
  });

  it('never selects a cached comment and selection is reproducible', () => {
    const cached = analyzed(50);
    const first = buildAnalysisCoveragePlan(comments, cached, 100);
    const second = buildAnalysisCoveragePlan(comments, cached, 100);
    expect(first.selected.every((comment) => !cached.has(comment.comment_id))).toBe(true);
    expect(first.selected.map((comment) => comment.comment_id)).toEqual(second.selected.map((comment) => comment.comment_id));
  });

  it('continues with the next batch after partial completed work', () => {
    const plan = buildAnalysisCoveragePlan(comments, analyzed(150), 100);
    expect(plan.selected).toHaveLength(100);
    expect(plan.selected.every((comment) => Number(comment.comment_id.split('-')[1]) > 150)).toBe(true);
  });

  it('does not submit duplicate source rows as separate comments', () => {
    const duplicateSource = [...comments.slice(0, 100), { ...comments[0] }, { ...comments[1] }];
    const plan = buildAnalysisCoveragePlan(duplicateSource, new Set(), 100);
    expect(plan.availableConversations).toBe(100);
    expect(new Set(plan.selected.map((comment) => comment.comment_id)).size).toBe(100);
  });
});
