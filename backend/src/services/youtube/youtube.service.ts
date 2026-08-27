import axios, { AxiosResponse } from 'axios';
import {
  YouTubeApiVideoListResponse,
  YouTubeApiCommentThreadListResponse,
  YouTubeApiCommentListResponse,
  YouTubeApiCommentItem,
  YouTubeVideoMetadata,
  YouTubeComment,
  YouTubeReply,
  FetchCommentsResult,
  AnalyzeVideoOptions,
  AnalyzeVideoResponse,
} from './youtube.types';
import { extractVideoId } from './youtube.parser';

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * Fetches video metadata from YouTube Data API v3.
 */
export async function fetchVideoMetadata(
  videoId: string,
  apiKey: string
): Promise<YouTubeVideoMetadata> {
  const url = `${YOUTUBE_API_BASE_URL}/videos`;
  const response: AxiosResponse<YouTubeApiVideoListResponse> = await axios.get<YouTubeApiVideoListResponse>(url, {
    params: {
      part: 'snippet,contentDetails,statistics',
      id: videoId,
      key: apiKey,
    },
    timeout: 10000,
  });

  const items = response.data?.items;
  if (!items || items.length === 0) {
    throw new Error(`Video with ID '${videoId}' was not found or is private.`);
  }

  const video = items[0];
  const snippet = video.snippet;
  const contentDetails = video.contentDetails;
  const statistics = video.statistics;

  const thumbnails = snippet?.thumbnails;
  const thumbnailUrl =
    thumbnails?.maxres?.url ||
    thumbnails?.high?.url ||
    thumbnails?.medium?.url ||
    thumbnails?.default?.url;

  return {
    videoId: video.id,
    title: snippet?.title || 'Untitled Video',
    channelId: snippet?.channelId || '',
    channelTitle: snippet?.channelTitle || 'Unknown Channel',
    publishedAt: snippet?.publishedAt || new Date().toISOString(),
    duration: contentDetails?.duration,
    viewCount: statistics?.viewCount,
    thumbnailUrl,
  };
}

/**
 * Fetches comment threads for a YouTube video, handling pagination up to maxComments limit.
 */
export async function fetchCommentThreads(
  videoId: string,
  apiKey: string,
  maxComments: number = 500
): Promise<FetchCommentsResult> {
  const url = `${YOUTUBE_API_BASE_URL}/commentThreads`;
  const comments: YouTubeComment[] = [];
  let pageToken: string | undefined = undefined;
  let totalCommentsCount = 0;
  let totalRepliesCount = 0;

  try {
    while (totalCommentsCount < maxComments) {
      // YouTube maxResults allowed per request is 100 for commentThreads
      const fetchLimit = Math.min(100, maxComments - totalCommentsCount);

      const apiRes: AxiosResponse<YouTubeApiCommentThreadListResponse> = await axios.get<YouTubeApiCommentThreadListResponse>(url, {
        params: {
          part: 'snippet,replies',
          videoId,
          maxResults: fetchLimit,
          order: 'relevance',
          pageToken,
          key: apiKey,
        },
        timeout: 15000,
      });

      const items = apiRes.data?.items || [];
      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        if (totalCommentsCount >= maxComments) break;

        const threadSnippet = item.snippet;
        const topLevelSnippet = threadSnippet?.topLevelComment?.snippet;

        if (!topLevelSnippet) continue;

        const totalReplyCount = threadSnippet.totalReplyCount || 0;
        let inlineReplies: YouTubeReply[] = [];

        // 1. Process inline replies returned by commentThreads endpoint
        if (item.replies?.comments) {
          inlineReplies = item.replies.comments
            .filter((replyItem: YouTubeApiCommentItem) => Boolean(replyItem.snippet))
            .map((replyItem: YouTubeApiCommentItem) => {
              const rSnippet = replyItem.snippet!;
              return {
                id: replyItem.id,
                parentId: rSnippet.parentId || item.id,
                authorDisplayName: rSnippet.authorDisplayName || 'Anonymous',
                authorProfileImageUrl: rSnippet.authorProfileImageUrl,
                textDisplay: rSnippet.textDisplay || '',
                textOriginal: rSnippet.textOriginal || rSnippet.textDisplay || '',
                likeCount: rSnippet.likeCount || 0,
                publishedAt: rSnippet.publishedAt,
                updatedAt: rSnippet.updatedAt,
              };
            });
        }

        // 2. If thread has more replies than returned inline, fetch remaining replies if quota/limit allows
        if (totalReplyCount > inlineReplies.length && totalCommentsCount + inlineReplies.length < maxComments) {
          try {
            const fetchedReplies = await fetchRepliesForComment(item.id, apiKey);
            if (fetchedReplies.length > inlineReplies.length) {
              inlineReplies = fetchedReplies;
            }
          } catch (replyErr) {
            // Ignore error fetching additional replies, use existing inline replies
          }
        }

        const normalizedComment: YouTubeComment = {
          id: item.id,
          videoId: threadSnippet.videoId || videoId,
          authorDisplayName: topLevelSnippet.authorDisplayName || 'Anonymous',
          authorProfileImageUrl: topLevelSnippet.authorProfileImageUrl,
          textDisplay: topLevelSnippet.textDisplay || '',
          textOriginal: topLevelSnippet.textOriginal || topLevelSnippet.textDisplay || '',
          likeCount: topLevelSnippet.likeCount || 0,
          publishedAt: topLevelSnippet.publishedAt,
          updatedAt: topLevelSnippet.updatedAt,
          totalReplyCount,
          replies: inlineReplies,
        };

        comments.push(normalizedComment);
        totalCommentsCount += 1;
        totalRepliesCount += inlineReplies.length;
      }

      pageToken = apiRes.data?.nextPageToken;
      if (!pageToken) {
        break;
      }
    }

    return {
      comments,
      totalCommentsFetched: totalCommentsCount,
      totalRepliesFetched: totalRepliesCount,
      commentsDisabled: false,
    };
  } catch (err: any) {
    // Check if comments are disabled on this video
    const responseError = err?.response?.data?.error;
    const statusCode = err?.response?.status;

    if (statusCode === 403) {
      const errorMsg = responseError?.message || '';
      const isCommentsDisabled =
        errorMsg.toLowerCase().includes('disabled comments') ||
        errorMsg.toLowerCase().includes('commentsdisabled') ||
        responseError?.errors?.some((e: any) => e.reason === 'commentsDisabled');

      if (isCommentsDisabled) {
        return {
          comments: [],
          totalCommentsFetched: 0,
          totalRepliesFetched: 0,
          commentsDisabled: true,
        };
      }
    }

    throw err;
  }
}

