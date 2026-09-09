import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';
import { CLUSTERING_VERSION } from '../clustering/clustering.service';
import { cosineSimilarity } from '../embedding/embedding.service';
import { areQuestionSignaturesCompatible, deriveQuestionSignature } from '../clustering/question-signature.service';
import { PROMPT_VERSION } from '../../prompts/comment-analysis.prompt';

export interface ChannelVideoInsight { videoId: string; analyzed: boolean; conversations: number; learningPatterns: number; needsResponse: number; }
export type ChannelOverviewKey = 'difficulties' | 'requests' | 'strengths' | 'response';
export interface ChannelOverviewVideo { videoId: string; title: string; value: number; }
export interface CrossVideoPatternEvidence { videoId: string; title: string; supportingSignals: number; exampleQuestion?: string; }
export interface CrossVideoPattern { concept: string; videos: number; supportingSignals: number; evidence: CrossVideoPatternEvidence[]; }
export interface ChannelActionQueueItem { workflowId: string; videoId: string; videoTitle: string; title: string; actionType: string; priority: 'high' | 'medium' | 'low'; supportingLearners: number; }
export interface ChannelActionQueue { totalPending: number; byVideo: ChannelOverviewVideo[]; byType: Array<{ label: string; value: number }>; items: ChannelActionQueueItem[]; }

type StoredChannelCluster = {
  clusterId: string; videoId: string; label: string; concept: string; count: number;
  evidence: Array<{ commentId: string; commentText: string }>;
};

const CHANNEL_TOPIC_THRESHOLD = () => {
  const value = Number(process.env.CHANNEL_TOPIC_SIMILARITY_THRESHOLD || 0.78);
  return Number.isFinite(value) ? Math.max(0.6, Math.min(0.95, value)) : 0.78;
};

const CHANNEL_STOP_WORDS = new Set(['what', 'which', 'when', 'where', 'who', 'why', 'how', 'does', 'this', 'that', 'the', 'and', 'for', 'from', 'with', 'into', 'about', 'video', 'used', 'use', 'using', 'can', 'could', 'should', 'help', 'question']);

function channelTopicWords(cluster: StoredChannelCluster): Set<string> {
  return new Set(`${cluster.concept} ${cluster.label}`.toLowerCase()
    .replace(/\bgcp\b/g, 'google cloud')
    .match(/[\p{L}\p{N}]+/gu)?.filter((word) => word.length > 2 && !CHANNEL_STOP_WORDS.has(word)) || []);
}

function channelClusterVector(cluster: StoredChannelCluster, embeddings: ReadonlyMap<string, number[]>): number[] | null {
  const vectors = cluster.evidence.map((item) => embeddings.get(item.commentId)).filter((value): value is number[] => Boolean(value?.length));
  if (!vectors.length || vectors.some((vector) => vector.length !== vectors[0].length)) return null;
  return Array.from({ length: vectors[0].length }, (_, index) => vectors.reduce((total, vector) => total + vector[index], 0) / vectors.length);
}

/** A conservative semantic layer for channel UX; source clusters remain intact. */
function groupChannelTopics(clusters: StoredChannelCluster[], embeddings: ReadonlyMap<string, number[]>): StoredChannelCluster[][] {
  const topics: StoredChannelCluster[][] = [];
  for (const cluster of [...clusters].sort((left, right) => left.clusterId.localeCompare(right.clusterId))) {
    const matchingTopic = topics.find((topic) => topic.every((member) => {
      if (!areQuestionSignaturesCompatible(deriveQuestionSignature(member.label), deriveQuestionSignature(cluster.label))) return false;
      const leftVector = channelClusterVector(member, embeddings); const rightVector = channelClusterVector(cluster, embeddings);
      if (!leftVector || !rightVector) return false;
      const similarity = cosineSimilarity(leftVector, rightVector);
      const leftWords = channelTopicWords(member); const rightWords = channelTopicWords(cluster);
      const sharedContext = [...leftWords].some((word) => rightWords.has(word));
      // A shared domain anchor allows ordinary paraphrases; without one, use
      // a much higher bar so a broad subject cannot pull an unrelated topic in.
      return similarity >= (sharedContext ? CHANNEL_TOPIC_THRESHOLD() : Math.max(0.86, CHANNEL_TOPIC_THRESHOLD()));
    }));
    if (matchingTopic) matchingTopic.push(cluster); else topics.push([cluster]);
  }
  return topics;
}

