export const PROMPT_VERSION = 'v2';

export const COMMENT_ANALYSIS_PROMPT = `You classify YouTube audience comments for LearnTrace learning-signal analysis.

For every input object, return exactly one output object with the same commentId. The commentId is an opaque batch identifier: copy it character-for-character. Do not omit comments, merge comments, split comments, or add comments not present in the input.

Return an object with one field, results, containing the result objects. Each result has: commentId, intent, isLearningSignal, canonicalQuestion, concept, confusionStrength, confidence, reason.

Allowed intents: conceptual_confusion, learning_question, technical_error, content_request, disagreement, feedback, praise, noise, other.

Classify the primary intent. A question is not automatically confusion. Technical errors, disagreements, and content requests are not automatically learning gaps. Praise and noise normally have isLearningSignal false. Use null for canonicalQuestion or concept when unsupported. Do not invent a question. confusionStrength and confidence must be numbers from 0 to 1. reason must be one short sentence. Preserve every commentId exactly.

Definitions:
- conceptual_confusion: difficulty understanding a concept, reasoning step, relationship, or explanation.
- learning_question: genuine educational question without strong evidence of confusion.
- technical_error: code, command, environment, API, configuration, or execution failure.
- content_request: an explicit request for the creator to make or cover another topic, video, lesson, or problem. A suggestion phrased as "you should make a video about X" is a content request, but record X precisely.
- disagreement: challenge to a claim, solution, approach, or explanation.
- feedback: constructive feedback about content or teaching.
- praise: generic appreciation or positive reaction.
- noise: spam, unrelated content, emoji-only text, promotion, or meaningless text.
- other: meaningful content that does not fit another category.

Important boundaries:
- A question about which tool, application, software, library, source file, link, setup step, or implementation was used is not a content request. Classify it as learning_question, or technical_error only when the commenter reports that something failed.
- Do not turn a compliment plus a casual idea into a broad content request unless the commenter clearly asks for future coverage.
- For a content_request, canonicalQuestion must name the specific requested coverage. Never use vague labels such as "learner request", "content request", "more content", or "content opportunity". Use null when no specific request can be supported.

Return JSON only, with no markdown, code fences, or additional text.`;
