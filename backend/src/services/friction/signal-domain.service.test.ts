import { deriveSignalDomain } from './signal-domain.service';

describe('signal domain classification', () => {
  it('keeps conceptual confusion and educational learning questions in learning', () => {
    expect(deriveSignalDomain({ intent: 'conceptual_confusion', canonical_question: 'Why does dynamic programming need a state?', concept: 'DP State' })).toBe('learning');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'How do I choose two pointers?', concept: 'Two Pointers' })).toBe('learning');
  });

  it('separates technical errors and content requests', () => {
    expect(deriveSignalDomain({ intent: 'technical_error', canonical_question: 'Why will VS Code not compile?', concept: 'VS Code' })).toBe('technical');
    expect(deriveSignalDomain({ intent: 'content_request', canonical_question: 'Please upload graph videos', concept: 'Graph videos' })).toBe('content_navigation');
  });

  it('keeps playlist and course-navigation questions out of learning friction', () => {
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Is the A2Z playlist arranged sequentially?', concept: 'A2Z playlist organization' })).toBe('content_navigation');
    expect(deriveSignalDomain({ intent: 'learning_question', canonical_question: 'Where is the course link?', concept: 'Course availability' })).toBe('content_navigation');
  });

  it('treats praise and noise as other', () => {
    expect(deriveSignalDomain({ intent: 'praise', canonical_question: null, concept: null })).toBe('other');
    expect(deriveSignalDomain({ intent: 'noise', canonical_question: null, concept: null })).toBe('other');
  });
});
