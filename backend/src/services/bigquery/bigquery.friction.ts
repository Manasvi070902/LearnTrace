/**
 * BigQuery Friction Queries
 *
 * Handles persistence and retrieval of learning friction scores and cluster results.
 */

import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';

export interface FrictionRow {
  video_id: string;
  normalized_concept: string;
  learning_friction_score: number | null;
  friction_level: string;
  question_count: number;
  cluster_count: number;
  volume_score: number | null;
  confusion_score: number | null;
  recurrence_score: number | null;
  average_confusion_strength: number;
  evidence_count: number;
  calculated_at: string;
  scoring_version: string;
}

export interface ClusterRow {
  cluster_id: string;
  video_id: string;
  cluster_label: string;
  primary_concept: string;
  question_count: number;
  average_confusion_strength: number;
  average_confidence: number;
  representative_comment_ids: string[];
  created_at: string;
  clustering_version: string;
}

export interface ClusterMemberRow {
  cluster_id: string;
  comment_id: string;
  video_id: string;
  similarity_score: number;
  created_at: string;
}

export interface ClusterEvidenceRow extends ClusterMemberRow {
  comment_text: string;
  is_reply: boolean;
  published_at: string;
}

/**
 * Store cluster results in BigQuery.
 * Replaces existing clusters for the same video and clustering version.
 */
export async function storeClusters(rows: ClusterRow[]): Promise<void> {
  if (!rows.length) return;

  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;
  const table = `\`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_CLUSTERS}\``;
  const membersTable = `\`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_CLUSTER_MEMBERS}\``;
  const videoId = rows[0].video_id;
  const clusteringVersion = rows[0].clustering_version;

  // Each run replaces this video's derived view; source comments and analyses
  // are never changed.
  await bq.query({
    query: `DELETE FROM ${membersTable} WHERE video_id = @video_id`,
    params: { video_id: videoId },
    location: process.env.BIGQUERY_LOCATION,
  });
  await bq.query({
    query: `DELETE FROM ${table} WHERE video_id = @video_id AND clustering_version = @clustering_version`,
    params: { video_id: videoId, clustering_version: clusteringVersion },
    location: process.env.BIGQUERY_LOCATION,
  });

  await bq.query({
    query: `
      MERGE ${table} AS target
      USING UNNEST(@rows) AS source
      ON target.cluster_id = source.cluster_id
      WHEN MATCHED THEN
        UPDATE SET
          video_id = source.video_id,
          cluster_label = source.cluster_label,
          primary_concept = source.primary_concept,
          question_count = source.question_count,
          average_confusion_strength = source.average_confusion_strength,
          average_confidence = source.average_confidence,
          representative_comment_ids = source.representative_comment_ids,
          created_at = TIMESTAMP(source.created_at),
          clustering_version = source.clustering_version
      WHEN NOT MATCHED THEN
        INSERT (cluster_id, video_id, cluster_label, primary_concept, question_count, average_confusion_strength, average_confidence, representative_comment_ids, created_at, clustering_version)
        VALUES (source.cluster_id, source.video_id, source.cluster_label, source.primary_concept, source.question_count, source.average_confusion_strength, source.average_confidence, source.representative_comment_ids, TIMESTAMP(source.created_at), source.clustering_version)
    `,
    params: { rows },
    location: process.env.BIGQUERY_LOCATION,
    types: {
      rows: [
        {
          cluster_id: 'STRING',
          video_id: 'STRING',
          cluster_label: 'STRING',
          primary_concept: 'STRING',
          question_count: 'INT64',
          average_confusion_strength: 'FLOAT64',
          average_confidence: 'FLOAT64',
          representative_comment_ids: ['STRING'],
          created_at: 'STRING',
          clustering_version: 'STRING',
        },
      ],
    },
  });
}

/**
 * Store cluster membership in BigQuery.
 */
