import { Router, Request, Response } from 'express';
import { analyzeYouTubeVideo } from '../services/youtube/youtube.service';

const router = Router();

/**
 * POST /api/analyze/video
 * Analyzes a YouTube video URL, returning video metadata, comment threads, and replies.
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

      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (err: any) {
    console.error('[Analyze API] Unexpected error during video analysis:', err);
    return res.status(500).json({
      status: 'error',
      totalCommentsFetched: 0,
      totalRepliesFetched: 0,
      comments: [],
      error: 'An unexpected internal server error occurred while processing the request.',
    });
  }
});

export default router;
