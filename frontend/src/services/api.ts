import { AnalyzeVideoResponse, ConceptClustersResponse, CreatorActionsResponse, CreatorReplyAssessmentResponse, DiagnosisResponse, FrictionResponse, LearningSignalResponse, ResponseDraftMode, ResponseDraftResponse, ResponseWorkflowResponse, VideoStats } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';

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
        error: `Server error (${response.status}): ${response.statusText}`,
      };
    }

    return data;
  } catch (err: any) {
    return {
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      comments: [],
      error: 'Failed to connect to LearnTrace backend server. Please ensure the backend is running on http://localhost:3001.',
    };
  }
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
  if (!response.ok) throw new Error(data.error || `Learning-signal analysis failed (${response.status}).`);
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