export async function storeClusterMembers(rows: ClusterMemberRow[]): Promise<void> {
  if (!rows.length) return;

  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;
  const table = `\`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_CLUSTER_MEMBERS}\``;

  await bq.query({
    query: `
      DELETE FROM ${table}
      WHERE cluster_id IN (
        SELECT DISTINCT cluster_id FROM UNNEST(@rows) AS source
      );
      
      INSERT INTO ${table} (cluster_id, comment_id, video_id, similarity_score, created_at)
      SELECT source.cluster_id, source.comment_id, source.video_id, source.similarity_score, TIMESTAMP(source.created_at)
      FROM UNNEST(@rows) AS source
    `,
    params: { rows },
    location: process.env.BIGQUERY_LOCATION,
    types: {
      rows: [
        {
          cluster_id: 'STRING',
          comment_id: 'STRING',
          video_id: 'STRING',
          similarity_score: 'FLOAT64',
          created_at: 'STRING',
        },
      ],
    },
  });
}

/**
 * Store friction scores in BigQuery.
 */
export async function storeFrictionScores(rows: FrictionRow[]): Promise<void> {
  if (!rows.length) return;

  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;
  const table = `\`${projectId}.${datasetId}.${TABLE_NAMES.LEARNING_FRICTION}\``;

  await bq.query({
    query: `
      MERGE ${table} AS target
      USING UNNEST(@rows) AS source
      ON target.video_id = source.video_id
        AND target.normalized_concept = source.normalized_concept
      WHEN MATCHED THEN
        UPDATE SET
          learning_friction_score = source.learning_friction_score,
          friction_level = source.friction_level,
          question_count = source.question_count,
          cluster_count = source.cluster_count,
          volume_score = source.volume_score,
          confusion_score = source.confusion_score,
          recurrence_score = source.recurrence_score,
          average_confusion_strength = source.average_confusion_strength,
          evidence_count = source.evidence_count,
          calculated_at = TIMESTAMP(source.calculated_at),
          scoring_version = source.scoring_version
      WHEN NOT MATCHED THEN
        INSERT (video_id, normalized_concept, learning_friction_score, friction_level, question_count, cluster_count, volume_score, confusion_score, recurrence_score, average_confusion_strength, evidence_count, calculated_at, scoring_version)
        VALUES (source.video_id, source.normalized_concept, source.learning_friction_score, source.friction_level, source.question_count, source.cluster_count, source.volume_score, source.confusion_score, source.recurrence_score, source.average_confusion_strength, source.evidence_count, TIMESTAMP(source.calculated_at), source.scoring_version)
    `,
    params: { rows },
    location: process.env.BIGQUERY_LOCATION,
    types: {
      rows: [
        {
          video_id: 'STRING',
          normalized_concept: 'STRING',
          learning_friction_score: 'FLOAT64',
          friction_level: 'STRING',
          question_count: 'INT64',
          cluster_count: 'INT64',
          volume_score: 'FLOAT64',
          confusion_score: 'FLOAT64',
          recurrence_score: 'FLOAT64',
          average_confusion_strength: 'FLOAT64',
          evidence_count: 'INT64',
          calculated_at: 'STRING',
          scoring_version: 'STRING',
        },
      ],
    },
  });
}

/**
 * Retrieve friction scores for a video.
 */
export async function getVideoFrictionScores(videoId: string, scoringVersion: string): Promise<FrictionRow[]> {
  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;

  const [rows] = await bq.query({
    query: `
      SELECT
        video_id,
        normalized_concept,
        learning_friction_score,
        friction_level,
        question_count,
        cluster_count,
        volume_score,
        confusion_score,
        recurrence_score,
        average_confusion_strength,
        evidence_count,
        CAST(calculated_at AS STRING) AS calculated_at,
        scoring_version
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.LEARNING_FRICTION}\`
      WHERE video_id = @video_id AND scoring_version = @scoring_version
      ORDER BY learning_friction_score DESC NULLS LAST, normalized_concept
    `,
    params: {
      video_id: videoId,
      scoring_version: scoringVersion,
    },
    location: process.env.BIGQUERY_LOCATION,
  });

  return (rows || []).map((row: any) => ({
    video_id: row.video_id,
    normalized_concept: row.normalized_concept,
    learning_friction_score: row.learning_friction_score,
    friction_level: row.friction_level,
    question_count: Number(row.question_count),
    cluster_count: Number(row.cluster_count),
    volume_score: row.volume_score,
    confusion_score: row.confusion_score,
    recurrence_score: row.recurrence_score,
    average_confusion_strength: row.average_confusion_strength,
    evidence_count: Number(row.evidence_count),
    calculated_at: row.calculated_at,
    scoring_version: row.scoring_version,
  }));
}

