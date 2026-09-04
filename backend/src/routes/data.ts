import { Router, Request, Response } from 'express';
import { getCachedVideoAnalysis, getVideoStats } from '../services/bigquery/bigquery.retrieval';

const router = Router();

const validVideoId = (value: string) => /^[A-Za-z0-9_-]{11}$/.test(value);

/** Read a persisted analysis without invoking YouTube, Gemini, embeddings, or scoring. */
router.get('/video/:videoId/cached-analysis', async (req: Request, res: Response) => {
  const videoId = typeof req.params.videoId === 'string' ? req.params.videoId.trim() : '';
  if (!validVideoId(videoId)) return res.status(400).json({ status: 'error', error: 'Invalid video identifier.' });
  try {
    const analysis = await getCachedVideoAnalysis(videoId);
    if (!analysis) return res.status(404).json({ status: 'error', error: 'Cached analysis is unavailable.' });
    return res.json(analysis);
  } catch (error) {
    console.error(`[Data API] Failed to load cached analysis for '${videoId}':`, error);
    return res.status(503).json({ status: 'error', error: 'Cached analysis is temporarily unavailable.' });
  }
});

/**
 * GET /api/data/video/:videoId/stats
 *
 * Queries BigQuery for the actual stored counts of a specific video.
 * Returns real database counts — not frontend state.
 * Returns 404 if the video has not been stored in BigQuery yet.
 */
router.get('/video/:videoId/stats', async (req: Request, res: Response) => {
  const { videoId } = req.params;

  if (!videoId || typeof videoId !== 'string' || videoId.trim() === '') {
    return res.status(400).json({
      error: 'Missing or invalid videoId parameter.',
    });
  }

  try {
    const stats = await getVideoStats(videoId.trim());

    if (!stats) {
      return res.status(404).json({
        error: `Video '${videoId}' has not been stored in BigQuery yet. Analyze the video first.`,
        videoId,
        videoStored: false,
      });
    }

    return res.json(stats);
  } catch (err: any) {
    console.error('[Data API] Error querying BigQuery stats:', err);

    const isAuthError =
      err.message?.includes('credentials') ||
      err.message?.includes('UNAUTHENTICATED') ||
      err.code === 401;

    if (isAuthError) {
      return res.status(500).json({
        error:
          'BigQuery authentication failed. Run `gcloud auth application-default login` and restart the server.',
        videoId,
      });
    }

    return res.status(500).json({
      error: 'Failed to query BigQuery stats. Check server logs for details.',
      videoId,
    });
  }
});

export default router;
