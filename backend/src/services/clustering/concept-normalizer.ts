/**
 * Concept Normalizer
 *
 * Deterministic concept deduplication and normalization.
 * Avoids over-aggressive merging that conflates different concepts.
 */

export const CONCEPT_NORMALIZATION_RULES: Array<{
  patterns: RegExp[];
  canonical: string;
}> = [
  {
    patterns: [
      /^dynamic\s+programming\s+state$/i,
      /^dp\s+state$/i,
      /^dp\s+state\s+formation$/i,
    ],
    canonical: 'DP State',
  },
  {
    patterns: [
      /^recurrence\s+relation$/i,
      /^recurrence\s+derivation$/i,
      /^recurrence$/i,
    ],
    canonical: 'Recurrence Relation',
  },
  {
    patterns: [
      /^memoization$/i,
      /^memoization\s+technique$/i,
    ],
    canonical: 'Memoization',
  },
  {
    patterns: [
      /^time\s+complexity$/i,
      /^complexity\s+analysis$/i,
      /^time\s+complexity\s+calculation$/i,
    ],
    canonical: 'Time Complexity',
  },
  {
    patterns: [
      /^two\s+pointer(?:s)?$/i,
      /^two\s+pointer\s+technique$/i,
      /^two\s+pointer\s+pattern$/i,
    ],
    canonical: 'Two Pointer Technique',
  },
  {
    patterns: [
      /^sliding\s+window$/i,
      /^sliding\s+window\s+technique$/i,
    ],
    canonical: 'Sliding Window',
  },
  {
    patterns: [
      /^binary\s+search$/i,
      /^binary\s+search\s+pattern$/i,
    ],
    canonical: 'Binary Search',
  },
  {
    patterns: [
      /^graph\s+traversal$/i,
      /^dfs|bfs$/i,
      /^depth\s+first\s+search|breadth\s+first\s+search$/i,
    ],
    canonical: 'Graph Traversal',
  },
];

/**
 * Normalize a concept string to a canonical form.
 * If no rule matches, return the original (trimmed).
 */
export function normalizeConcept(concept: string | null): string {
  if (!concept) return 'uncategorized';

  const trimmed = concept.trim();
  if (!trimmed) return 'uncategorized';

  for (const rule of CONCEPT_NORMALIZATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(trimmed)) {
        return rule.canonical;
      }
    }
  }

  // No rule matched: return original (trimmed)
  return trimmed;
}

/**
 * Batch normalize concepts.
 */
export function normalizeConcepts(concepts: (string | null)[]): string[] {
  return concepts.map(normalizeConcept);
}

/**
 * Create a mapping from original → normalized for audit purposes.
 */
export function createConceptMapping(originalConcepts: (string | null)[]): Map<string, string> {
  const mapping = new Map<string, string>();

  for (const original of originalConcepts) {
    const normalized = normalizeConcept(original);
    if (original) {
      mapping.set(original, normalized);
    }
  }

  return mapping;
}
