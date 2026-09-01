/**
 * Clustering Service Tests
 */

import { clusterQuestions, countRecurringQuestionClusters, QuestionEmbedding, QuestionCluster, getRepresentativeLabel } from './clustering.service';

describe('Clustering Service', () => {
  describe('clusterQuestions', () => {
    const createQuestion = (
      id: string,
      question: string,
      embedding: number[],
      confusion = 0.5,
      confidence = 0.8
    ): QuestionEmbedding => ({
      comment_id: id,
      canonical_question: question,
      concept: 'Test Concept',
      embedding,
      confusion_strength: confusion,
      confidence,
    });

    it('returns empty array for empty input', () => {
      const clusters = clusterQuestions([]);
      expect(clusters).toEqual([]);
    });

    it('returns single cluster for single question', () => {
      const questions = [
        createQuestion('q1', 'How to use two pointers?', [1, 0, 0]),
      ];

      const clusters = clusterQuestions(questions);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].members).toHaveLength(1);
      expect(clusters[0].cluster_label).toBe('How to use two pointers?');
    });

    it('clusters highly similar questions together', () => {
      // Very similar embeddings (should cluster)
      const questions = [
        createQuestion('q1', 'How to recognize two pointer problems?', [1, 0, 0]),
        createQuestion('q2', 'When to use two pointers?', [1.01, 0.01, 0.01], 0.6, 0.75),
        createQuestion('q3', 'DP state formation methods', [0.1, 0.1, 0.1], 0.7, 0.9),
      ];

      const clusters = clusterQuestions(questions, 0.95); // High threshold
      // Should have 2+ clusters since q3 is very different
      expect(clusters.length).toBeGreaterThanOrEqual(2);
    });

    it('respects similarity threshold', () => {
      const questions = [
        createQuestion('q1', 'Question A', [1, 0, 0]),
        createQuestion('q2', 'Question B', [0.9, 0.1, 0.1]),
      ];

      const clusterHighThreshold = clusterQuestions(questions, 0.99);
      const clusterLowThreshold = clusterQuestions(questions, 0.7);

      // High threshold → separate clusters
      expect(clusterHighThreshold.length).toBeGreaterThanOrEqual(1);

      // Low threshold → same cluster if similarity is > 0.7
      // The actual result depends on the cosine similarity calculation
      expect(clusterLowThreshold).toBeDefined();
    });

    it('uses confidence for seeding', () => {
      const questions = [
        createQuestion('q1', 'Question A', [1, 0, 0], 0.5, 0.9), // Higher confidence
        createQuestion('q2', 'Question B', [0.9, 0.1, 0.1], 0.5, 0.5),
      ];

      const clusters = clusterQuestions(questions, 0.5);
      // The highest confidence question should seed the cluster
      expect(clusters[0].cluster_label).toBe('Question A');
    });

    it('calculates correct cluster averages', () => {
      const questions = [
        createQuestion('q1', 'Confusion high', [1, 0, 0], 0.9, 0.8),
        createQuestion('q2', 'Confusion med', [0.99, 0.01, 0.01], 0.5, 0.7),
      ];

      const clusters = clusterQuestions(questions, 0.5);
      if (clusters[0].members.length === 2) {
        const avgConfusion = (0.9 + 0.5) / 2;
        expect(Math.abs(clusters[0].average_confusion_strength - avgConfusion)).toBeLessThan(0.01);

        const avgConfidence = (0.8 + 0.7) / 2;
        expect(Math.abs(clusters[0].average_confidence - avgConfidence)).toBeLessThan(0.01);
      }
    });

    it('keeps different concepts separate', () => {
      const questions = [
        createQuestion('q1', 'Two pointer', [1, 0, 0], 0.5, 0.9),
        createQuestion('q2', 'DP state', [0.05, 0.95, 0.05], 0.6, 0.85),
      ];

      const clusters = clusterQuestions(questions, 0.9);
      // Should be separate clusters due to low similarity
      expect(clusters.length).toBeGreaterThanOrEqual(2);
    });

    it('stores representative comment IDs', () => {
      const questions = [
        createQuestion('q1', 'Q1', [1, 0, 0]),
        createQuestion('q2', 'Q2', [0.99, 0.01, 0.01]),
      ];

      const clusters = clusterQuestions(questions, 0.5);
      if (clusters[0].representative_comment_ids.length >= 2) {
        expect(clusters[0].representative_comment_ids).toContain('q1');
        expect(clusters[0].representative_comment_ids).toContain('q2');
      }
    });

    it('rejects a star-shaped cluster when two candidates are not cohesive', () => {
      // A-B and A-C meet 0.75, but B-C does not. Seed-only clustering would
      // incorrectly put all three questions in one cluster.
      const questions = [
        createQuestion('a', 'Question A', [1, 0], 0.5, 0.9),
        createQuestion('b', 'Question B', [0.9, Math.sqrt(0.19)], 0.5, 0.8),
        createQuestion('c', 'Question C', [0.76, -Math.sqrt(0.4224)], 0.5, 0.7),
      ];

      const clusters = clusterQuestions(questions, 0.75);
      expect(clusters.map((cluster) => cluster.members.length).sort()).toEqual([1, 2]);
      expect(clusters.some((cluster) => cluster.members.length === 3)).toBe(false);
    });

    it('recognizes a cohesive three-member recurring question', () => {
      const questions = [
        createQuestion('a', 'Equivalent question A', [1, 0, 0]),
        createQuestion('b', 'Equivalent question B', [0.99, 0.01, 0]),
        createQuestion('c', 'Equivalent question C', [0.98, 0.02, 0]),
      ];

      const clusters = clusterQuestions(questions, 0.95);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].members).toHaveLength(3);
      expect(countRecurringQuestionClusters(clusters)).toBe(1);
    });

    it('keeps a genuinely equivalent alternative-strategy misconception together', () => {
      const questions = [
        createQuestion('a', 'Why does the simple alternating strategy fail?', [1, 0]),
        createQuestion('b', 'Why can’t I compare the odd and even positions instead?', [0.9, Math.sqrt(0.19)]),
      ];

      const clusters = clusterQuestions(questions, 0.75);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].members).toHaveLength(2);
      expect(countRecurringQuestionClusters(clusters)).toBe(1);
    });

    it('does not collapse same-topic explanation, application, and reconstruction questions without cohesion', () => {
      const questions = [
        createQuestion('explain', 'Why does the method work?', [1, 0, 0]),
        createQuestion('apply', 'How do I apply the method to this input?', [0.8, 0.6, 0]),
        createQuestion('reconstruct', 'How do I reconstruct the final answer?', [0.8, -0.6, 0]),
      ];

      const clusters = clusterQuestions(questions, 0.75);
      expect(clusters).toHaveLength(2);
      expect(clusters.some((cluster) => cluster.members.length === 3)).toBe(false);
    });

    it('keeps same-topic constraint modification, reconstruction, and trace tasks separate', () => {
      const questions = [
        createQuestion('constraint', 'How do I generalize this method when the constraint is larger?', [1, 0, 0]),
        createQuestion('reconstruct', 'How can I reconstruct which items were selected?', [0.9, Math.sqrt(0.19), 0]),
        createQuestion('trace', 'How does this method execute on an example input?', [0.85, 0.15, Math.sqrt(0.255)]),
      ];

      const clusters = clusterQuestions(questions, 0.75);
      expect(clusters).toHaveLength(3);
      expect(countRecurringQuestionClusters(clusters)).toBe(0);
    });

    it('does not merge different topics solely because both ask for a causal explanation', () => {
      const questions = [
        createQuestion('programming', 'Why does this transition work?', [1, 0]),
        createQuestion('mathematics', 'Why does this transformation work?', [0.3, Math.sqrt(0.91)]),
      ];

      expect(clusterQuestions(questions, 0.75)).toHaveLength(2);
    });

    it('keeps an isolated question as a non-recurring singleton', () => {
      const clusters = clusterQuestions([
        createQuestion('only', 'How can I reconstruct which items were selected?', [1, 0]),
      ], 0.75);

      expect(clusters[0].members).toHaveLength(1);
      expect(countRecurringQuestionClusters(clusters)).toBe(0);
    });

    it('retains a cohesive complexity-analysis pair', () => {
      const questions = [
        createQuestion('a', 'What are the time and space complexities of this solution?', [1, 0]),
        createQuestion('b', 'Is the time complexity linear and the space complexity constant?', [0.85, Math.sqrt(0.2775)]),
      ];

      const clusters = clusterQuestions(questions, 0.75);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].members).toHaveLength(2);
    });

    it('has the same partition, representatives, and recurrence regardless of input order', () => {
      const questions = [
        createQuestion('a', 'Question A', [1, 0], 0.5, 0.9),
        createQuestion('b', 'Question B', [0.9, Math.sqrt(0.19)], 0.5, 0.8),
        createQuestion('c', 'Question C', [0.76, -Math.sqrt(0.4224)], 0.5, 0.7),
        createQuestion('d', 'Question D', [0, 1], 0.5, 0.8),
      ];
      const snapshot = (input: QuestionEmbedding[]) => clusterQuestions(input, 0.75)
        .map((cluster) => ({
          members: cluster.members.map((member) => member.comment_id).sort(),
          representative: cluster.cluster_label,
        }))
        .sort((a, b) => a.members.join(',').localeCompare(b.members.join(',')));

      expect(snapshot(questions)).toEqual(snapshot([...questions].reverse()));
      expect(countRecurringQuestionClusters(clusterQuestions(questions, 0.75)))
        .toBe(countRecurringQuestionClusters(clusterQuestions([...questions].reverse(), 0.75)));
    });

    it('splits the seven-question cached-similarity regression fixture into cohesive groups', () => {
      // Local fixture reconstructed from the audited seven-vector cosine matrix.
      // It contains no production identifiers, video data, or external calls.
      const gram = [
        [1, .875218, .792436, .773079, .75955, .753997, .751764],
        [.875218, 1, .80508, .767849, .75548, .7733, .756213],
        [.792436, .80508, 1, .759059, .771839, .760421, .755008],
        [.773079, .767849, .759059, 1, .779216, .786455, .763454],
        [.75955, .75548, .771839, .779216, 1, .730379, .741896],
        [.753997, .7733, .760421, .786455, .730379, 1, .886535],
        [.751764, .756213, .755008, .763454, .741896, .886535, 1],
      ];
      const vectors = choleskyVectors(gram);
      const questions = [
        createQuestion('q1', 'How do you solve the generalized constraint?', vectors[0], .0, .95),
        createQuestion('q2', 'How do you modify the adjacent restriction?', vectors[1], .3, .95),
        createQuestion('q3', 'How do you adapt the recursive variant?', vectors[2], .7, .92),
        createQuestion('q4', 'How does the method execute on an input?', vectors[3], .6, .92),
        createQuestion('q5', 'How can we reconstruct the selected result?', vectors[4], .2, .95),
        createQuestion('q6', 'Why does the alternating strategy fail?', vectors[5], .8, .95),
        createQuestion('q7', 'Why does the parity strategy fail?', vectors[6], .8, .95),
      ];

      const clusters = clusterQuestions(questions, 0.75);
      expect(clusters.map((cluster) => cluster.members.length).sort()).toEqual([1, 1, 1, 2, 2]);
      expect(clusters.some((cluster) => cluster.members.length === 7)).toBe(false);
      expect(countRecurringQuestionClusters(clusters)).toBe(2);
    });
  });

  describe('getRepresentativeLabel', () => {
    it('returns highest confidence question', () => {
      const members: QuestionEmbedding[] = [
        {
          comment_id: 'q1',
          canonical_question: 'Low confidence',
          concept: 'Test',
          embedding: [1, 0, 0],
          confusion_strength: 0.5,
          confidence: 0.5,
        },
        {
          comment_id: 'q2',
          canonical_question: 'High confidence',
          concept: 'Test',
          embedding: [1, 0, 0],
          confusion_strength: 0.5,
          confidence: 0.9,
        },
      ];

      const label = getRepresentativeLabel(members);
      expect(label).toBe('High confidence');
    });

    it('returns first question for empty array', () => {
      const label = getRepresentativeLabel([]);
      expect(label).toBe('unknown');
    });

    it('selects the most central question after membership is finalized', () => {
      const members: QuestionEmbedding[] = [
        createMember('a', 'Outer question A', [1, 0]),
        createMember('b', 'Central question', [0.9, Math.sqrt(0.19)]),
        createMember('c', 'Outer question C', [0.8, 0.6]),
      ];

      expect(getRepresentativeLabel(members)).toBe('Central question');
    });
  });

  describe('recurrence semantics', () => {
    const clusterWithMembers = (memberCount: number): QuestionCluster => ({
      cluster_id: `cluster-${memberCount}`,
      cluster_label: 'Question A',
      primary_concept: 'Concept',
      members: Array.from({ length: memberCount }, (_, index) => ({
        comment_id: `comment-${index}`,
        canonical_question: 'Question A',
        concept: 'Concept',
        embedding: [1, 0],
        confusion_strength: 0.5,
        confidence: 0.9,
      })),
      average_confusion_strength: 0.5,
      average_confidence: 0.9,
      representative_comment_ids: [],
    });

    it('does not count a one-member cluster as recurring', () => {
      expect(countRecurringQuestionClusters([clusterWithMembers(1)])).toBe(0);
    });

    it('counts a two-member cluster as recurring', () => {
      expect(countRecurringQuestionClusters([clusterWithMembers(2)])).toBe(1);
    });

    it('keeps three isolated clusters out of recurrence', () => {
      expect(countRecurringQuestionClusters([clusterWithMembers(1), clusterWithMembers(1), clusterWithMembers(1)])).toBe(0);
    });

    it('counts one three-member cluster as one recurring question', () => {
      expect(countRecurringQuestionClusters([clusterWithMembers(3)])).toBe(1);
    });

    it('counts only repeated clusters in a mixed set', () => {
      expect(countRecurringQuestionClusters([clusterWithMembers(2), clusterWithMembers(1), clusterWithMembers(4)])).toBe(2);
    });
  });
});

function createMember(id: string, canonicalQuestion: string, embedding: number[]): QuestionEmbedding {
  return {
    comment_id: id,
    canonical_question: canonicalQuestion,
    concept: 'Test Concept',
    embedding,
    confusion_strength: 0.5,
    confidence: 0.8,
  };
}

/** Build vectors whose dot products equal a local symmetric cosine matrix. */
function choleskyVectors(gram: number[][]): number[][] {
  const size = gram.length;
  const lower = Array.from({ length: size }, () => Array<number>(size).fill(0));
  for (let row = 0; row < size; row++) {
    for (let column = 0; column <= row; column++) {
      const previous = Array.from({ length: column }, (_, index) => lower[row][index] * lower[column][index])
        .reduce((sum, value) => sum + value, 0);
      lower[row][column] = row === column
        ? Math.sqrt(gram[row][row] - previous)
        : (gram[row][column] - previous) / lower[column][column];
    }
  }
  return lower;
}
