import { Router, Request, Response } from 'express';
import { analyzeYouTubeVideo } from '../services/youtube/youtube.service';
import { persistAnalysisResult } from '../services/bigquery/bigquery.persistence';

const router = Router();

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
      comments: [],
      error: 'Missing or invalid "url" parameter in request body.',
    });
  }

  try {
    // ── Step 1: Fetch from YouTube Data API ────────────────────────────────────
    const result = await analyzeYouTubeVideo(url, {
      maxComments: typeof maxComments === 'number' && maxComments > 0 ? maxComments : 500,
    });

    if (result.status === 'error') {
      const statusCode = result.error?.includes('Invalid YouTube video URL')
        ? 400
        : result.error?.includes('not found')
        ? 404
        : result.error?.includes('missing')
        ? 500
        : 400;

      return res.status(statusCode).json({
        ...result,
        youtube: { status: 'error', commentsFetched: 0, repliesFetched: 0 },
        bigquery: { status: 'skipped', reason: 'YouTube fetch failed' },
      });
    }

    const youtubeStatus = {
      status: 'success' as const,
      commentsFetched: result.totalCommentsFetched,
      repliesFetched: result.totalRepliesFetched,
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
      comments: [],
      error: 'An unexpected internal server error occurred while processing the request.',
      youtube: { status: 'error', commentsFetched: 0, repliesFetched: 0 },
      bigquery: { status: 'error', error: 'Request failed before BigQuery persistence.' },
    });
  }
});

export default router;
