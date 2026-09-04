import { AnalyzeVideoResponse, ChannelCatalogResponse, ChannelMetadata, ConceptClustersResponse, CreatorActionsResponse, CreatorReplyAssessmentResponse, DiagnosisResponse, FrictionResponse, LearningSignalResponse, ResponseDraftMode, ResponseDraftResponse, ResponseWorkflowResponse, VideoStats } from '../types';
import { RequestErrorDetails } from '../components/RequestError';

const API_BASE_URL = '/api';

export function friendlyRequestError(status?: number, providerMessage?: string): RequestErrorDetails {
  const message = (providerMessage || '').toLowerCase();
  if ((status === 503 && /ai|gemini/.test(message)) || /high demand/.test(message)) return { title: 'AI is temporarily busy', message: 'AI analysis is experiencing high demand right now. Please try again shortly. Your existing LearnTrace data is safe.' };
  if (status === 429 && /daily|configured development ai limit/.test(message)) return { title: "Today's AI analysis allowance has been reached.", message: 'You can still explore any existing LearnTrace analysis.' };
  if (status === 429 || /rate limit|resource.?exhausted|quota/.test(message)) return { title: 'AI request temporarily unavailable', message: 'Please wait a moment and try again.' };
  if (status === 503 || /youtube/.test(message)) return { title: 'YouTube is temporarily unavailable', message: "We couldn't retrieve this video's conversations right now. Please try again." };
  if (/valid.*youtube|invalid.*url/.test(message) || status === 400) return { title: 'Enter a valid public YouTube video URL.', message: 'Check the link and try again.' };
  if (status === 404 || /private|isn't available/.test(message)) return { title: "This video isn't available for analysis.", message: 'Make sure it is public and comments are accessible.' };
  if (/comments.*unavailable|commentsdisabled/.test(message)) return { title: 'Comments are unavailable for this video.', message: 'Choose a video with public comments and try again.' };
  return { title: 'Something went wrong', message: "LearnTrace couldn't complete this request. Please try again." };
}

export function friendlyErrorMessage(message: string): RequestErrorDetails {
  if (/AI is temporarily busy/i.test(message)) return friendlyRequestError(503, 'AI unavailable');
  if (/AI request temporarily unavailable/i.test(message)) return friendlyRequestError(429, 'rate limit');
  if (/Today's AI analysis allowance/i.test(message)) return friendlyRequestError(429, 'daily limit');
  return friendlyRequestError(undefined, message);
}

/**
 * Sends a YouTube URL to the backend for video analysis.
 */
export async function analyzeVideo(url: string): Promise<AnalyzeVideoResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/analyze/video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok && !data.error) {
      return {
        status: 'error',
        totalCommentsFetched: 0,
        totalRepliesFetched: 0,
        comments: [],
        error: friendlyRequestError(response.status).title,
      };
    }

    if (!response.ok) return { ...data, error: friendlyRequestError(response.status, data.error).title };
    return data;
  } catch (err: any) {
    return {
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      comments: [],
      error: 'Something went wrong',
    };
  }
}

/** Fetches a persisted result only. It cannot trigger any provider work. */
export async function getCachedVideoAnalysis(videoId: string): Promise<AnalyzeVideoResponse> {
  const response = await fetch(`${API_BASE_URL}/data/video/${encodeURIComponent(videoId)}/cached-analysis`);
  const data = await response.json();
  if (!response.ok) throw friendlyRequestError(response.status, data.error);
  return data as AnalyzeVideoResponse;
}

export async function resolveChannel(url: string): Promise<ChannelMetadata> {
  const response = await fetch(`${API_BASE_URL}/channel/resolve?url=${encodeURIComponent(url)}`); const data = await response.json();
  if (!response.ok) throw friendlyRequestError(response.status, data.error); return data;
}
export async function getChannel(channelId: string): Promise<ChannelMetadata> {
  const response = await fetch(`${API_BASE_URL}/channel/${encodeURIComponent(channelId)}`); const data = await response.json();
  if (!response.ok) throw friendlyRequestError(response.status, data.error); return data;
}
export async function getChannelVideos(channelId: string, pageToken?: string): Promise<ChannelCatalogResponse> {
  const suffix = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : '';
  const response = await fetch(`${API_BASE_URL}/channel/${encodeURIComponent(channelId)}/videos${suffix}`); const data = await response.json();
  if (!response.ok) throw friendlyRequestError(response.status, data.error); return data;
}

/** Retrieves persisted BigQuery counts for a previously analyzed video. */
export async function verifyBigQuery(videoId: string): Promise<VideoStats> {
  const response = await fetch(
    `${API_BASE_URL}/data/video/${encodeURIComponent(videoId)}/stats`
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `BigQuery verification failed (${response.status}).`);
  }

  return data as VideoStats;
}

export async function analyzeLearningSignals(videoId: string): Promise<LearningSignalResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/learning-signals`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(friendlyRequestError(response.status, data.error).title);
  return data as LearningSignalResponse;
}

export async function getCachedLearningSignals(videoId: string): Promise<LearningSignalResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/learning-signals`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Cached learning signals failed (${response.status}).`);
  return data as LearningSignalResponse;
}

export async function runFrictionAnalysis(videoId: string): Promise<FrictionResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/friction`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Friction analysis failed (${response.status}).`);
  return data as FrictionResponse;
}

/** Retrieves stored audience results only; it never re-analyzes comments. */
export async function getCachedFrictionAnalysis(videoId: string): Promise<FrictionResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/friction`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Stored audience results failed (${response.status}).`);
  return data as FrictionResponse;
}

export async function getConceptClusters(videoId: string, concept: string): Promise<ConceptClustersResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/friction/concept/${encodeURIComponent(concept)}/clusters`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Concept detail failed (${response.status}).`);
  return data as ConceptClustersResponse;
}

export async function getConceptDiagnosis(videoId: string, concept: string): Promise<DiagnosisResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/concepts/${encodeURIComponent(concept)}/diagnosis`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load AI interpretation.');
  return data as DiagnosisResponse;
}

export async function generateConceptDiagnosis(videoId: string, concept: string): Promise<DiagnosisResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/concepts/${encodeURIComponent(concept)}/diagnosis`, { method: 'POST' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'AI interpretation is temporarily unavailable.');
  return data as DiagnosisResponse;
}

/** Loads cached creator-facing signals only; this endpoint never generates AI content. */
export async function getCreatorActions(videoId: string): Promise<CreatorActionsResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/creator-actions`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not load creator actions.');
  return data as CreatorActionsResponse;
}

export async function getResponseWorkflow(videoId: string): Promise<ResponseWorkflowResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/response-workflow`);
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not load response workflow.'); return data;
}
export async function setResponseWorkflowResolution(videoId: string, workflowId: string, resolved: boolean): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/response-workflow/${encodeURIComponent(workflowId)}/resolution`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolved }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not update response workflow.');
}
export async function generateResponseDraft(videoId: string, workflowId: string, mode: ResponseDraftMode, regenerate = false): Promise<ResponseDraftResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/response-workflow/${encodeURIComponent(workflowId)}/draft`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, regenerate }) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not draft a reply.'); return data;
}
export async function assessCreatorReply(videoId: string, workflowId: string): Promise<CreatorReplyAssessmentResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze/video/${encodeURIComponent(videoId)}/response-workflow/${encodeURIComponent(workflowId)}/creator-reply-check`, { method: 'POST' });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Creator-reply review is temporarily unavailable.'); return data;
}
