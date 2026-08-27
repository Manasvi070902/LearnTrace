/**
 * YouTube Service Data Types
 */

// --- Raw YouTube API v3 Data Models ---

export interface YouTubeApiVideoItem {
  id: string;
  snippet?: {
    publishedAt: string;
    channelId: string;
    title: string;
    description?: string;
    channelTitle: string;
    thumbnails?: Record<string, { url: string; width: number; height: number }>;
  };
  contentDetails?: {
    duration?: string;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
}

export interface YouTubeApiVideoListResponse {
  kind: string;
  etag: string;
  items?: YouTubeApiVideoItem[];
}

export interface YouTubeApiCommentSnippet {
  videoId?: string;
  textDisplay: string;
  textOriginal: string;
  authorDisplayName: string;
  authorProfileImageUrl?: string;
  authorChannelId?: { value: string };
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
  parentId?: string;
}

export interface YouTubeApiCommentItem {
  id: string;
  snippet?: YouTubeApiCommentSnippet;
}

export interface YouTubeApiCommentThreadSnippet {
  videoId: string;
  topLevelComment: YouTubeApiCommentItem;
  totalReplyCount: number;
  isPublic: boolean;
}

export interface YouTubeApiCommentThreadItem {
  id: string;
  snippet?: YouTubeApiCommentThreadSnippet;
  replies?: {
    comments: YouTubeApiCommentItem[];
  };
}

export interface YouTubeApiCommentThreadListResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  pageInfo?: {
    totalResults: number;
    resultsPerPage: number;
  };
  items?: YouTubeApiCommentThreadItem[];
  error?: {
    code: number;
    message: string;
    errors?: Array<{ domain: string; reason: string; message: string }>;
  };
}

export interface YouTubeApiCommentListResponse {
  kind: string;
  etag: string;
  nextPageToken?: string;
  items?: YouTubeApiCommentItem[];
  error?: {
    code: number;
    message: string;
  };
}

// --- Internal Normalized Domain Models ---

export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
  thumbnailUrl?: string;
}

export interface YouTubeReply {
  id: string;
  parentId: string;
  authorDisplayName: string;
  authorProfileImageUrl?: string;
  textDisplay: string;
  textOriginal: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
}

export interface YouTubeComment {
  id: string;
  videoId: string;
  authorDisplayName: string;
  authorProfileImageUrl?: string;
  textDisplay: string;
  textOriginal: string;
  likeCount: number;
  publishedAt: string;
  updatedAt: string;
  totalReplyCount: number;
  replies: YouTubeReply[];
}

export interface FetchCommentsResult {
  comments: YouTubeComment[];
  totalCommentsFetched: number;
  totalRepliesFetched: number;
  commentsDisabled: boolean;
  error?: string;
}

export interface AnalyzeVideoOptions {
  maxComments?: number;
}

export interface AnalyzeVideoResponse {
  status: 'success' | 'error';
  video?: YouTubeVideoMetadata;
  totalCommentsFetched: number;
  totalRepliesFetched: number;
  comments: YouTubeComment[];
  commentsDisabled?: boolean;
  error?: string;
}
