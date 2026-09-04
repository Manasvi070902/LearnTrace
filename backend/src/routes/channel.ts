import { Router, Request, Response } from 'express';
import { getChannelInsights, getChannelOverview } from '../services/bigquery/channel.insights';
import { getChannelVideos, getPublicChannel, resolvePublicChannel } from '../services/youtube/channel.service';

const router = Router();
const sendChannelError = (res: Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : '';
  if (/valid public youtube channel/i.test(message)) return res.status(400).json({ error: 'Enter a valid public YouTube channel URL.' });
  if (/not found/i.test(message)) return res.status(404).json({ error: 'Channel not found' });
  console.error('[Channel API]', error);
  return res.status(503).json({ error: fallback });
};

router.get('/resolve', async (req: Request, res: Response) => {
  try { return res.json(await resolvePublicChannel(String(req.query.url || ''))); }
  catch (error) { return sendChannelError(res, error, "Couldn't load this channel right now."); }
});

router.get('/:channelId', async (req: Request, res: Response) => {
  try { return res.json(await getPublicChannel(String(req.params.channelId))); }
  catch (error) { return sendChannelError(res, error, "Couldn't load this channel right now."); }
});

router.get('/:channelId/videos', async (req: Request, res: Response) => {
  try {
    const channel = await getPublicChannel(String(req.params.channelId));
    const catalog = await getChannelVideos(channel, typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined);
    const [insights, overview] = await Promise.all([
      getChannelInsights(catalog.videos.map((video) => video.videoId)),
      getChannelOverview(channel.channelId),
    ]);
    return res.json({
      ...catalog,
      videos: catalog.videos.map((video) => ({
        ...video,
        insight: insights.videos.get(video.videoId) || {
          videoId: video.videoId, analyzed: false, conversations: 0, learningPatterns: 0, needsResponse: 0,
        },
      })),
      overview: overview.overview,
      concepts: overview.concepts,
    });
  } catch (error) { return sendChannelError(res, error, "Couldn't load the channel's videos."); }
});

export default router;
