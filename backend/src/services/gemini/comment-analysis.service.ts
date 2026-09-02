import { COMMENT_ANALYSIS_PROMPT, PROMPT_VERSION } from '../../prompts/comment-analysis.prompt';

export const DEFAULT_GEMINI_MODEL = 'gemini-3.6-flash';
export const GEMINI_BATCH_SIZE = 50;
const MAX_BATCH_PAYLOAD_BYTES = 120_000;
export function getConfiguredGeminiModel(): string { return process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL; }
export const INTENTS = [
  'conceptual_confusion', 'learning_question', 'technical_error', 'content_request',
  'disagreement', 'feedback', 'praise', 'noise', 'other',
] as const;
export type Intent = typeof INTENTS[number];

export interface CommentForAnalysis { commentId: string; text: string; }
export interface CommentAnalysis {
  commentId: string;
  intent: Intent;
  isLearningSignal: boolean;
  canonicalQuestion: string | null;
  concept: string | null;
  confusionStrength: number;
  confidence: number;
  reason: string;
}

export class GeminiBatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiBatchValidationError';
  }
}

export const COMMENT_ANALYSIS_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results'],
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['commentId', 'intent', 'isLearningSignal', 'canonicalQuestion', 'concept', 'confusionStrength', 'confidence', 'reason'],
        properties: {
          commentId: { type: 'string' },
          intent: { type: 'string', enum: [...INTENTS] },
          isLearningSignal: { type: 'boolean' },
          canonicalQuestion: { type: ['string', 'null'] },
          concept: { type: ['string', 'null'] },
          confusionStrength: { type: 'number', minimum: 0, maximum: 1 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          reason: { type: 'string' },
        },
      },
    },
  },
} as const;

export function validateCommentAnalysis(value: unknown): CommentAnalysis {
  if (!value || typeof value !== 'object') throw new GeminiBatchValidationError('Gemini response item is not an object.');
  const item = value as Record<string, unknown>;
  if (typeof item.commentId !== 'string' || !item.commentId) throw new GeminiBatchValidationError('Missing commentId.');
  if (typeof item.intent !== 'string' || !(INTENTS as readonly string[]).includes(item.intent)) throw new GeminiBatchValidationError(`Invalid intent for ${item.commentId}.`);
  if (typeof item.isLearningSignal !== 'boolean') throw new GeminiBatchValidationError(`Invalid isLearningSignal for ${item.commentId}.`);
  if (item.canonicalQuestion !== null && typeof item.canonicalQuestion !== 'string') throw new GeminiBatchValidationError(`Invalid canonicalQuestion for ${item.commentId}.`);
  if (item.concept !== null && typeof item.concept !== 'string') throw new GeminiBatchValidationError(`Invalid concept for ${item.commentId}.`);
  for (const field of ['confusionStrength', 'confidence']) {
    if (typeof item[field] !== 'number' || !Number.isFinite(item[field]) || item[field] < 0 || item[field] > 1) {
      throw new GeminiBatchValidationError(`Invalid ${field} for ${item.commentId}.`);
    }
  }
  if (typeof item.reason !== 'string' || !item.reason) throw new GeminiBatchValidationError(`Missing reason for ${item.commentId}.`);
  return item as unknown as CommentAnalysis;
}

export function parseGeminiResponse(text: string): CommentAnalysis[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch { throw new GeminiBatchValidationError('Gemini returned malformed JSON.'); }
  // Accept the previous array envelope for a safe provider-format transition,
  // while structured output requests the object envelope below.
  const results = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { results?: unknown }).results)
      ? (parsed as { results: unknown[] }).results
      : null;
  if (!results) throw new GeminiBatchValidationError('Gemini response must contain a results array.');
  return results.map(validateCommentAnalysis);
}

