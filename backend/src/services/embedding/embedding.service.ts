/**
 * Embedding Service
 *
 * Handles semantic embeddings for canonical learner questions.
 * Uses Google's Gemini embedding API with local caching in BigQuery.
 */

export function getConfiguredEmbeddingModel(): string {
  const model = process.env.GEMINI_EMBEDDING_MODEL?.trim();
  if (!model) {
    throw new Error('GEMINI_EMBEDDING_MODEL is not configured on the server.');
  }
  return model;
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
 * Generate real embeddings for a batch of texts using the configured Gemini model.
 * @throws if the provider cannot return one valid embedding for every input.
 */
export async function generateEmbeddings(texts: string[], model = getConfiguredEmbeddingModel()): Promise<EmbeddingResult[]> {
  if (!texts.length) return [];

  const apiKey = getRequiredApiKey();
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });

  const response = await client.models.embedContent({
    model,
    contents: texts.map((text) => ({ parts: [{ text }] })),
  });

  const embeddings = response.embeddings || [];
  if (embeddings.length !== texts.length) {
    throw new Error(`Embedding provider returned ${embeddings.length} embeddings for ${texts.length} questions.`);
  }

  return embeddings.map((result, index) => {
    const embedding = result.values ? Array.from(result.values) : [];
    if (!embedding.length || !embedding.every(Number.isFinite)) {
      throw new Error(`Embedding provider returned an invalid embedding for question ${index + 1}.`);
    }
    return { text: texts[index], embedding, model };
  });
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