async function getChannelSemanticPatterns(videoRows: Array<{ video_id: string; title: string }>): Promise<CrossVideoPattern[]> {
  if (videoRows.length < 2) return [];
  const videoIds = videoRows.map((row) => row.video_id);
  const titles = new Map(videoRows.map((row) => [row.video_id, row.title]));
  const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
  const [clusterRows, embeddingRows] = await Promise.all([
    getBigQueryClient().query({ query: `
      SELECT q.cluster_id, q.video_id, q.cluster_label, q.primary_concept, q.question_count,
        m.comment_id, c.comment_text
      FROM ${table(TABLE_NAMES.QUESTION_CLUSTERS)} q
      JOIN ${table(TABLE_NAMES.QUESTION_CLUSTER_MEMBERS)} m ON m.cluster_id = q.cluster_id AND m.video_id = q.video_id
      JOIN ${table(TABLE_NAMES.COMMENTS)} c ON c.video_id = m.video_id AND c.comment_id = m.comment_id
      WHERE q.video_id IN UNNEST(@video_ids) AND q.clustering_version = @clustering_version
    `, params: { video_ids: videoIds, clustering_version: CLUSTERING_VERSION }, types: { video_ids: ['STRING'] }, location: process.env.BIGQUERY_LOCATION }),
    getBigQueryClient().query({ query: `
      SELECT comment_id, embedding FROM ${table(TABLE_NAMES.QUESTION_EMBEDDINGS)}
      WHERE video_id IN UNNEST(@video_ids) AND embedding_model = @embedding_model AND prompt_version = @prompt_version
    `, params: { video_ids: videoIds, embedding_model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001', prompt_version: PROMPT_VERSION }, types: { video_ids: ['STRING'] }, location: process.env.BIGQUERY_LOCATION }),
  ]);
  const byCluster = new Map<string, StoredChannelCluster>();
  for (const row of clusterRows[0] || []) {
    const existing: StoredChannelCluster = byCluster.get(row.cluster_id) || { clusterId: row.cluster_id, videoId: row.video_id, label: row.cluster_label, concept: row.primary_concept, count: Number(row.question_count), evidence: [] };
    existing.evidence.push({ commentId: row.comment_id, commentText: row.comment_text }); byCluster.set(existing.clusterId, existing);
  }
  const embeddings = new Map<string, number[]>((embeddingRows[0] || []).map((row: any) => [row.comment_id, row.embedding]));
  const patterns: CrossVideoPattern[] = [];
  for (const topic of groupChannelTopics([...byCluster.values()], embeddings)) {
      const byVideo = new Map<string, StoredChannelCluster[]>();
      for (const cluster of topic) byVideo.set(cluster.videoId, [...(byVideo.get(cluster.videoId) || []), cluster]);
      if (byVideo.size < 2) continue;
      const anchor = [...topic].sort((left, right) => right.count - left.count || left.clusterId.localeCompare(right.clusterId))[0];
      patterns.push({
        concept: anchor.concept,
        videos: byVideo.size,
        supportingSignals: new Set(topic.flatMap((cluster) => cluster.evidence.map((item) => item.commentId))).size,
        evidence: [...byVideo.entries()].map(([videoId, clusters]) => ({
          videoId, title: titles.get(videoId) || 'Analyzed video',
          supportingSignals: new Set(clusters.flatMap((cluster) => cluster.evidence.map((item) => item.commentId))).size,
          exampleQuestion: clusters.sort((left, right) => right.count - left.count)[0]?.label || undefined,
        })).sort((left, right) => right.supportingSignals - left.supportingSignals || left.title.localeCompare(right.title)),
      });
  }
  return patterns.sort((left, right) => right.videos - left.videos || right.supportingSignals - left.supportingSignals || left.concept.localeCompare(right.concept));
}

function actionQueueType(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('clarify')) return 'Clarify for everyone';
  if (normalized.includes('reply')) return 'Answer individually';
  if (normalized.includes('fix')) return 'Fix or clarify setup';
  if (normalized.includes('acknowledge')) return 'Acknowledge request';
  return value || 'Review with creator';
}

async function getChannelActionQueue(channelId: string): Promise<ChannelActionQueue> {
  const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
  const [rows] = await getBigQueryClient().query({ query: `
    SELECT w.workflow_id, w.video_id, v.title AS video_title, w.title, w.suggested_response_type,
      w.priority, w.supporting_comment_ids
    FROM ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} w
    JOIN ${table(TABLE_NAMES.VIDEOS)} v ON v.video_id = w.video_id
    WHERE v.channel_id = @channel_id AND w.resolution_status IN ('needs_response', 'unclear')
  `, params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION });
  const priorityRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const items = (rows || []).map((row: any): ChannelActionQueueItem => ({
    workflowId: row.workflow_id, videoId: row.video_id, videoTitle: row.video_title || 'Analyzed video',
    title: row.title || 'Audience follow-up', actionType: actionQueueType(row.suggested_response_type || ''),
    priority: row.priority === 'high' || row.priority === 'low' ? row.priority : 'medium',
    supportingLearners: Array.isArray(row.supporting_comment_ids) ? row.supporting_comment_ids.length : 1,
  })).sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || right.supportingLearners - left.supportingLearners || left.title.localeCompare(right.title));
  const counts = <T extends string>(values: T[]) => [...values.reduce((all, value) => all.set(value, (all.get(value) || 0) + 1), new Map<T, number>()).entries()].map(([label, value]) => ({ label, value })).sort((left, right) => right.value - left.value || left.label.localeCompare(right.label));
  return {
    totalPending: items.length,
    byVideo: counts(items.map((item) => item.videoId)).map(({ label: videoId, value }) => ({ videoId, title: items.find((item) => item.videoId === videoId)?.videoTitle || 'Analyzed video', value })),
    byType: counts(items.map((item) => item.actionType)), items,
  };
}

/** Aggregates only persisted LearnTrace data for a public channel; no providers are invoked. */
export async function getChannelOverview(channelId: string) {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT video_id, title FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.VIDEOS}\` WHERE channel_id = @channel_id`,
    params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION,
  });
  const channelVideoRows = (rows || []) as Array<{ video_id: string; title: string }>;
  const result = await getChannelInsights(channelVideoRows.map((row) => row.video_id));
  const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
  const [[breakdownRows], crossVideoPatterns, channelActionQueue] = await Promise.all([getBigQueryClient().query({ query: `
    SELECT v.video_id, v.title,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.QUESTION_CLUSTERS)} c WHERE c.video_id = v.video_id) difficulties,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} a WHERE a.video_id = v.video_id AND a.intent = 'content_request') requests,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} a WHERE a.video_id = v.video_id AND a.intent IN ('praise', 'positive_signal')) strengths,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} w WHERE w.video_id = v.video_id AND w.resolution_status IN ('needs_response', 'unclear')) response
    FROM ${table(TABLE_NAMES.VIDEOS)} v WHERE v.channel_id = @channel_id`, params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION }), getChannelSemanticPatterns(channelVideoRows), getChannelActionQueue(channelId)]);
  const breakdowns = (['difficulties', 'requests', 'strengths', 'response'] as ChannelOverviewKey[]).reduce<Record<ChannelOverviewKey, ChannelOverviewVideo[]>>((all, key) => {
    all[key] = (breakdownRows || []).map((row: any) => ({ videoId: row.video_id, title: row.title, value: Number(row[key] || 0) })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
    return all;
  }, { difficulties: [], requests: [], strengths: [], response: [] });
  return { ...result, overview: { ...result.overview, breakdowns }, crossVideoPatterns, channelActionQueue };
}

