/**
 * Deterministic classification of existing Phase 4 signals for Phase 5.2.
 * This is intentionally conservative and never calls an AI provider.
 */
export type SignalDomain = 'learning_conceptual' | 'technical_barrier' | 'curriculum_navigation' | 'other';

export interface SignalDomainInput {
  intent: string;
  canonical_question: string | null;
  concept: string | null;
}

const CURRICULUM_NAVIGATION_PATTERNS = [
  /\b(playlist|series)\b.*\b(order|ordered|sequence|sequential|arranged|arrangement)\b/i,
  /\b(when|where)\b.*\b(course|playlist|series)\b.*\b(finish|complete|link|available)\b/i,
  /\b(course|playlist|series)\b.*\b(link|finish|complete|available|upload|roadmap)\b/i,
  /\b(where|link)\b.*\b(course|playlist|series|description)\b/i,
  /\b(upload|uploading|next video|next lecture)\b/i,
  /\b(is|are|what|which|does)\b.*\b(cover|covers|covered|included|part of|available)\b.*\b(playlist|course|series|syllabus)\b/i,
  /\b(playlist|course|series|syllabus)\b.*\b(cover|covers|covered|included|topics?|scope)\b/i,
  /\b(is|are)\b.*\b(required|enough)\b.*\b(for )?(interviews?|placements?)\b/i,
  /\b(what|which)\b.*\b(should|do)\b.*\b(i )?(learn|study|watch)\b.*\b(after|next)\b/i,
  /\b(roadmap|learning path)\b.*\b(order|sequence|next|follow)\b/i,
];

function isCurriculumNavigationQuestion(input: SignalDomainInput): boolean {
  const text = `${input.canonical_question || ''} ${input.concept || ''}`.trim();
  return CURRICULUM_NAVIGATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function deriveSignalDomain(input: SignalDomainInput): SignalDomain {
  switch (input.intent) {
    case 'conceptual_confusion':
      return 'learning_conceptual';
    case 'learning_question':
      return isCurriculumNavigationQuestion(input) ? 'curriculum_navigation' : 'learning_conceptual';
    case 'technical_error':
      return 'technical_barrier';
    case 'content_request':
      return 'curriculum_navigation';
    default:
      return 'other';
  }
}

export function isLearningDomainSignal(input: SignalDomainInput): boolean {
  return deriveSignalDomain(input) === 'learning_conceptual';
}
