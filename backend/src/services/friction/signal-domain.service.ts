/**
 * Deterministic classification of existing Phase 4 signals for Phase 5.1.
 * This is intentionally conservative and never calls an AI provider.
 */
export type SignalDomain = 'learning' | 'technical' | 'content_navigation' | 'other';

export interface SignalDomainInput {
  intent: string;
  canonical_question: string | null;
  concept: string | null;
}

const NAVIGATION_PATTERNS = [
  /\b(playlist|series)\b.*\b(order|ordered|sequence|sequential|arranged|arrangement)\b/i,
  /\b(when|where)\b.*\b(course|playlist|series)\b.*\b(finish|complete|link|available)\b/i,
  /\b(course|playlist|series)\b.*\b(link|finish|complete|available|upload|roadmap)\b/i,
  /\b(where|link)\b.*\b(course|playlist|series|description)\b/i,
  /\b(upload|uploading|next video|next lecture)\b/i,
];

function isContentNavigationQuestion(input: SignalDomainInput): boolean {
  const text = `${input.canonical_question || ''} ${input.concept || ''}`.trim();
  return NAVIGATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function deriveSignalDomain(input: SignalDomainInput): SignalDomain {
  switch (input.intent) {
    case 'conceptual_confusion':
      return 'learning';
    case 'learning_question':
      return isContentNavigationQuestion(input) ? 'content_navigation' : 'learning';
    case 'technical_error':
      return 'technical';
    case 'content_request':
      return 'content_navigation';
    default:
      return 'other';
  }
}

export function isLearningDomainSignal(input: SignalDomainInput): boolean {
  return deriveSignalDomain(input) === 'learning';
}
