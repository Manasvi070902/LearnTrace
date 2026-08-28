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

export type LearningIntent =
  | 'conceptual_confusion' | 'learning_question' | 'technical_error' | 'content_request'
  | 'disagreement' | 'feedback' | 'praise' | 'noise' | 'other';

export interface CommentAnalysis {
  comment_id: string;
  video_id: string;
  intent: LearningIntent;
  is_learning_signal: boolean;
  canonical_question: string | null;
  concept: string | null;
  confusion_strength: number;
  confidence: number;
  reason: string;
  model_name: string;
  prompt_version: string;
  analyzed_at: string;
}

export interface LearningSignalResponse {
  status: 'success' | 'error';
  videoId?: string;
  commentsConsidered?: number;
  availableComments?: number;
  commentsSelected?: number;
  commentsCached?: number;
  commentsSubmitted?: number;
  geminiRequests?: number;
  resultsStored?: number;
  commentsAnalyzed?: number;
  learningSignals?: number;
  intentCounts?: Record<string, number>;
  analyses?: CommentAnalysis[];
  error?: string;
}
