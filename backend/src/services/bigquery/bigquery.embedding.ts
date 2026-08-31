/**
 * BigQuery Embedding Queries
 *
 * Handles caching and retrieval of question embeddings.
 */

import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';
import { getConfiguredEmbeddingModel } from '../embedding/embedding.service';

export interface StoredEmbedding {
  comment_id: string;
  video_id: string;
  canonical_question: string;
  concept: string | null;
  embedding: number[];
  embedding_model: string;
  prompt_version: string;
  created_at: string;
}

/**
 * Check if an embedding already exists for a canonical question.
 * Cache key: comment_id + canonical_question + embedding_model + prompt_version
 */
export async function getStoredEmbedding(
  commentId: string,
  canonicalQuestion: string,
  embeddingModel: string,
  promptVersion: string
): Promise<StoredEmbedding | null> {
  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;

  const [rows] = await bq.query({
    query: `
      SELECT comment_id, video_id, canonical_question, concept, embedding, embedding_model, prompt_version, CAST(created_at AS STRING) AS created_at
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_EMBEDDINGS}\`
      WHERE comment_id = @comment_id
        AND canonical_question = @canonical_question
        AND embedding_model = @embedding_model
        AND prompt_version = @prompt_version
      LIMIT 1
    `,
    params: {
      comment_id: commentId,
      canonical_question: canonicalQuestion,
      embedding_model: embeddingModel,
      prompt_version: promptVersion,
    },
    location: process.env.BIGQUERY_LOCATION,
  });

  if (!rows || rows.length === 0) return null;

  const row = rows[0] as any;
  return {
    comment_id: row.comment_id,
    video_id: row.video_id,
    canonical_question: row.canonical_question,
    concept: row.concept || null,
    embedding: Array.isArray(row.embedding) ? row.embedding : [],
    embedding_model: row.embedding_model,
    prompt_version: row.prompt_version,
    created_at: row.created_at,
  };
}

export interface EmbeddingRow {
  comment_id: string;
  video_id: string;
  canonical_question: string;
  concept: string | null;
  embedding: number[];
  embedding_model: string;
  prompt_version: string;
  created_at: string;
}

/**
 * Store embeddings in BigQuery.
 * Uses MERGE to avoid duplicates based on cache identity.
 */
export async function storeEmbeddings(rows: EmbeddingRow[]): Promise<void> {
  if (!rows.length) return;

  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;
  const table = `\`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_EMBEDDINGS}\``;

  await bq.query({
    query: `
      MERGE ${table} AS target
      USING UNNEST(@rows) AS source
      ON target.comment_id = source.comment_id
        AND target.canonical_question = source.canonical_question
        AND target.embedding_model = source.embedding_model
        AND target.prompt_version = source.prompt_version
      WHEN MATCHED THEN
        UPDATE SET
          video_id = source.video_id,
          concept = source.concept,
          embedding = source.embedding,
          created_at = TIMESTAMP(source.created_at)
      WHEN NOT MATCHED THEN
        INSERT (comment_id, video_id, canonical_question, concept, embedding, embedding_model, prompt_version, created_at)
        VALUES (source.comment_id, source.video_id, source.canonical_question, source.concept, source.embedding, source.embedding_model, source.prompt_version, TIMESTAMP(source.created_at))
    `,
    params: { rows },
    location: process.env.BIGQUERY_LOCATION,
    types: {
      rows: [
        {
          comment_id: 'STRING',
          video_id: 'STRING',
          canonical_question: 'STRING',
          concept: 'STRING',
          embedding: ['FLOAT64'],  // Array of FLOAT64
          embedding_model: 'STRING',
          prompt_version: 'STRING',
          created_at: 'STRING',
        },
      ],
    },
  });
}

/**
 * Retrieve all embeddings for a video (with minimum confidence threshold).
 */
export async function getVideoEmbeddings(
  videoId: string,
  embeddingModel: string,
  promptVersion: string,
  minConfidence = 0.65
): Promise<StoredEmbedding[]> {
  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;

  const [rows] = await bq.query({
    query: `
      SELECT 
        e.comment_id,
        e.video_id,
        e.canonical_question,
        e.concept,
        e.embedding,
        e.embedding_model,
        e.prompt_version,
        CAST(e.created_at AS STRING) AS created_at
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_EMBEDDINGS}\` e
      INNER JOIN \`${projectId}.${datasetId}.${TABLE_NAMES.COMMENT_ANALYSIS}\` ca
        ON e.comment_id = ca.comment_id
      WHERE e.video_id = @video_id
        AND e.embedding_model = @embedding_model
        AND e.prompt_version = @prompt_version
        AND ca.is_learning_signal = true
        AND ca.confidence >= @min_confidence
      ORDER BY e.created_at, e.comment_id
    `,
    params: {
      video_id: videoId,
      embedding_model: embeddingModel,
      prompt_version: promptVersion,
      min_confidence: minConfidence,
    },
    location: process.env.BIGQUERY_LOCATION,
  });

  return (rows || []).map((row: any) => ({
    comment_id: row.comment_id,
    video_id: row.video_id,
    canonical_question: row.canonical_question,
    concept: row.concept || null,
    embedding: Array.isArray(row.embedding) ? row.embedding : [],
    embedding_model: row.embedding_model,
    prompt_version: row.prompt_version,
    created_at: row.created_at,
  }));
}
