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

export interface AnalyzeVideoResponse {
  status: 'success' | 'error';
  video?: YouTubeVideoMetadata;
  totalCommentsFetched: number;
  totalRepliesFetched: number;
  comments: YouTubeComment[];
  commentsDisabled?: boolean;
  error?: string;
}
