/**
 * Conservative lexical normalization only. It deliberately avoids topic
 * families and semantic aliases, so related learning difficulties stay apart.
 */
export function normalizeConcept(concept: string | null): string {
  if (!concept) return 'uncategorized';

  const cleaned = concept
    .trim()
    .replace(/[\s\u00a0]+/g, ' ')
    .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
    .toLocaleLowerCase();
  if (!cleaned) return 'uncategorized';

  const words = cleaned.split(' ');
  const last = words[words.length - 1];
  // Singularize only a simple trailing-s plural. Irregular or ambiguous forms
  // (for example, "series", "analysis", and "class") remain unchanged.
  if (last.length > 3 && /s$/.test(last) && !/(ss|is|us|ies)$/.test(last)) {
    words[words.length - 1] = last.slice(0, -1);
  }

  return words.join(' ');
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
