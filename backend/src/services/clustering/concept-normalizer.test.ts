import { createConceptMapping, normalizeConcept, normalizeConcepts } from './concept-normalizer';

describe('Concept Normalizer', () => {
  it('normalizes only trivial lexical duplicates', () => {
    expect(normalizeConcept('limit')).toBe(normalizeConcept('limits'));
    expect(normalizeConcept('Derivative')).toBe(normalizeConcept('derivative'));
    expect(normalizeConcept(' tangent line ')).toBe(normalizeConcept('tangent line'));
    expect(normalizeConcept(' tangent   line! ')).toBe('tangent line');
  });

  it('does not merge related but different concepts', () => {
    expect(normalizeConcept('tangent line')).not.toBe(normalizeConcept('tangent and secant lines'));
    expect(normalizeConcept('limit')).not.toBe(normalizeConcept('derivative'));
    expect(normalizeConcept('slope at a point')).not.toBe(normalizeConcept('derivative'));
  });

  it('handles null and empty values', () => {
    expect(normalizeConcept(null)).toBe('uncategorized');
    expect(normalizeConcept('   ')).toBe('uncategorized');
  });

  it('normalizes batches and preserves distinct concepts', () => {
    expect(normalizeConcepts(['limits', 'Derivative', 'tangent and secant lines'])).toEqual([
      'limit', 'derivative', 'tangent and secant line',
    ]);
  });

  it('creates an auditable mapping without semantic merging', () => {
    const mapping = createConceptMapping(['limits', 'Derivative', 'tangent line']);
    expect(mapping.get('limits')).toBe('limit');
    expect(mapping.get('Derivative')).toBe('derivative');
    expect(mapping.get('tangent line')).toBe('tangent line');
  });
});
