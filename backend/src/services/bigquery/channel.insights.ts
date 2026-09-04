import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';

export interface ChannelVideoInsight { videoId: string; analyzed: boolean; conversations: number; learningPatterns: number; needsResponse: number; }

/** Aggregates only persisted LearnTrace data for a public channel; no providers are invoked. */
export async function getChannelOverview(channelId: string) {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT video_id FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.VIDEOS}\` WHERE channel_id = @channel_id`,
    params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION,
  });
  return getChannelInsights((rows || []).map((row: { video_id: string }) => row.video_id));
}
export async function getChannelInsights(videoIds: string[]) {
  if (!videoIds.length) return { videos: new Map<string, ChannelVideoInsight>(), overview: { analyzedVideos: 0, cards: [] as Array<{ key: string; label: string; value: number }> }, concepts: [] as Array<{ concept: string; videos: number; learners: number }> };
  const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
  const [rows] = await getBigQueryClient().query({ query: `
    WITH ids AS (SELECT video_id FROM UNNEST(@video_ids) video_id), known AS (SELECT v.video_id FROM ${table(TABLE_NAMES.VIDEOS)} v JOIN ids USING(video_id)), comments AS (SELECT video_id, COUNT(*) conversations FROM ${table(TABLE_NAMES.COMMENTS)} WHERE video_id IN (SELECT video_id FROM ids) GROUP BY video_id), patterns AS (SELECT video_id, COUNT(*) patterns FROM ${table(TABLE_NAMES.QUESTION_CLUSTERS)} WHERE video_id IN (SELECT video_id FROM ids) GROUP BY video_id), needs AS (SELECT video_id, COUNT(*) needs_response FROM ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} WHERE video_id IN (SELECT video_id FROM ids) AND resolution_status IN ('needs_response', 'unclear') GROUP BY video_id), requests AS (SELECT COUNT(*) value FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} WHERE video_id IN (SELECT video_id FROM known) AND intent = 'content_request'), strengths AS (SELECT COUNT(*) value FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} WHERE video_id IN (SELECT video_id FROM known) AND intent IN ('praise', 'positive_signal'))
    SELECT ids.video_id, EXISTS(SELECT 1 FROM known WHERE known.video_id = ids.video_id) analyzed, IFNULL(comments.conversations, 0) conversations, IFNULL(patterns.patterns, 0) patterns, IFNULL(needs.needs_response, 0) needs_response, (SELECT value FROM requests) content_requests, (SELECT value FROM strengths) teaching_strengths FROM ids LEFT JOIN comments USING(video_id) LEFT JOIN patterns USING(video_id) LEFT JOIN needs USING(video_id)`, params: { video_ids: videoIds }, types: { video_ids: ['STRING'] }, location: process.env.BIGQUERY_LOCATION });
  const videos = new Map<string, ChannelVideoInsight>(); let analyzedVideos = 0; let difficulties = 0; let needsResponse = 0; let contentRequests = 0; let strengths = 0;
  for (const row of rows || []) { const analyzed = Boolean(row.analyzed); const item = { videoId: row.video_id, analyzed, conversations: Number(row.conversations), learningPatterns: Number(row.patterns), needsResponse: Number(row.needs_response) }; videos.set(item.videoId, item); if (analyzed) { analyzedVideos++; difficulties += item.learningPatterns; needsResponse += item.needsResponse; contentRequests = Number(row.content_requests || 0); strengths = Number(row.teaching_strengths || 0); } }
  const [conceptRows] = await getBigQueryClient().query({ query: `SELECT normalized_concept concept, COUNT(DISTINCT video_id) videos, SUM(evidence_count) learners FROM ${table(TABLE_NAMES.LEARNING_FRICTION)} WHERE video_id IN UNNEST(@video_ids) GROUP BY normalized_concept HAVING COUNT(DISTINCT video_id) >= 2 ORDER BY videos DESC, learners DESC LIMIT 6`, params: { video_ids: videoIds }, types: { video_ids: ['STRING'] }, location: process.env.BIGQUERY_LOCATION });
  const cards = [{ key: 'difficulties', label: 'Recurring learning difficulties', value: difficulties }, { key: 'requests', label: 'Content requests', value: contentRequests }, { key: 'strengths', label: 'Teaching strengths', value: strengths }, { key: 'response', label: 'Needs response', value: needsResponse }].filter((card) => card.value > 0);
  return { videos, overview: { analyzedVideos, cards }, concepts: (conceptRows || []).map((row: any) => ({ concept: row.concept, videos: Number(row.videos), learners: Number(row.learners) })) };
}
