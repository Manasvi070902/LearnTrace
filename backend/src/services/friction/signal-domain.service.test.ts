import { deriveSignalDomain } from './signal-domain.service';

describe('signal domain classification', () => {
  it('keeps conceptual confusion and educational learning questions in learning_conceptual', () => {
    expect(deriveSignalDomain({ intent: 'conceptual_confusion', canonical_question: 'Why does memoization work here?', concept: 'Memoization' })).toBe('learning_conceptual');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'How was this recurrence derived?', concept: 'Recurrence' })).toBe('learning_conceptual');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Can you explain this concept again?', concept: 'Dynamic Programming' })).toBe('learning_conceptual');
  });

  it('separates technical errors and content requests', () => {
    expect(deriveSignalDomain({ intent: 'technical_error', canonical_question: "VS Code won't compile.", concept: 'VS Code' })).toBe('technical_barrier');
    expect(deriveSignalDomain({ intent: 'content_request', canonical_question: 'Please make a graph series.', concept: 'Graph videos' })).toBe('curriculum_navigation');
  });

  it('keeps clear curriculum and navigation questions out of learning friction', () => {
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Is DP on trees covered in this playlist?', concept: 'Dynamic Programming' })).toBe('curriculum_navigation');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Is this required for interviews?', concept: 'Dynamic Programming' })).toBe('curriculum_navigation');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'What should I learn after this?', concept: 'Learning path' })).toBe('curriculum_navigation');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Where is the next video?', concept: 'Course availability' })).toBe('curriculum_navigation');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Are advanced DP patterns covered in this playlist or required for interviews?', concept: 'Dynamic Programming' })).toBe('curriculum_navigation');
  });

  it('does not exclude a conceptual question merely because it mentions interviews', () => {
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Why is this optimization useful in interviews?', concept: 'Dynamic Programming' })).toBe('learning_conceptual');
  });

  it.each([
    ['mathematics', 'Why does differentiating this equation give that result?', 'Calculus'],
    ['physics', 'Why is acceleration negative here?', 'Kinematics'],
    ['programming', 'Why does memoization avoid repeated computation?', 'Memoization'],
    ['databases', 'Why does this index make the query faster?', 'Database indexes'],
  ])('recognizes conceptual learning in an unseen %s domain', (_subject, question, concept) => {
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: question, concept })).toBe('learning_conceptual');
  });

  it('recognizes generic navigation, scope, and technical barriers on unseen content', () => {
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Which lesson should I watch after this one?', concept: 'Lesson sequence' })).toBe('curriculum_navigation');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Does this course cover advanced topics?', concept: 'Course scope' })).toBe('curriculum_navigation');
    expect(deriveSignalDomain({ intent: 'technical_error', canonical_question: 'My Python environment cannot find this package.', concept: 'Python environment' })).toBe('technical_barrier');
  });

  it('treats praise and noise as other', () => {
    expect(deriveSignalDomain({ intent: 'praise', canonical_question: null, concept: null })).toBe('other');
    expect(deriveSignalDomain({ intent: 'noise', canonical_question: null, concept: null })).toBe('other');
  });
});
