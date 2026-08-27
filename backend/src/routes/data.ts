import { Router, Request, Response } from 'express';
import { getVideoStats } from '../services/bigquery/bigquery.retrieval';

const router = Router();

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
