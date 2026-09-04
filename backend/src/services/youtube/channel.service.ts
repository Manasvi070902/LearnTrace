import axios from 'axios';
import { extractChannelReference } from './youtube.parser';

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

export interface ChannelMetadata { channelId: string; title: string; handle?: string; description?: string; thumbnailUrl?: string; subscriberCount?: string; videoCount?: string; uploadsPlaylistId: string; }
export interface ChannelVideo { videoId: string; title: string; thumbnailUrl?: string; publishedAt: string; channelTitle: string; viewCount?: string; commentCount?: string; }

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error('YouTube API is unavailable.');
  return key;
}

function mapChannel(item: any): ChannelMetadata {
  const snippet = item.snippet || {}; const stats = item.statistics || {}; const thumbs = snippet.thumbnails || {};
  const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error('Channel uploads are unavailable.');
  return { channelId: item.id, title: snippet.title || 'Untitled channel', handle: snippet.customUrl?.startsWith('@') ? snippet.customUrl : undefined, description: snippet.description || undefined, thumbnailUrl: thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url, subscriberCount: stats.hiddenSubscriberCount ? undefined : stats.subscriberCount, videoCount: stats.videoCount, uploadsPlaylistId };
}

export async function resolvePublicChannel(input: string): Promise<ChannelMetadata> {
  const reference = extractChannelReference(input);
  if (!reference) throw new Error('Enter a valid public YouTube channel URL.');
  const params: Record<string, string> = { part: 'snippet,contentDetails,statistics', key: apiKey() };
  if (reference.kind === 'id') params.id = reference.value;
  if (reference.kind === 'handle') params.forHandle = reference.value;
  if (reference.kind === 'username') params.forUsername = reference.value;
  const response = await axios.get(`${BASE_URL}/channels`, { params, timeout: 10000 });
  if (!response.data?.items?.length) throw new Error('Channel not found');
  return mapChannel(response.data.items[0]);
}

export async function getPublicChannel(channelId: string): Promise<ChannelMetadata> {
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(channelId)) throw new Error('Channel not found');
  const response = await axios.get(`${BASE_URL}/channels`, { params: { part: 'snippet,contentDetails,statistics', id: channelId, key: apiKey() }, timeout: 10000 });
  if (!response.data?.items?.length) throw new Error('Channel not found');
  return mapChannel(response.data.items[0]);
}

export async function getChannelVideos(channel: ChannelMetadata, pageToken?: string) {
  const response = await axios.get(`${BASE_URL}/playlistItems`, { params: { part: 'snippet,contentDetails', playlistId: channel.uploadsPlaylistId, maxResults: 24, pageToken, key: apiKey() }, timeout: 15000 });
  const ids = (response.data?.items || []).map((item: any) => item.contentDetails?.videoId).filter(Boolean);
  const stats = new Map<string, any>();
  if (ids.length) {
    const videoResponse = await axios.get(`${BASE_URL}/videos`, { params: { part: 'statistics', id: ids.join(','), key: apiKey() }, timeout: 10000 });
    for (const video of videoResponse.data?.items || []) stats.set(video.id, video.statistics || {});
  }
  const videos: ChannelVideo[] = (response.data?.items || []).map((item: any) => {
    const snippet = item.snippet || {}; const s = stats.get(item.contentDetails.videoId) || {}; const thumbs = snippet.thumbnails || {};
    return { videoId: item.contentDetails.videoId, title: snippet.title || 'Untitled video', thumbnailUrl: thumbs.medium?.url || thumbs.high?.url || thumbs.default?.url, publishedAt: item.contentDetails.videoPublishedAt || snippet.publishedAt, channelTitle: snippet.videoOwnerChannelTitle || channel.title, viewCount: s.viewCount, commentCount: s.commentCount };
  });
  return { videos, nextPageToken: response.data?.nextPageToken as string | undefined };
}
