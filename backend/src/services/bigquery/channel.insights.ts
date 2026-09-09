import { getBigQueryClient } from './bigquery.client';
import { TABLE_NAMES } from './bigquery.schema';

export interface ChannelVideoInsight { videoId: string; analyzed: boolean; conversations: number; learningPatterns: number; needsResponse: number; }
export type ChannelOverviewKey = 'difficulties' | 'requests' | 'strengths' | 'response';
export interface ChannelOverviewVideo { videoId: string; title: string; value: number; }
export interface CrossVideoPatternEvidence { videoId: string; title: string; supportingSignals: number; exampleQuestion?: string; }
export interface CrossVideoPattern { concept: string; videos: number; supportingSignals: number; evidence: CrossVideoPatternEvidence[]; }

/** Aggregates only persisted LearnTrace data for a public channel; no providers are invoked. */
export async function getChannelOverview(channelId: string) {
  const [rows] = await getBigQueryClient().query({
    query: `SELECT video_id FROM \`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${TABLE_NAMES.VIDEOS}\` WHERE channel_id = @channel_id`,
    params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION,
  });
  const result = await getChannelInsights((rows || []).map((row: { video_id: string }) => row.video_id));
  const table = (name: string) => `\`${process.env.GOOGLE_CLOUD_PROJECT_ID}.${process.env.BIGQUERY_DATASET}.${name}\``;
  const [[breakdownRows], [crossVideoRows]] = await Promise.all([getBigQueryClient().query({ query: `
    SELECT v.video_id, v.title,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.QUESTION_CLUSTERS)} c WHERE c.video_id = v.video_id) difficulties,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} a WHERE a.video_id = v.video_id AND a.intent = 'content_request') requests,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.COMMENT_ANALYSIS)} a WHERE a.video_id = v.video_id AND a.intent IN ('praise', 'positive_signal')) strengths,
      (SELECT COUNT(*) FROM ${table(TABLE_NAMES.RESPONSE_WORKFLOW)} w WHERE w.video_id = v.video_id AND w.resolution_status IN ('needs_response', 'unclear')) response
    FROM ${table(TABLE_NAMES.VIDEOS)} v WHERE v.channel_id = @channel_id`, params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION }), getBigQueryClient().query({ query: `
    WITH analyzed_videos AS (
      SELECT video_id, title FROM ${table(TABLE_NAMES.VIDEOS)} WHERE channel_id = @channel_id
    ), per_video AS (
      SELECT f.normalized_concept AS concept, f.video_id, MAX(f.evidence_count) AS supporting_signals
      FROM ${table(TABLE_NAMES.LEARNING_FRICTION)} f
      JOIN analyzed_videos USING (video_id)
      WHERE LOWER(f.normalized_concept) NOT IN ('uncategorized', 'unknown', 'general')
      GROUP BY concept, f.video_id
    ), recurring AS (
      SELECT concept, COUNT(DISTINCT video_id) AS video_count, SUM(supporting_signals) AS supporting_signals
      FROM per_video GROUP BY concept HAVING COUNT(DISTINCT video_id) >= 2
    ), evidence AS (
      SELECT p.concept, p.video_id, v.title, p.supporting_signals,
        ARRAY_AGG(c.comment_text IGNORE NULLS LIMIT 1)[SAFE_OFFSET(0)] AS example_question
      FROM per_video p
      JOIN recurring r USING (concept)
      JOIN analyzed_videos v USING (video_id)
      LEFT JOIN ${table(TABLE_NAMES.QUESTION_CLUSTERS)} q
        ON q.video_id = p.video_id AND LOWER(TRIM(q.primary_concept)) = p.concept
      LEFT JOIN ${table(TABLE_NAMES.COMMENTS)} c
        ON c.video_id = q.video_id AND c.comment_id IN UNNEST(q.representative_comment_ids)
      GROUP BY p.concept, p.video_id, v.title, p.supporting_signals
    )
    SELECT r.concept, r.video_count, r.supporting_signals, e.video_id, e.title, e.supporting_signals AS video_supporting_signals, e.example_question
    FROM recurring r JOIN evidence e USING (concept)
    ORDER BY r.video_count DESC, r.supporting_signals DESC, r.concept, e.supporting_signals DESC`, params: { channel_id: channelId }, location: process.env.BIGQUERY_LOCATION })]);
  const breakdowns = (['difficulties', 'requests', 'strengths', 'response'] as ChannelOverviewKey[]).reduce<Record<ChannelOverviewKey, ChannelOverviewVideo[]>>((all, key) => {
    all[key] = (breakdownRows || []).map((row: any) => ({ videoId: row.video_id, title: row.title, value: Number(row[key] || 0) })).filter((row) => row.value > 0).sort((a, b) => b.value - a.value);
    return all;
  }, { difficulties: [], requests: [], strengths: [], response: [] });
  const crossVideoPatterns = new Map<string, CrossVideoPattern>();
  for (const row of crossVideoRows || []) {
    const concept = String(row.concept);
    const pattern = crossVideoPatterns.get(concept) || { concept, videos: Number(row.video_count), supportingSignals: Number(row.supporting_signals), evidence: [] };
    pattern.evidence.push({ videoId: row.video_id, title: row.title, supportingSignals: Number(row.video_supporting_signals), exampleQuestion: row.example_question || undefined });
    crossVideoPatterns.set(concept, pattern);
  }
  return { ...result, overview: { ...result.overview, breakdowns }, crossVideoPatterns: [...crossVideoPatterns.values()] };
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
