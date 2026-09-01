import { areQuestionSignaturesCompatible, deriveQuestionSignature } from './question-signature.service';

describe('question-task signatures', () => {
  it('recognizes a generic constraint-modification task from action plus condition structure', () => {
    expect(deriveQuestionSignature('How do I modify this method when the constraint extends to more adjacent items?'))
      .toMatchObject({ role: 'constraint_modification', certain: true });
  });

  it('keeps trace and output-reconstruction tasks distinct', () => {
    const trace = deriveQuestionSignature('How does this method execute on an example input?');
    const reconstruction = deriveQuestionSignature('How can I reconstruct which items were selected?');
    expect(trace.role).toBe('trace_execution');
    expect(reconstruction.role).toBe('output_reconstruction');
    expect(areQuestionSignaturesCompatible(trace, reconstruction)).toBe(false);
  });

  it('recognizes alternative-strategy reasoning without tying it to a subject', () => {
    const first = deriveQuestionSignature('Why does the simple alternating strategy fail?');
    const second = deriveQuestionSignature('Why can’t I compare the odd and even positions instead?');
    expect(first.role).toBe('alternative_strategy_reasoning');
    expect(second.role).toBe('alternative_strategy_reasoning');
    expect(areQuestionSignaturesCompatible(first, second)).toBe(true);
  });

  it('does not make an uncertain signature a hard exclusion', () => {
    expect(areQuestionSignaturesCompatible(
      deriveQuestionSignature('Can you clarify this?'),
      deriveQuestionSignature('How can I reconstruct which items were selected?'),
    )).toBe(true);
  });
});
