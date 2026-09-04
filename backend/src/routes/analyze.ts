import { Router, Request, Response } from 'express';
import { analyzeYouTubeVideo } from '../services/youtube/youtube.service';
import { persistAnalysisResult } from '../services/bigquery/bigquery.persistence';

const router = Router();

function friendlyYouTubeError(message: string, status?: number): { status: number; error: string } {
  const value = message.toLowerCase();
  if (value.includes('invalid youtube video url') || value.includes('invalid "url"')) return { status: 400, error: 'Enter a valid public YouTube video URL.' };
  if (value.includes('not found') || value.includes('private') || status === 404) return { status: 404, error: "This video isn't available for analysis. Make sure it is public and comments are accessible." };
  if (value.includes('commentsdisabled') || value.includes('disabled comments')) return { status: 400, error: 'Comments are unavailable for this video.' };
  if ((status && status >= 500) || value.includes('temporarily unavailable') || value.includes('failed to analyze youtube')) return { status: 503, error: 'YouTube is temporarily unavailable' };
  return { status: 400, error: 'Enter a valid public YouTube video URL.' };
}

/**
 * POST /api/analyze/video
 *
 * Analyzes a YouTube video URL, returns video metadata + comments,
 * and persists the data to BigQuery.
 *
 * Response shape:
 * {
 *   status: 'success' | 'error',
 *   video: { ... },
 *   comments: [...],
 *   totalCommentsFetched: number,
 *   totalRepliesFetched: number,
 *   commentsDisabled?: boolean,
 *   youtube: { status, commentsFetched, repliesFetched },
 *   bigquery: { status, videoStored?, commentsStored?, error? }
 * }
 */
router.post('/video', async (req: Request, res: Response) => {
  const { url, maxComments } = req.body || {};

  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      totalRepliesExpected: 0,
      missingReplies: 0,
      comments: [],
      error: 'Missing or invalid "url" parameter in request body.',
    });
  }

  try {
    // ── Step 1: Fetch from YouTube Data API ────────────────────────────────────
    const result = await analyzeYouTubeVideo(url, {
      maxComments: typeof maxComments === 'number' && maxComments > 0 ? maxComments : undefined,
    });

    if (result.status === 'error') {
      const friendly = friendlyYouTubeError(result.error || '');

      return res.status(friendly.status).json({
        ...result,
        error: friendly.error,
        youtube: { status: 'error', commentsFetched: 0, repliesFetched: 0 },
        bigquery: { status: 'skipped', reason: 'YouTube fetch failed' },
      });
    }

    const youtubeStatus = {
      status: 'success' as const,
      commentsFetched: result.totalCommentsFetched,
      repliesFetched: result.totalRepliesFetched,
      repliesExpected: result.totalRepliesExpected,
      missingReplies: result.missingReplies,
      youtubeCommentCount: result.youtubeCommentCount,
      missingRecords: result.missingRecords,
      threadPagesFetched: result.threadPagesFetched,
      replyApiCalls: result.replyApiCalls,
      duplicateIdsIgnored: result.duplicateIdsIgnored,
      totalUniqueCommentsFetched: result.totalUniqueCommentsFetched,
      apiErrors: result.apiErrors,
    };

    // ── Step 2: Persist to BigQuery ────────────────────────────────────────────
    let bigqueryStatus: {
      status: 'success' | 'error' | 'skipped';
      videoStored?: boolean;
      commentsStored?: number;
      error?: string;
      reason?: string;
    };

    if (result.video) {
      try {
        const persistResult = await persistAnalysisResult(result.video, result.comments);
        bigqueryStatus = {
          status: 'success',
          videoStored: persistResult.videoStored,
          commentsStored: persistResult.commentsStored,
        };
        console.log(
          `[BigQuery] Persisted video '${result.video.videoId}': ` +
            `${persistResult.commentsStored} comment rows stored.`
        );
      } catch (bqErr: any) {
        console.error('[BigQuery] Persistence failed:', bqErr);
        bigqueryStatus = {
          status: 'error',
          error: bqErr.message || 'BigQuery persistence failed. Check server logs.',
        };
      }
    } else {
      bigqueryStatus = {
        status: 'skipped',
        reason: 'No video metadata returned from YouTube API.',
      };
    }

    // ── Step 3: Return combined response ──────────────────────────────────────
    return res.json({
      ...result,
      youtube: youtubeStatus,
      bigquery: bigqueryStatus,
    });
  } catch (err: any) {
    console.error('[Analyze API] Unexpected error during video analysis:', err);
    return res.status(500).json({
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      totalRepliesExpected: 0,
      missingReplies: 0,
      comments: [],
      error: 'Something went wrong',
      youtube: { status: 'error', commentsFetched: 0, repliesFetched: 0 },
      bigquery: { status: 'error', error: 'Request failed before BigQuery persistence.' },
    });
  }
});

export default router;
