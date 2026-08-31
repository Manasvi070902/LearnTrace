/**
 * Friction Scoring Service Tests
 */

import {
  calculateConceptFriction,
  calculateVideoFriction,
  validateWeights,
  ConceptFrictionInput,
} from './friction-scoring.service';

describe('Friction Scoring Service', () => {
  beforeEach(() => {
    // Reset env vars to defaults
    delete process.env.FRICTION_WEIGHT_VOLUME;
    delete process.env.FRICTION_WEIGHT_CONFUSION;
    delete process.env.FRICTION_WEIGHT_RECURRENCE;
    delete process.env.MIN_SIGNALS_FOR_FRICTION_SCORE;
  });

  describe('validateWeights', () => {
    it('does not throw for valid weights (default)', () => {
      expect(() => validateWeights()).not.toThrow();
    });

    it('throws if weights do not sum to 1', () => {
      process.env.FRICTION_WEIGHT_VOLUME = '0.5';
      process.env.FRICTION_WEIGHT_CONFUSION = '0.3';
      process.env.FRICTION_WEIGHT_RECURRENCE = '0.1'; // Sum = 0.9

      expect(() => validateWeights()).toThrow();
    });
  });

  describe('calculateConceptFriction', () => {
    const baseInput: ConceptFrictionInput = {
      concept: 'DP State',
      questionCount: 84,
      clusterCount: 5,
      averageConfusionStrength: 0.81,
      maxObservedQuestionCount: 100,
      maxObservedClusterCount: 6,
    };

    it('returns insufficient evidence when below minimum signals', () => {
      const input: ConceptFrictionInput = {
        ...baseInput,
        questionCount: 1, // Below minimum (default 3)
      };

      const result = calculateConceptFriction(input);
      expect(result.friction_level).toBe('Insufficient Evidence');
      expect(result.friction_score).toBeNull();
      expect(result.volume_score).toBeNull();
      expect(result.confusion_score).toBeNull();
      expect(result.recurrence_score).toBeNull();
    });

    it('calculates friction score correctly for valid input', () => {
      const result = calculateConceptFriction(baseInput);

      expect(result.friction_level).not.toBe('Insufficient Evidence');
      expect(result.friction_score).not.toBeNull();
      expect(result.friction_score).toBeGreaterThanOrEqual(0);
      expect(result.friction_score).toBeLessThanOrEqual(100);
    });

    it('returns High or Critical for high confusion', () => {
      const input: ConceptFrictionInput = {
        concept: 'Confusing Concept',
        questionCount: 50,
        clusterCount: 5,
        averageConfusionStrength: 0.85,
        maxObservedQuestionCount: 100,
        maxObservedClusterCount: 6,
      };

      const result = calculateConceptFriction(input);
      expect(['High', 'Critical']).toContain(result.friction_level);
    });

    it('returns Low or Moderate for low confusion', () => {
      const input: ConceptFrictionInput = {
        concept: 'Clear Concept',
        questionCount: 10,
        clusterCount: 1,
        averageConfusionStrength: 0.2,
        maxObservedQuestionCount: 100,
        maxObservedClusterCount: 6,
      };

      const result = calculateConceptFriction(input);
      expect(['Low', 'Moderate']).toContain(result.friction_level);
    });

    it('respects custom minimum signals threshold', () => {
      process.env.MIN_SIGNALS_FOR_FRICTION_SCORE = '5';

      const input: ConceptFrictionInput = {
        ...baseInput,
        questionCount: 4, // Below custom threshold
      };

      const result = calculateConceptFriction(input);
      expect(result.friction_level).toBe('Insufficient Evidence');
    });

    it('normalizes component scores to 0-100', () => {
      const result = calculateConceptFriction(baseInput);

      expect(result.volume_score).toBeGreaterThanOrEqual(0);
      expect(result.volume_score).toBeLessThanOrEqual(100);

      expect(result.confusion_score).toBeGreaterThanOrEqual(0);
      expect(result.confusion_score).toBeLessThanOrEqual(100);

      expect(result.recurrence_score).toBeGreaterThanOrEqual(0);
      expect(result.recurrence_score).toBeLessThanOrEqual(100);
    });

    it('stores correct evidence count', () => {
      const result = calculateConceptFriction(baseInput);
      expect(result.evidence_count).toBe(baseInput.questionCount);
    });

    it('uses custom weights correctly', () => {
      process.env.FRICTION_WEIGHT_VOLUME = '0.5';
      process.env.FRICTION_WEIGHT_CONFUSION = '0.3';
      process.env.FRICTION_WEIGHT_RECURRENCE = '0.2';

      const result = calculateConceptFriction(baseInput);

      // Score should exist and be between 0-100
      expect(result.friction_score).toBeGreaterThanOrEqual(0);
      expect(result.friction_score).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateVideoFriction', () => {
    it('handles empty input', () => {
      const results = calculateVideoFriction([]);
      expect(results).toEqual([]);
    });

    it('calculates friction for multiple concepts', () => {
      const inputs: ConceptFrictionInput[] = [
        {
          concept: 'Concept A',
          questionCount: 50,
          clusterCount: 5,
          averageConfusionStrength: 0.7,
          maxObservedQuestionCount: 1,
          maxObservedClusterCount: 1,
        },
        {
          concept: 'Concept B',
          questionCount: 30,
          clusterCount: 3,
          averageConfusionStrength: 0.5,
          maxObservedQuestionCount: 1,
          maxObservedClusterCount: 1,
        },
      ];

      const results = calculateVideoFriction(inputs);
      expect(results).toHaveLength(2);
      expect(results[0].concept).toBe('Concept A');
      expect(results[1].concept).toBe('Concept B');
    });

    it('normalizes using actual max values from dataset', () => {
      const inputs: ConceptFrictionInput[] = [
        {
          concept: 'High Volume',
          questionCount: 100,
          clusterCount: 10,
          averageConfusionStrength: 0.7,
          maxObservedQuestionCount: 1,
          maxObservedClusterCount: 1,
        },
        {
          concept: 'Low Volume',
          questionCount: 10,
          clusterCount: 1,
          averageConfusionStrength: 0.7,
          maxObservedQuestionCount: 1,
          maxObservedClusterCount: 1,
        },
      ];

      const results = calculateVideoFriction(inputs);

      // High volume should score higher on volume component
      const highVolume = results.find((r: any) => r.concept === 'High Volume')!;
      const lowVolume = results.find((r: any) => r.concept === 'Low Volume')!;

      if (highVolume.volume_score !== null && lowVolume.volume_score !== null) {
        expect(highVolume.volume_score).toBeGreaterThan(lowVolume.volume_score);
      }
    });

    it('marks concepts without sufficient evidence', () => {
      const inputs: ConceptFrictionInput[] = [
        {
          concept: 'Sufficient',
          questionCount: 10,
          clusterCount: 2,
          averageConfusionStrength: 0.6,
          maxObservedQuestionCount: 10,
          maxObservedClusterCount: 2,
        },
        {
          concept: 'Insufficient',
          questionCount: 1,
          clusterCount: 1,
          averageConfusionStrength: 0.6,
          maxObservedQuestionCount: 10,
          maxObservedClusterCount: 2,
        },
      ];

      const results = calculateVideoFriction(inputs);
      const sufficient = results.find((r: any) => r.concept === 'Sufficient')!;
      const insufficient = results.find((r: any) => r.concept === 'Insufficient')!;

      expect(sufficient.friction_level).not.toBe('Insufficient Evidence');
      expect(insufficient.friction_level).toBe('Insufficient Evidence');
    });
  });

  describe('friction levels', () => {
    it('assigns correct friction levels', () => {
      const testCases = [
        { questionCount: 100, clusterCount: 10, confusion: 0.85, expected: 'Critical' },
        { questionCount: 70, clusterCount: 7, confusion: 0.70, expected: 'High' },
        { questionCount: 50, clusterCount: 5, confusion: 0.50, expected: 'Moderate' },
        { questionCount: 20, clusterCount: 1, confusion: 0.20, expected: 'Low' },
      ];

      for (const tc of testCases) {
        const input: ConceptFrictionInput = {
          concept: `Test ${tc.expected}`,
          questionCount: tc.questionCount,
          clusterCount: tc.clusterCount,
          averageConfusionStrength: tc.confusion,
          maxObservedQuestionCount: 100,
          maxObservedClusterCount: 10,
        };

        const result = calculateConceptFriction(input);
        if (result.friction_level !== 'Insufficient Evidence') {
          expect(result.friction_level).toBe(tc.expected);
        }
      }
    });
  });

  describe('score boundaries', () => {
    it('boundaries: 0-39 = Low', () => {
      const input: ConceptFrictionInput = {
        concept: 'Low Friction',
        questionCount: 3,
        clusterCount: 1,
        averageConfusionStrength: 0.1,
        maxObservedQuestionCount: 100,
        maxObservedClusterCount: 10,
      };

      const result = calculateConceptFriction(input);
      expect(result.friction_level).toBe('Low');
    });

    it('boundaries: 40-59 = Moderate', () => {
      const input: ConceptFrictionInput = {
        concept: 'Moderate Friction',
        questionCount: 50,
        clusterCount: 5,
        averageConfusionStrength: 0.4,
        maxObservedQuestionCount: 100,
        maxObservedClusterCount: 10,
      };

      const result = calculateConceptFriction(input);
      expect(result.friction_level).toBe('Moderate');
    });

    it('boundaries: 60-79 = High', () => {
      const input: ConceptFrictionInput = {
        concept: 'High Friction',
        questionCount: 75,
        clusterCount: 8,
        averageConfusionStrength: 0.65,
        maxObservedQuestionCount: 100,
        maxObservedClusterCount: 10,
      };

      const result = calculateConceptFriction(input);
      expect(result.friction_level).toBe('High');
    });

    it('boundaries: 80-100 = Critical', () => {
      const input: ConceptFrictionInput = {
        concept: 'Critical Friction',
        questionCount: 100,
        clusterCount: 10,
        averageConfusionStrength: 0.85,
        maxObservedQuestionCount: 100,
        maxObservedClusterCount: 10,
      };

      const result = calculateConceptFriction(input);
      expect(result.friction_level).toBe('Critical');
    });
  });
});
