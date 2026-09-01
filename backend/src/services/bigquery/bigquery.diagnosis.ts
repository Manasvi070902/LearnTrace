import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';
import { AiInterpretation, PHASE6_DIAGNOSIS_VERSION } from '../phase6/interpretation.service';

export interface DiagnosisRow extends AiInterpretation {
  video_id: string; concept: string; concept_key: string; learning_friction_score: number;
  friction_level: string; evidence_fingerprint: string; model_name: string;
  diagnosis_version: string; created_at: string;
}
const tableName = () => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.CONCEPT_DIAGNOSIS}\``;

export async function getCachedDiagnosis(videoId: string, conceptKey: string, modelName: string, fingerprint: string): Promise<DiagnosisRow | null> {
  const [rows] = await getBigQueryClient().query({ query: `SELECT d.video_id, d.concept, d.concept_key, d.learning_friction_score, d.friction_level, d.summary, d.possible_learning_gap, d.recommended_action, d.confidence, d.evidence_cluster_ids, d.evidence_fingerprint, d.model_name, d.diagnosis_version, CAST(d.created_at AS STRING) AS created_at FROM ${tableName()} AS d WHERE d.video_id=@video_id AND d.concept_key=@concept_key AND d.model_name=@model_name AND d.diagnosis_version=@diagnosis_version AND d.evidence_fingerprint=@fingerprint ORDER BY d.created_at DESC LIMIT 1`, params: { video_id: videoId, concept_key: conceptKey, model_name: modelName, diagnosis_version: PHASE6_DIAGNOSIS_VERSION, fingerprint }, location: process.env.BIGQUERY_LOCATION });
  if (!rows?.[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  return { ...row, possibleLearningGap: row.possible_learning_gap, recommendedAction: row.recommended_action, evidenceClusterIds: row.evidence_cluster_ids } as DiagnosisRow;
}

export async function storeDiagnosis(row: DiagnosisRow): Promise<void> {
  await getBigQueryClient().query({ query: `INSERT INTO ${tableName()} (video_id, concept, concept_key, learning_friction_score, friction_level, summary, possible_learning_gap, recommended_action, confidence, evidence_cluster_ids, evidence_fingerprint, model_name, diagnosis_version, created_at) VALUES (@video_id,@concept,@concept_key,@learning_friction_score,@friction_level,@summary,@possible_learning_gap,@recommended_action,@confidence,@evidence_cluster_ids,@evidence_fingerprint,@model_name,@diagnosis_version,TIMESTAMP(@created_at))`, params: { ...row, possible_learning_gap: row.possibleLearningGap, recommended_action: row.recommendedAction, evidence_cluster_ids: row.evidenceClusterIds }, location: process.env.BIGQUERY_LOCATION });
}
