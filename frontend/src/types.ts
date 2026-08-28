export interface YouTubeVideoMetadata {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration?: string;
  viewCount?: string;
  commentCount?: string;
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

export interface AnalyzeVideoResponse {
  status: 'success' | 'error';
  video?: YouTubeVideoMetadata;
  totalCommentsFetched: number;
  totalRepliesFetched: number;
  comments: YouTubeComment[];
  totalRepliesExpected?: number;
  missingReplies?: number;
  youtubeCommentCount?: number;
  missingRecords?: number;
  commentsDisabled?: boolean;
  error?: string;
  youtube?: YouTubeStatus;
  bigquery?: BigQueryStatus;
}

export interface YouTubeStatus {
  status: 'success' | 'error';
  commentsFetched: number;
  repliesFetched: number;
  repliesExpected?: number;
  missingReplies?: number;
  youtubeCommentCount?: number;
  missingRecords?: number;
}

export interface BigQueryStatus {
  status: 'success' | 'error' | 'skipped';
  videoStored?: boolean;
  commentsStored?: number;
  error?: string;
  reason?: string;
}

export interface VideoStats {
  videoId: string;
  videoStored: boolean;
  commentsStored: number;
  repliesStored: number;
  totalRecords: number;
}
