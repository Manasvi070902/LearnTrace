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

export function validateCommentAnalysis(value: unknown): CommentAnalysis {
  if (!value || typeof value !== 'object') throw new Error('Gemini response item is not an object.');
  const item = value as Record<string, unknown>;
  if (typeof item.commentId !== 'string' || !item.commentId) throw new Error('Missing commentId.');
  if (typeof item.intent !== 'string' || !(INTENTS as readonly string[]).includes(item.intent)) throw new Error(`Invalid intent for ${item.commentId}.`);
  if (typeof item.isLearningSignal !== 'boolean') throw new Error(`Invalid isLearningSignal for ${item.commentId}.`);
  if (item.canonicalQuestion !== null && typeof item.canonicalQuestion !== 'string') throw new Error(`Invalid canonicalQuestion for ${item.commentId}.`);
  if (item.concept !== null && typeof item.concept !== 'string') throw new Error(`Invalid concept for ${item.commentId}.`);
  for (const field of ['confusionStrength', 'confidence']) {
    if (typeof item[field] !== 'number' || !Number.isFinite(item[field]) || item[field] < 0 || item[field] > 1) {
      throw new Error(`Invalid ${field} for ${item.commentId}.`);
    }
  }
  if (typeof item.reason !== 'string' || !item.reason) throw new Error(`Missing reason for ${item.commentId}.`);
  return item as unknown as CommentAnalysis;
}

export function parseGeminiResponse(text: string): CommentAnalysis[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); } catch { throw new Error('Gemini returned malformed JSON.'); }
  if (!Array.isArray(parsed)) throw new Error('Gemini response must be an array.');
  return parsed.map(validateCommentAnalysis);
}

export function mapBatchResults(input: CommentForAnalysis[], results: CommentAnalysis[]): CommentAnalysis[] {
  const expected = new Set(input.map((comment) => comment.commentId));
  if (results.length !== input.length || results.some((result) => !expected.has(result.commentId)) || new Set(results.map((result) => result.commentId)).size !== results.length) {
    throw new Error('Gemini response did not contain exactly one result for every comment.');
  }
  return input.map((comment) => results.find((result) => result.commentId === comment.commentId)!);
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

async function analyzeBatch(comments: CommentForAnalysis[], beforeRequest?: () => Promise<void>): Promise<CommentAnalysis[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: getRequiredApiKey() });
  const contents = `${COMMENT_ANALYSIS_PROMPT}\n\nComments:\n${JSON.stringify(comments)}`;
  let transientRateLimitRetried = false;
  for (;;) {
    try {
      if (beforeRequest) await beforeRequest();
      const response = await ai.models.generateContent({
        model: getConfiguredGeminiModel(),
        contents,
        config: { responseMimeType: 'application/json', temperature: 0 },
      });
      return parseGeminiResponse(response.text || '');
    } catch (error) {
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

export async function analyzeComments(comments: CommentForAnalysis[], beforeRequest?: () => Promise<void>, onBatchComplete?: (results: CommentAnalysis[]) => Promise<void>): Promise<CommentAnalysis[]> {
  const batchSize = Math.max(1, Number(process.env.GEMINI_BATCH_SIZE || GEMINI_BATCH_SIZE));
  const results: CommentAnalysis[] = [];
  for (const batch of splitCommentBatches(comments, batchSize)) {
    const batchResults = await analyzeBatch(batch, beforeRequest);
    const mappedResults = mapBatchResults(batch, batchResults);
    if (onBatchComplete) await onBatchComplete(mappedResults);
    results.push(...mappedResults);
  }
  return results;
}

export { PROMPT_VERSION };