/** Stored video identities for immediate access when they fall outside the current YouTube page. */
export async function getStoredChannelVideos(channelId: string) {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT video_id, title, channel_title, CAST(published_at AS STRING) AS published_at, CAST(view_count AS STRING) AS view_count FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.VIDEOS}\` WHERE channel_id = @channel_id ORDER BY analyzed_at DESC`,
    params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION,
  });
  const ids = (rows || []).map((row: { video_id: string }) => row.video_id);
  const insights = await getChannelInsights(ids);
  return (rows || []).map((row: any) => ({
    videoId: row.video_id, title: row.title, channelTitle: row.channel_title,
    publishedAt: row.published_at, viewCount: row.view_count || undefined,
    thumbnailUrl: `https://i.ytimg.com/vi/${encodeURIComponent(row.video_id)}/hqdefault.jpg`,
    insight: insights.videos.get(row.video_id),
  }));
}
export async function getChannelInsights(videoIds: string[]) {
  if (!videoIds.length) return { videos: new Map<string, ChannelVideoInsight>(), overview: { analyzedVideos: 0, cards: [] as Array<{ key: string; label: string; value: number }> }, concepts: [] as Array<{ concept: string; videos: number; learners: number }> };
  const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
  const [rows] = await getBigQueryClient().query({ query: `
    WITH ids AS (SELECT video_id FROM UNNEST(@video_ids) video_id), known AS (SELECT v.video_id FROM ${table(TABLE_NAMES.VIDEOS)} v JOIN ids USING(video_id)), comments AS (SELECT video_id, COUNT(*) conversations FROM ${table(TABLE_NAMES.COMMENTS)} WHERE video_id IN (SELECT video_id FROM ids) GROUP BY video_id), patterns AS (SELECT video_id, COUNT(*) patterns FROM ${table(TABLE_NAMES.QUESTION_CLUSTERS)} WHERE video_id IN (SELECT video_id FROM ids) GROUP BY video_id), needs AS (SELECT video_id, COUNT(*) needs_response FROM ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} WHERE video_id IN (SELECT video_id FROM ids) AND resolution_status IN ('needs_response', 'unclear') GROUP BY video_id), requests AS (SELECT COUNT(*) value FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} WHERE video_id IN (SELECT video_id FROM known) AND intent = 'content_request'), strengths AS (SELECT COUNT(*) value FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} WHERE video_id IN (SELECT video_id FROM known) AND intent IN ('praise', 'positive_signal'))
    SELECT ids.video_id, EXISTS(SELECT 1 FROM known WHERE known.video_id = ids.video_id) analyzed, IFNULL(comments.conversations, 0) conversations, IFNULL(patterns.patterns, 0) patterns, IFNULL(needs.needs_response, 0) needs_response, (SELECT value FROM requests) content_requests, (SELECT value FROM strengths) teaching_strengths FROM ids LEFT JOIN comments USING(video_id) LEFT JOIN patterns USING(video_id) LEFT JOIN needs USING(video_id)`, params: { video_ids: videoIds }, types: { video_ids: ['STRING'] }, location: process.env.BIGQUERY_LOCATION });
  const videos = new Map<string, ChannelVideoInsight>(); let analyzedVideos = 0; let difficulties = 0; let needsResponse = 0; let contentRequests = 0; let strengths = 0;
  for (const row of rows || []) { const analyzed = Boolean(row.analyzed); const item = { videoId: row.video_id, analyzed, conversations: Number(row.conversations), learningPatterns: Number(row.patterns), needsResponse: Number(row.needs_response) }; videos.set(item.videoId, item); if (analyzed) { analyzedVideos++; difficulties += item.learningPatterns; needsResponse += item.needsResponse; contentRequests = Number(row.content_requests || 0); strengths = Number(row.teaching_strengths || 0); } }
  const cards = [{ key: 'difficulties', label: 'Learning patterns', value: difficulties }, { key: 'requests', label: 'Content requests', value: contentRequests }, { key: 'strengths', label: 'Teaching strengths', value: strengths }, { key: 'response', label: 'Needs response', value: needsResponse }].filter((card) => card.value > 0);
  return { videos, overview: { analyzedVideos, cards }, concepts: [] as Array<{ concept: string; videos: number; learners: number }> };
}