export function mapBatchResults(input: CommentForAnalysis[], results: CommentAnalysis[]): CommentAnalysis[] {
  const expectedIds = input.map((comment) => comment.commentId);
  const expected = new Set(expectedIds);
  const responseIds = results.map((result) => result.commentId);
  const responseCounts = new Map<string, number>();
  for (const id of responseIds) responseCounts.set(id, (responseCounts.get(id) || 0) + 1);
  const missingIds = expectedIds.filter((id) => !responseCounts.has(id));
  const duplicateIds = [...responseCounts.entries()].filter(([, count]) => count > 1).map(([id]) => id);
  const unknownIds = responseIds.filter((id) => !expected.has(id));
  const duplicateInputIds = expectedIds.filter((id, index) => expectedIds.indexOf(id) !== index);
  if (results.length !== input.length || missingIds.length || duplicateIds.length || unknownIds.length || duplicateInputIds.length) {
    throw new GeminiBatchValidationError(`Gemini batch validation failed. Expected: ${input.length}. Received: ${results.length}. Missing IDs: [${missingIds.join(', ')}]. Duplicate IDs: [${duplicateIds.join(', ')}]. Unknown IDs: [${unknownIds.join(', ')}].${duplicateInputIds.length ? ` Duplicate input IDs: [${duplicateInputIds.join(', ')}].` : ''}`);
  }
  const byCommentId = new Map(results.map((result) => [result.commentId, result]));
  return input.map((comment) => byCommentId.get(comment.commentId)!);
}

/**
 * YouTube comment IDs are long opaque strings which a model can subtly alter
 * while reproducing them. Send a short deterministic batch token instead and
 * resolve it back to the original database identifier only after strict
 * one-to-one validation succeeds.
 */
export function createProviderBatch(comments: CommentForAnalysis[]): {
  providerComments: CommentForAnalysis[];
  mapToSourceComments: (results: CommentAnalysis[]) => CommentAnalysis[];
} {
  const providerComments = comments.map((comment, index) => ({
    commentId: `item_${String(index + 1).padStart(3, '0')}`,
    text: comment.text,
  }));
  const sourceCommentIdByProviderId = new Map(providerComments.map((providerComment, index) => [providerComment.commentId, comments[index].commentId]));

  return {
    providerComments,
    mapToSourceComments: (results) => mapBatchResults(providerComments, results).map((result) => ({
      ...result,
      commentId: sourceCommentIdByProviderId.get(result.commentId)!,
    })),
  };
}

export function splitIntoBatches<T>(items: T[], batchSize = GEMINI_BATCH_SIZE): T[][] {
  const safeBatchSize = Math.max(1, Math.floor(batchSize));
  const batches: T[][] = [];
  for (let start = 0; start < items.length; start += safeBatchSize) batches.push(items.slice(start, start + safeBatchSize));
  return batches;
}

export function splitCommentBatches(comments: CommentForAnalysis[], batchSize = GEMINI_BATCH_SIZE): CommentForAnalysis[][] {
  const batches: CommentForAnalysis[][] = [];
  for (const comment of comments) {
    let batch = batches[batches.length - 1];
    const candidate = batch ? [...batch, comment] : [comment];
    if (batch && (candidate.length > batchSize || Buffer.byteLength(JSON.stringify(candidate), 'utf8') > MAX_BATCH_PAYLOAD_BYTES)) {
      batch = [comment];
      batches.push(batch);
    } else if (!batch) {
      batches.push(candidate);
    } else {
      batch.push(comment);
    }
  }
  return batches;
}

export function estimateGeminiRequests(commentCount: number, batchSize = GEMINI_BATCH_SIZE): number {
  return Math.ceil(Math.max(0, commentCount) / Math.max(1, Math.floor(batchSize)));
}

function getRequiredApiKey(): string {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured on the server.');
  return process.env.GEMINI_API_KEY;
}

function isQuotaOrBillingError(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  const message = candidate?.message || String(error);
  return /RESOURCE_EXHAUSTED|prepayment credits|quota exhaustion|billing credits|daily limit/i.test(message);
}

function isTransientRateLimit(error: unknown): boolean {
  const candidate = error as { status?: number; message?: string };
  const message = candidate?.message || String(error);
  return candidate?.status === 429 && /retry|temporar|try again/i.test(message) && !isQuotaOrBillingError(error);
}

