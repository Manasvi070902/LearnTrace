export type GeminiProvider = 'gemini-api' | 'vertex-ai';

function isVertexEnabled(): boolean {
  return process.env.GEMINI_PROVIDER?.trim().toLowerCase() === 'vertex-ai'
    || process.env.GOOGLE_GENAI_USE_VERTEXAI?.trim().toLowerCase() === 'true';
}

export function getGeminiProvider(): GeminiProvider {
  return isVertexEnabled() ? 'vertex-ai' : 'gemini-api';
}

/**
 * Creates the single supported Gemini client configuration for LearnTrace.
 *
 * Vertex AI authenticates through Application Default Credentials (ADC), which
 * means a local `gcloud auth application-default login` or a deployed service
 * account. The Gemini Developer API continues to use GEMINI_API_KEY until the
 * Vertex switch is deliberately enabled.
 */
export async function getGeminiClient() {
  const { GoogleGenAI } = await import('@google/genai');
  if (isVertexEnabled()) {
    const project = process.env.GOOGLE_CLOUD_PROJECT?.trim() || process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
    if (!project) {
      throw new Error('Vertex AI is enabled but GOOGLE_CLOUD_PROJECT is not configured on the server.');
    }
    return new GoogleGenAI({
      vertexai: true,
      project,
      location: process.env.GOOGLE_CLOUD_LOCATION?.trim() || 'global',
    });
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server. Set GEMINI_PROVIDER=vertex-ai to use Vertex AI instead.');
  }
  return new GoogleGenAI({ apiKey });
}
