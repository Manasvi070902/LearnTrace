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
  /\bshould\s+(i|we)\s+(watch|study|learn|complete|finish)\b.*\b(first|before|prior to)\b/i,
  /\b(can|should)\s+(i|we)\s+(start|begin)\b.*\b(directly|without)\b/i,
  /\b(is|are)\b.*\b(required|necessary)\b.*\b(before|prior to)\b.*\b(course|series|topic|lesson|this)\b/i,
  /\b(is|are|does|do)\b.*\b(course|series|playlist|lesson|material|content)\b.*\b(enough|sufficient|cover|covers|covered|complete)\b/i,
  /\bis this enough preparation\b/i,
  /\bwhat\s+(should|do)\s+(i|we)\s+(learn|study|know|complete)\b.*\b(before|first|prior to)\b/i,
  /\bwhat\s+(are|do)\b.*\bprerequisites?\b/i,
  /\bdo\s+(i|we)\s+(need|have)\s+(to )?know\b.*\bbefore\b/i,
  /\bwhich topics?\b.*\b(know|learn|study)\b.*\b(first|before)\b/i,
  /\bwhat order should (i|we)\s+(learn|study|watch)\b/i,
  /\b(which|what)\s+(topic|lesson)\b.*\b(next|first)\b/i,
  /\bwhere\s+(should|do)\s+(i|we)\s+start\b/i,
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