function retryDelayMs(error: unknown): number {
  const match = String((error as { message?: string })?.message || error).match(/retry(?: after| in)?\s+(\d+(?:\.\d+)?)\s*s/i);
  return Math.min(10_000, match ? Math.max(250, Number(match[1]) * 1000) : 1000);
}

export interface GeminiBatchDiagnostics { videoId?: string; }
export type GeminiBatchRequester = (contents: string) => Promise<string>;

function logBatchValidation(videoId: string | undefined, batchSize: number, error: GeminiBatchValidationError): void {
  console.warn(`[Learning Signals] Gemini batch validation failed video_id='${videoId || 'unknown'}' batch_size=${batchSize}. ${error.message}`);
}

export async function analyzeBatch(
  comments: CommentForAnalysis[],
  beforeRequest?: () => Promise<void>,
  diagnostics?: GeminiBatchDiagnostics,
  requester?: GeminiBatchRequester,
): Promise<CommentAnalysis[]> {
  const providerBatch = createProviderBatch(comments);
  const contents = `${COMMENT_ANALYSIS_PROMPT}\n\nComments:\n${JSON.stringify(providerBatch.providerComments)}`;
  let transientRateLimitRetried = false;
  let validationRetried = false;
  for (;;) {
    try {
      if (beforeRequest) await beforeRequest();
      let responseText: string;
      if (requester) {
        responseText = await requester(contents);
      } else {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ apiKey: getRequiredApiKey() });
        const response = await ai.models.generateContent({
          model: getConfiguredGeminiModel(),
          contents,
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: COMMENT_ANALYSIS_RESPONSE_SCHEMA,
            temperature: 0,
          },
        });
        responseText = response.text || '';
      }
      const mappedResults = providerBatch.mapToSourceComments(parseGeminiResponse(responseText));
      console.info(`[Learning Signals] Gemini batch validated video_id='${diagnostics?.videoId || 'unknown'}' batch_size=${comments.length} expected=${comments.length} received=${mappedResults.length} missing=0 duplicates=0`);
      return mappedResults;
    } catch (error) {
      if (error instanceof GeminiBatchValidationError) {
        logBatchValidation(diagnostics?.videoId, comments.length, error);
        if (!validationRetried) {
          validationRetried = true;
          console.warn(`[Learning Signals] Retrying the same Gemini batch once after validation failure video_id='${diagnostics?.videoId || 'unknown'}' batch_size=${comments.length}.`);
          continue;
        }
        throw new GeminiBatchValidationError(`Gemini batch validation failed after one retry. ${error.message}`);
      }
      if (isQuotaOrBillingError(error)) {
        throw new Error('Gemini analysis is unavailable because the configured project has exhausted its API quota or billing credits.');
      }
      const status = (error as { status?: number }).status;
      if (status === 404) throw new Error('Configured Gemini model/API is unavailable.');
      if (status === 429 && !isTransientRateLimit(error)) throw new Error('Gemini analysis was rate limited. Please try again later.');
      if (!isTransientRateLimit(error) || transientRateLimitRetried) throw error;
      transientRateLimitRetried = true;
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs(error)));
    }
  }
}

export async function analyzeComments(
  comments: CommentForAnalysis[],
  beforeRequest?: () => Promise<void>,
  onBatchComplete?: (results: CommentAnalysis[]) => Promise<void>,
  diagnostics?: GeminiBatchDiagnostics,
  requester?: GeminiBatchRequester,
): Promise<CommentAnalysis[]> {
  const batchSize = Math.max(1, Number(process.env.GEMINI_BATCH_SIZE || GEMINI_BATCH_SIZE));
  const results: CommentAnalysis[] = [];
  for (const batch of splitCommentBatches(comments, batchSize)) {
    const batchResults = await analyzeBatch(batch, beforeRequest, diagnostics, requester);
    if (onBatchComplete) await onBatchComplete(batchResults);
    results.push(...batchResults);
  }
  return results;
}

export { PROMPT_VERSION };
