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
    [50, 200, 150],
    [180, 200, 20],
    [200, 200, 0],
    [200, 250, 50],
  ])('selects %i new conversations for target %i when %i are needed', (existing, target, expected) => {
    const plan = buildAnalysisCoveragePlan(comments, analyzed(existing), target);
    expect(plan.alreadyAnalyzed).toBe(existing);
    expect(plan.newConversationsRequired).toBe(expected);
    expect(plan.selected).toHaveLength(expected);
  });

  it('never selects a cached comment and selection is reproducible', () => {
    const cached = analyzed(50);
    const first = buildAnalysisCoveragePlan(comments, cached, 200);
    const second = buildAnalysisCoveragePlan(comments, cached, 200);
    expect(first.selected.every((comment) => !cached.has(comment.comment_id))).toBe(true);
    expect(first.selected.map((comment) => comment.comment_id)).toEqual(second.selected.map((comment) => comment.comment_id));
  });

  it('resumes from partial completed work by selecting only the remaining comments', () => {
    const plan = buildAnalysisCoveragePlan(comments, analyzed(150), 200);
    expect(plan.selected).toHaveLength(50);
    expect(plan.selected.every((comment) => Number(comment.comment_id.split('-')[1]) > 150)).toBe(true);
  });
});
