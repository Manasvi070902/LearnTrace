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
  alreadyAnalyzed?: number;
  targetAnalyzed?: number;
  newConversationsRequired?: number;
  commentsSelected?: number;
  commentsCached?: number;
  commentsSubmitted?: number;
  geminiRequests?: number;
  resultsStored?: number;
  commentsAnalyzed?: number;
  learningSignals?: number;
  intentCounts?: Record<string, number>;
  analyses?: CommentAnalysis[];
  frictionReport?: FrictionReport;
  confusionMap?: FrictionScore[];
  error?: string;
}

export interface FrictionScore {
  video_id: string;
  normalized_concept: string;
  learning_friction_score: number | null;
  friction_level: 'Low' | 'Moderate' | 'High' | 'Critical' | 'Insufficient Evidence';
  question_count: number;
  cluster_count: number;
  evidence_count: number;
}

export interface FrictionReport {
  availableComments: number;
  aiAnalyzedComments: number;
  learningSignals: number;
  canonicalQuestions: number;
  embeddingsGenerated: number;
  embeddingsCached: number;
  questionClusters: number;
  normalizedConcepts: number;
  conceptsWithEvidence: number;
  conceptsInsufficientEvidence: number;
  technicalBarriers: number;
  curriculumNavigationSignals: number;
}

export interface FrictionResponse {
  status: 'success' | 'error';
  videoId?: string;
  report?: FrictionReport;
  confusionMap?: FrictionScore[];
  error?: string;
}

export interface ClusterEvidence {
  comment_id: string;
  comment_text: string;
  is_reply: boolean;
  published_at: string;
  similarity_score: number;
}

export interface QuestionClusterDetail {
  cluster_id: string;
  cluster_label: string;
  question_count: number;
  evidence: ClusterEvidence[];
}

export interface ConceptClustersResponse {
  status: 'success' | 'error';
  clusters?: QuestionClusterDetail[];
  error?: string;
}

export interface AiInterpretation {
  summary: string;
  possibleLearningGap: string;
  recommendedAction: string;
  confidence: number;
  evidenceClusterIds: string[];
}

export interface DiagnosisResponse {
  status: 'success' | 'error';
  eligible?: boolean;
  cached?: boolean;
  message?: string;
  supportingText?: string;
  interpretation?: AiInterpretation | null;
  error?: string;
}
