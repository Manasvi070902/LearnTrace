/**
 * Embedding Service
 *
 * Handles semantic embeddings for canonical learner questions.
 * Uses Google's Gemini embedding API with local caching in BigQuery.
 */

export const DEFAULT_EMBEDDING_MODEL = 'embedding-001';

export function getConfiguredEmbeddingModel(): string {
  return process.env.GEMINI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL;
}

function getRequiredApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not configured on the server.');
  return key;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
}

/**
 * Simple hash-based vector for testing (when API not available)
 */
function generateMockEmbedding(text: string, dimension = 768): number[] {
  const hash = text.split('').reduce((h, c) => {
    const code = c.charCodeAt(0);
    return ((h << 5) - h) + code;
  }, 0);
  
  const rng = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };
  
  const embedding: number[] = [];
  for (let i = 0; i < dimension; i++) {
    embedding.push(rng(hash + i));
  }
  
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / (norm || 1));
}

/**
 * Generate embeddings for a batch of texts using Gemini.
 * Falls back to mock embeddings if API is unavailable.
 * @throws if API key is missing
 */
export async function generateEmbeddings(texts: string[], model = getConfiguredEmbeddingModel()): Promise<EmbeddingResult[]> {
  if (!texts.length) return [];

  const apiKey = getRequiredApiKey();
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });

  const results: EmbeddingResult[] = [];

  for (const text of texts) {
    try {
      // Try with "models/" prefix
      const modelName = model.startsWith('models/') ? model : `models/${model}`;
      
      const response = await client.models.embedContent({
        model: modelName,
        contents: {
          parts: [{ text }],
        },
      });

      if (!response.embeddings?.[0]?.values) {
        throw new Error(`No embedding returned for text`);
      }

      results.push({
        text,
        embedding: Array.from(response.embeddings[0].values),
        model,
      });
    } catch (apiError) {
      // Fallback to mock embedding for testing
      console.log(
        `[Embedding] API unavailable for '${text.substring(0, 40)}...', using mock embedding for testing`
      );
      results.push({
        text,
        embedding: generateMockEmbedding(text),
        model: `${model}-mock`,
      });
    }
  }

  return results;
}

/**
 * Compute cosine similarity between two embedding vectors.
 * Both vectors must be the same length.
 * Returns a value between -1 and 1; typically 0 to 1 for text embeddings.
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error(`Vector length mismatch: ${vecA.length} vs ${vecB.length}`);
  }

  if (vecA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}