/**
 * Helper to fetch replies for a specific top-level comment thread.
 */
async function fetchRepliesForComment(
  parentId: string,
  apiKey: string
): Promise<YouTubeReply[]> {
  const url = `${YOUTUBE_API_BASE_URL}/comments`;
  const response: AxiosResponse<YouTubeApiCommentListResponse> = await axios.get<YouTubeApiCommentListResponse>(url, {
    params: {
      part: 'snippet',
      parentId,
      maxResults: 100,
      key: apiKey,
    },
    timeout: 10000,
  });

  const items = response.data?.items || [];
  return items
    .filter((item: YouTubeApiCommentItem) => Boolean(item.snippet))
    .map((item: YouTubeApiCommentItem) => {
      const snippet = item.snippet!;
      return {
        id: item.id,
        parentId: snippet.parentId || parentId,
        authorDisplayName: snippet.authorDisplayName || 'Anonymous',
        authorProfileImageUrl: snippet.authorProfileImageUrl,
        textDisplay: snippet.textDisplay || '',
        textOriginal: snippet.textOriginal || snippet.textDisplay || '',
        likeCount: snippet.likeCount || 0,
        publishedAt: snippet.publishedAt,
        updatedAt: snippet.updatedAt,
      };
    });
}

/**
 * Orchestrates full YouTube video analysis pipeline.
 */
export async function analyzeYouTubeVideo(
  inputUrl: string,
  options?: AnalyzeVideoOptions
): Promise<AnalyzeVideoResponse> {
  const videoId = extractVideoId(inputUrl);

  if (!videoId) {
    return {
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      comments: [],
      error: 'Invalid YouTube video URL. Please provide a valid YouTube video link (e.g. https://www.youtube.com/watch?v=...).',
    };
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey || apiKey === 'your_youtube_api_key_here') {
    return {
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      comments: [],
      error: 'YouTube API Key is missing on the server. Please set YOUTUBE_API_KEY in your backend .env file.',
    };
  }

  try {
    const maxComments = options?.maxComments || 500;

    // 1. Fetch Video Metadata
    const videoMetadata = await fetchVideoMetadata(videoId, apiKey);

    // 2. Fetch Comment Threads & Replies
    const commentsResult = await fetchCommentThreads(videoId, apiKey, maxComments);

    return {
      status: 'success',
      video: videoMetadata,
      totalCommentsFetched: commentsResult.totalCommentsFetched,
      totalRepliesFetched: commentsResult.totalRepliesFetched,
      comments: commentsResult.comments,
      commentsDisabled: commentsResult.commentsDisabled,
    };
  } catch (err: any) {
    const statusCode = err?.response?.status;
    const apiErrorMessage = err?.response?.data?.error?.message;

    let userFriendlyError = 'Failed to analyze YouTube video data.';

    if (statusCode === 404 || err.message?.includes('not found')) {
      userFriendlyError = `YouTube video with ID '${videoId}' was not found or is private.`;
    } else if (statusCode === 400) {
      userFriendlyError = `Bad Request: ${apiErrorMessage || 'Invalid video parameters.'}`;
    } else if (statusCode === 403) {
      if (apiErrorMessage?.toLowerCase().includes('quota')) {
        userFriendlyError = 'YouTube API quota limit exceeded. Please check your API key quota.';
      } else if (apiErrorMessage?.toLowerCase().includes('key')) {
        userFriendlyError = 'Invalid YouTube API key configured on server.';
      } else {
        userFriendlyError = apiErrorMessage || 'Access forbidden by YouTube API.';
      }
    } else if (err.message) {
      userFriendlyError = err.message;
    }

    return {
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      comments: [],
      error: userFriendlyError,
    };
  }
}