/**
 * Retrieve clusters for a video.
 */
export async function getVideoClusters(videoId: string, clusteringVersion: string): Promise<ClusterRow[]> {
  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;

  const [rows] = await bq.query({
    query: `
      SELECT
        cluster_id,
        video_id,
        cluster_label,
        primary_concept,
        question_count,
        average_confusion_strength,
        average_confidence,
        representative_comment_ids,
        CAST(created_at AS STRING) AS created_at,
        clustering_version
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_CLUSTERS}\`
      WHERE video_id = @video_id AND clustering_version = @clustering_version
      ORDER BY question_count DESC
    `,
    params: {
      video_id: videoId,
      clustering_version: clusteringVersion,
    },
    location: process.env.BIGQUERY_LOCATION,
  });

  return (rows || []).map((row: any) => ({
    cluster_id: row.cluster_id,
    video_id: row.video_id,
    cluster_label: row.cluster_label,
    primary_concept: row.primary_concept,
    question_count: Number(row.question_count),
    average_confusion_strength: row.average_confusion_strength,
    average_confidence: row.average_confidence,
    representative_comment_ids: Array.isArray(row.representative_comment_ids)
      ? row.representative_comment_ids
      : [],
    created_at: row.created_at,
    clustering_version: row.clustering_version,
  }));
}

/**
 * Retrieve cluster members (for evidence display).
 */
export async function getClusterMembers(clusterId: string): Promise<ClusterMemberRow[]> {
  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;

  const [rows] = await bq.query({
    query: `
      SELECT
        cluster_id,
        comment_id,
        video_id,
        similarity_score,
        CAST(created_at AS STRING) AS created_at
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_CLUSTER_MEMBERS}\`
      WHERE cluster_id = @cluster_id
      ORDER BY similarity_score DESC
    `,
    params: { cluster_id: clusterId },
    location: process.env.BIGQUERY_LOCATION,
  });

  return (rows || []).map((row: any) => ({
    cluster_id: row.cluster_id,
    comment_id: row.comment_id,
    video_id: row.video_id,
    similarity_score: row.similarity_score,
    created_at: row.created_at,
  }));
}

/** Return the original stored comments that substantiate a question cluster. */
export async function getClusterEvidence(clusterId: string): Promise<ClusterEvidenceRow[]> {
  const bq = getBigQueryClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID!;
  const datasetId = process.env.BIGQUERY_DATASET!;

  const [rows] = await bq.query({
    query: `
      SELECT m.cluster_id, m.comment_id, m.video_id, m.similarity_score,
             CAST(m.created_at AS STRING) AS created_at,
             c.comment_text, c.is_reply, CAST(c.published_at AS STRING) AS published_at
      FROM \`${projectId}.${datasetId}.${TABLE_NAMES.QUESTION_CLUSTER_MEMBERS}\` m
      INNER JOIN \`${projectId}.${datasetId}.${TABLE_NAMES.COMMENTS}\` c
        ON c.comment_id = m.comment_id AND c.video_id = m.video_id
      WHERE m.cluster_id = @cluster_id
      ORDER BY m.similarity_score DESC, c.published_at
    `,
    params: { cluster_id: clusterId },
    location: process.env.BIGQUERY_LOCATION,
  });

  return (rows || []).map((row: any) => ({
    cluster_id: row.cluster_id,
    comment_id: row.comment_id,
    video_id: row.video_id,
    similarity_score: row.similarity_score,
    created_at: row.created_at,
    comment_text: row.comment_text,
    is_reply: row.is_reply,
    published_at: row.published_at,
  }));
}
