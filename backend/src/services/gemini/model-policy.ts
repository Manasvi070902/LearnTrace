/** Central model policy: bulk understanding uses 2.5, creator-facing reasoning uses 3.6. */
export const DEFAULT_CLASSIFICATION_MODEL = 'gemini-2.5-flash';
export const DEFAULT_REASONING_MODEL = 'gemini-3.6-flash';
export const DEFAULT_AVAILABILITY_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

export function getClassificationModel(): string { return process.env.GEMINI_CLASSIFICATION_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || DEFAULT_CLASSIFICATION_MODEL; }
export function getReasoningModel(): string { return process.env.GEMINI_DIAGNOSIS_MODEL?.trim() || DEFAULT_REASONING_MODEL; }
export function getResponseModel(): string { return process.env.GEMINI_RESPONSE_MODEL?.trim() || getReasoningModel(); }
export function getAvailabilityFallbackModel(): string { return process.env.GEMINI_AVAILABILITY_FALLBACK_MODEL?.trim() || DEFAULT_AVAILABILITY_FALLBACK_MODEL; }

function isEligibleFallback(error: unknown): boolean {
  const value = error as { status?: number; code?: number; message?: string };
  const status = value?.status || value?.code;
  const message = String(value?.message || error).toLowerCase();
  if (/malformed|validation|invalid|bad request|\b400\b|\b404\b|prompt/.test(message)) return false;
  if (/quota|billing|credit|daily limit|api key|permission|authentication/.test(message)) return false;
  return status === 503 || /\b503\b|high demand|temporarily unavailable|service unavailable/.test(message)
    || (status === 429 && /retry|temporary|rate limit|resource.?exhausted|too many requests/.test(message));
}

/** One fallback attempt only, and only for provider availability—not malformed output or quota exhaustion. */
export async function withReasoningFallback<T>(request: (model: string) => Promise<T>, primary = getResponseModel()): Promise<{ value: T; model: string }> {
  try { return { value: await request(primary), model: primary }; }
  catch (error) {
    const fallback = getAvailabilityFallbackModel();
    if (!isEligibleFallback(error) || fallback === primary) throw error;
    console.warn(`[Gemini] '${primary}' temporarily unavailable; using one '${fallback}' fallback attempt.`);
    return { value: await request(fallback), model: fallback };
  }
}
