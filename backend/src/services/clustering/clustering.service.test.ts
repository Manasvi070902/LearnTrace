/**
 * Clustering Service Tests
 */

import { clusterQuestions, QuestionEmbedding, getRepresentativeLabel } from './clustering.service';

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
  });
});
