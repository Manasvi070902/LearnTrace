import { AnalyzeVideoResponse } from '../types';

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
