/**
 * Concept Normalizer Tests
 */

import { normalizeConcept, normalizeConcepts, createConceptMapping } from './concept-normalizer';

describe('Concept Normalizer', () => {
  describe('normalizeConcept', () => {
    it('normalizes DP state variations', () => {
      expect(normalizeConcept('Dynamic Programming State')).toBe('DP State');
      expect(normalizeConcept('DP State')).toBe('DP State');
      expect(normalizeConcept('DP State Formation')).toBe('DP State');
      expect(normalizeConcept('dp state')).toBe('DP State');
    });

    it('normalizes recurrence variations', () => {
      expect(normalizeConcept('Recurrence Relation')).toBe('Recurrence Relation');
      expect(normalizeConcept('recurrence derivation')).toBe('Recurrence Relation');
      expect(normalizeConcept('Recurrence')).toBe('Recurrence Relation');
    });

    it('normalizes memoization', () => {
      expect(normalizeConcept('Memoization')).toBe('Memoization');
      expect(normalizeConcept('memoization technique')).toBe('Memoization');
      expect(normalizeConcept('MEMOIZATION')).toBe('Memoization');
    });

    it('normalizes two pointer technique', () => {
      expect(normalizeConcept('Two Pointer')).toBe('Two Pointer Technique');
      expect(normalizeConcept('two pointers')).toBe('Two Pointer Technique');
      expect(normalizeConcept('Two Pointer Technique')).toBe('Two Pointer Technique');
    });

    it('normalizes time complexity', () => {
      expect(normalizeConcept('Time Complexity')).toBe('Time Complexity');
      expect(normalizeConcept('Complexity Analysis')).toBe('Time Complexity');
      expect(normalizeConcept('time complexity calculation')).toBe('Time Complexity');
    });

    it('returns original for unmatched concepts', () => {
      const original = 'Custom Algorithm Technique';
      const normalized = normalizeConcept(original);
      expect(normalized).toBe(original);
    });

    it('handles null and empty strings', () => {
      expect(normalizeConcept(null)).toBe('uncategorized');
      expect(normalizeConcept('')).toBe('uncategorized');
      expect(normalizeConcept('   ')).toBe('uncategorized');
    });

    it('is case-insensitive', () => {
      expect(normalizeConcept('TWO POINTER')).toBe('Two Pointer Technique');
      expect(normalizeConcept('MEMOIZATION')).toBe('Memoization');
      expect(normalizeConcept('dynamic programming state')).toBe('DP State');
    });
  });

  describe('normalizeConcepts', () => {
    it('batch normalizes array of concepts', () => {
      const concepts = [
        'DP State',
        'Recurrence',
        'Two Pointers',
        'Unknown Concept',
      ];

      const normalized = normalizeConcepts(concepts);
      expect(normalized).toHaveLength(4);
      expect(normalized[0]).toBe('DP State');
      expect(normalized[1]).toBe('Recurrence Relation');
      expect(normalized[2]).toBe('Two Pointer Technique');
    });

    it('handles null values in batch', () => {
      const concepts = [
        'DP State',
        null,
        'Two Pointers',
      ];

      const normalized = normalizeConcepts(concepts);
      expect(normalized[1]).toBe('uncategorized');
    });
  });

  describe('createConceptMapping', () => {
    it('creates mapping from original to normalized', () => {
      const originals = [
        'DP State',
        'Dynamic Programming State',
        'DP State Formation',
        'Unknown',
      ];

      const mapping = createConceptMapping(originals);
      expect(mapping.get('DP State')).toBe('DP State');
      expect(mapping.get('Dynamic Programming State')).toBe('DP State');
      expect(mapping.get('DP State Formation')).toBe('DP State');
    });

    it('skips null values', () => {
      const originals = [
        'DP State',
        null,
        'Two Pointers',
      ];

      const mapping = createConceptMapping(originals);
      expect(mapping.size).toBe(2);
      expect(mapping.has(null as any)).toBe(false);
    });

    it('removes duplicates', () => {
      const originals = [
        'DP State',
        'DP State',
        'Dynamic Programming State',
      ];

      const mapping = createConceptMapping(originals);
      expect(mapping.size).toBeLessThanOrEqual(2);
    });
  });

  describe('concept deduplication behavior', () => {
    it('does not conflate different concepts', () => {
      const dpState = normalizeConcept('DP State');
      const dpComplexity = normalizeConcept('DP Time Complexity');

      // Both should NOT become the same
      // dpComplexity doesn't match 'DP State' patterns
      expect(dpState).toBe('DP State');
      expect(dpComplexity).not.toBe('DP State');
    });

    it('does merge legitimate variations of same concept', () => {
      const v1 = normalizeConcept('Two Pointer');
      const v2 = normalizeConcept('Two Pointers');
      const v3 = normalizeConcept('Two Pointer Technique');

      expect(v1).toBe('Two Pointer Technique');
      expect(v2).toBe('Two Pointer Technique');
      expect(v3).toBe('Two Pointer Technique');
    });
  });
});
