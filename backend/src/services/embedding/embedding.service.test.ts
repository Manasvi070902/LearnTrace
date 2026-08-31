/**
 * Embedding Service Tests
 */

import { cosineSimilarity } from './embedding.service';

describe('Embedding Service', () => {
  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const vec = [1, 0, 0];
      const similarity = cosineSimilarity(vec, vec);
      expect(Math.abs(similarity - 1.0)).toBeLessThan(0.0001);
    });

    it('returns -1 for opposite vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [-1, 0, 0];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(Math.abs(similarity - (-1.0))).toBeLessThan(0.0001);
    });

    it('returns 0 for orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(Math.abs(similarity - 0.0)).toBeLessThan(0.0001);
    });

    it('handles normalized vectors correctly', () => {
      const vecA = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
      const vecB = [1 / Math.sqrt(2), 1 / Math.sqrt(2), 0];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(Math.abs(similarity - 1.0)).toBeLessThan(0.0001);
    });

    it('throws on mismatched vector lengths', () => {
      const vecA = [1, 0];
      const vecB = [1, 0, 0];
      expect(() => cosineSimilarity(vecA, vecB)).toThrow();
    });

    it('returns 0 for zero vectors', () => {
      const vecA = [0, 0, 0];
      const vecB = [1, 1, 1];
      const similarity = cosineSimilarity(vecA, vecB);
      expect(similarity).toBe(0);
    });

    it('handles partially similar vectors', () => {
      const vecA = [1, 0, 0, 0];
      const vecB = [0.5, 0.5, 0.5, 0.5];
      const similarity = cosineSimilarity(vecA, vecB);
      // Should be positive but less than 1
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });
  });
});
