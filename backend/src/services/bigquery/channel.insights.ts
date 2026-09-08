import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';

export interface ChannelVideoInsight { videoId: string; analyzed: boolean; conversations: number; learningPatterns: number; needsResponse: number; }
export type ChannelOverviewKey = 'difficulties' | 'requests' | 'strengths' | 'response';
export interface ChannelOverviewVideo { videoId: string; title: string; value: number; }

/** Aggregates only persisted LearnTrace data for a public channel; no providers are invoked. */
export async function getChannelOverview(channelId: string) {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT video_id FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.VIDEOS}\` WHERE channel_id = @channel_id`,
    params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION,
  });
  const result = await getChannelInsights((rows || []).map((row: { video_id: string }) => row.video_id));
  const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
  const [breakdownRows] = await getBigQueryClient().query({ query: `
    SELECT v.video_id, v.title,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.QUESTION_CLUSTERS)} c WHERE c.video_id = v.video_id) difficulties,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} a WHERE a.video_id = v.video_id AND a.intent = 'content_request') requests,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} a WHERE a.video_id = v.video_id AND a.intent IN ('praise', 'positive_signal')) strengths,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} w WHERE w.video_id = v.video_id AND w.resolution_status IN ('needs_response', 'unclear')) response
    FROM ${table(TABLE_NAMES.VIDEOS)} v WHERE v.channel_id = @channel_id`, params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION });
  const breakdowns = (['difficulties', 'requests', 'strengths', 'response'] as ChannelOverviewKey[]).reduce<Record<ChannelOverviewKey, ChannelOverviewVideo[]>>((all, key) => {
    all[key] = (breakdownRows || []).map((row: any) => ({ videoId: row.video_id, title: row.title, value: Number(row[key] || 0) })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
    return all;
  }, { difficulties: [], requests: [], strengths: [], response: [] });
  return { ...result, overview: { ...result.overview, breakdowns } };
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
  const [conceptRows] = await getBigQueryClient().query({ query: `SELECT normalized_concept concept, COUNT(DISTINCT video_id) videos, SUM(evidence_count) learners FROM ${table(TABLE_NAMES.LEARNING_FRICTION)} WHERE video_id IN UNNEST(@video_ids) AND LOWER(normalized_concept) NOT IN ('uncategorized', 'unknown', 'general') GROUP BY normalized_concept HAVING COUNT(DISTINCT video_id) >= 2 ORDER BY videos DESC, learners DESC LIMIT 6`, params: { video_ids: videoIds }, types: { video_ids: ['STRING'] }, location: process.env.BIGQUERY_LOCATION });
  const cards = [{ key: 'difficulties', label: 'Recurring learning difficulties', value: difficulties }, { key: 'requests', label: 'Content requests', value: contentRequests }, { key: 'strengths', label: 'Teaching strengths', value: strengths }, { key: 'response', label: 'Needs response', value: needsResponse }].filter((card) => card.value > 0);
  return { videos, overview: { analyzedVideos, cards }, concepts: (conceptRows || []).map((row: any) => ({ concept: row.concept, videos: Number(row.videos), learners: Number(row.learners) })) };
}
