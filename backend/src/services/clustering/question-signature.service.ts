/**
 * A lightweight, domain-general description of what a learner is asking to do.
 *
 * These signatures deliberately describe learning tasks rather than subjects.
 * They are conservative: an unknown signature never blocks an otherwise
 * cohesive semantic cluster.
 */
export type QuestionRole =
  | 'constraint_modification'
  | 'variant_adaptation'
  | 'trace_execution'
  | 'output_reconstruction'
  | 'alternative_strategy_reasoning'
  | 'output_value_reasoning'
  | 'complexity_inquiry'
  | 'implementation'
  | 'causal_explanation'
  | 'concept_definition'
  | 'unknown';

export interface QuestionSignature {
  role: QuestionRole;
  certain: boolean;
  phase4Intent?: string;
}

function normalize(question: string): string {
  return question.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function has(text: string, expression: RegExp): boolean {
  return expression.test(text);
}

/**
 * Derive a role from a combination of question action and object/condition.
 * A single introductory word (for example "why" or "how") is never enough.
 */
export function deriveQuestionSignature(canonicalQuestion: string, phase4Intent?: string): QuestionSignature {
  const withIntent = (role: QuestionRole, certain: boolean): QuestionSignature => ({ role, certain, phase4Intent });
  const text = normalize(canonicalQuestion);
  const asksForOutput = has(text, /\b(reconstruct|recover|retrieve|return)\b/)
    && has(text, /\b(which|what|selected|chosen|items?|elements?|path|solution)\b/);
  if (asksForOutput) return withIntent('output_reconstruction', true);

  const asksForTrace = has(text, /\b(trace|dry run|walk through|step by step)\b/)
    || (has(text, /\b(execute|run)\b/) && has(text, /\b(input|example|case|values?)\b/));
  if (asksForTrace) return withIntent('trace_execution', true);

  if (has(text, /\b(time|space|runtime|memory|big o)\b/) && has(text, /\b(complexity|cost|efficient|performance)\b/)) {
    return withIntent('complexity_inquiry', true);
  }

  const modificationAction = has(text, /\b(generaliz\w*|modify|extend|change|adapt|solve|handle)\b/);
  const constraintFrame = has(text, /\b(constraint|restriction|condition|limit|bound|adjacent|consecutive|maximum|minimum)\b/)
    || (has(text, /\b(when|if)\b/) && has(text, /\b(at most|at least|more|fewer|several|multiple)\b/));
  if (modificationAction && constraintFrame) return withIntent('constraint_modification', true);

  const causalFrame = has(text, /\bwhy\b/) || has(text, /\b(doesn t|does not|can t|cannot|fails?|fail)\b/);
  if (causalFrame && has(text, /\b(return|returned|output|result|final answer|value)\b/)) {
    return withIntent('output_value_reasoning', true);
  }
  if (causalFrame && has(text, /\b(alternative|instead|just|simple|compare|alternat\w*|choose|select|greedy)\b/)) {
    return withIntent('alternative_strategy_reasoning', true);
  }

  if (modificationAction && has(text, /\b(variant|version|case|form|recursive|iterative)\b/)) {
    return withIntent('variant_adaptation', true);
  }
  if (has(text, /\b(implement|code|program|write)\b/) && has(text, /\b(solution|function|method|algorithm)\b/)) {
    return withIntent('implementation', true);
  }
  if (causalFrame && has(text, /\b(work|happen|relate|reason|derive|transform)\b/)) {
    return withIntent('causal_explanation', true);
  }
  if (has(text, /\b(what is|meaning of|define|definition)\b/)) {
    return withIntent('concept_definition', true);
  }

  return withIntent('unknown', false);
}

/** Unknown roles preserve candidates; known roles must agree exactly. */
export function areQuestionSignaturesCompatible(a: QuestionSignature, b: QuestionSignature): boolean {
  return !a.certain || !b.certain || a.role === b.role;
}
