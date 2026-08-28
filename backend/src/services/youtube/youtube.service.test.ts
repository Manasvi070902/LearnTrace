import axios from 'axios';
import { analyzeYouTubeVideo, fetchVideoMetadata, fetchCommentThreads } from './youtube.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YouTube Service', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    mockedAxios.get.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('returns error when invalid YouTube URL is provided', async () => {
    const result = await analyzeYouTubeVideo('https://not-youtube.com/something');
    expect(result.status).toBe('error');
    expect(result.error).toContain('Invalid YouTube video URL');
  });

  test('returns error when YOUTUBE_API_KEY is not set', async () => {
    delete process.env.YOUTUBE_API_KEY;
    const result = await analyzeYouTubeVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result.status).toBe('error');
    expect(result.error).toContain('YouTube API Key is missing');
  });

  test('fetchVideoMetadata parses video info correctly', async () => {
    const mockVideoResponse = {
      data: {
        items: [
          {
            id: 'dQw4w9WgXcQ',
            snippet: {
              title: 'Test Educational Video',
              channelId: 'UC12345',
              channelTitle: 'Learn Channel',
              publishedAt: '2023-01-01T00:00:00Z',
              thumbnails: {
                high: { url: 'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg' },
              },
            },
            contentDetails: { duration: 'PT10M15S' },
            statistics: { viewCount: '10500', likeCount: '500' },
          },
        ],
      },
    };

    mockedAxios.get.mockResolvedValueOnce(mockVideoResponse);

    const video = await fetchVideoMetadata('dQw4w9WgXcQ', 'fake_api_key');
    expect(video.videoId).toBe('dQw4w9WgXcQ');
    expect(video.title).toBe('Test Educational Video');
    expect(video.channelTitle).toBe('Learn Channel');
    expect(video.duration).toBe('PT10M15S');
    expect(video.viewCount).toBe('10500');
  });

  test('fetchCommentThreads normalizes top level comments and replies', async () => {
    const mockCommentsResponse = {
      data: {
        items: [
          {
            id: 'thread_1',
            snippet: {
              videoId: 'dQw4w9WgXcQ',
              totalReplyCount: 1,
              topLevelComment: {
                id: 'comment_1',
                snippet: {
                  authorDisplayName: 'Student A',
                  textDisplay: 'Great video on algorithms!',
                  likeCount: 5,
                  publishedAt: '2023-01-02T10:00:00Z',
                  updatedAt: '2023-01-02T10:00:00Z',
                },
              },
            },
            replies: {
              comments: [
                {
                  id: 'reply_1',
                  snippet: {
                    parentId: 'thread_1',
                    authorDisplayName: 'Instructor B',
                    textDisplay: 'Thanks! Glad it helped.',
                    likeCount: 2,
                    publishedAt: '2023-01-02T11:00:00Z',
                    updatedAt: '2023-01-02T11:00:00Z',
                  },
                },
              ],
            },
          },
        ],
      },
    };

    mockedAxios.get.mockResolvedValueOnce(mockCommentsResponse);

    const result = await fetchCommentThreads('dQw4w9WgXcQ', 'fake_api_key', 10);
    expect(result.totalCommentsFetched).toBe(1);
    expect(result.totalRepliesFetched).toBe(1);
    expect(result.commentsDisabled).toBe(false);
    expect(result.comments[0].authorDisplayName).toBe('Student A');
    expect(result.comments[0].replies[0].authorDisplayName).toBe('Instructor B');
  });

  test('fetchCommentThreads paginates replies beyond the first page', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'thread_1',
              snippet: {
                videoId: 'dQw4w9WgXcQ',
                totalReplyCount: 2,
                topLevelComment: {
                  id: 'comment_1',
                  snippet: {
                    authorDisplayName: 'Student A',
                    textDisplay: 'Question',
                    textOriginal: 'Question',
                    likeCount: 1,
                    publishedAt: '2023-01-02T10:00:00Z',
                    updatedAt: '2023-01-02T10:00:00Z',
                  },
                },
              },
              replies: {
                comments: [
                  {
                    id: 'reply_1',
                    snippet: {
                      parentId: 'thread_1',
                      authorDisplayName: 'Instructor B',
                      textDisplay: 'First reply',
                      textOriginal: 'First reply',
                      likeCount: 1,
                      publishedAt: '2023-01-02T11:00:00Z',
                      updatedAt: '2023-01-02T11:00:00Z',
                    },
                  },
                ],
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'reply_1',
              snippet: {
                parentId: 'thread_1',
                authorDisplayName: 'Instructor B',
                textDisplay: 'First reply',
                textOriginal: 'First reply',
                likeCount: 1,
                publishedAt: '2023-01-02T11:00:00Z',
                updatedAt: '2023-01-02T11:00:00Z',
              },
            },
          ],
          nextPageToken: 'reply-page-2',
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'reply_2',
              snippet: {
                parentId: 'thread_1',
                authorDisplayName: 'Student A',
                textDisplay: 'Second reply',
                textOriginal: 'Second reply',
                likeCount: 0,
                publishedAt: '2023-01-02T12:00:00Z',
                updatedAt: '2023-01-02T12:00:00Z',
              },
            },
          ],
        },
      });

    const result = await fetchCommentThreads('dQw4w9WgXcQ', 'fake_api_key', 10);

    expect(result.totalCommentsFetched).toBe(1);
    expect(result.totalRepliesFetched).toBe(2);
    expect(result.comments[0].replies.map((reply) => reply.id)).toEqual(['reply_1', 'reply_2']);
    const replyRequest = mockedAxios.get.mock.calls[1]?.[1] as { params: { parentId: string } };
    expect(mockedAxios.get.mock.calls[1]?.[0]).toContain('/comments');
    expect(replyRequest.params.parentId).toBe('comment_1');
  });

  test('fetchCommentThreads handles comments disabled error gracefully', async () => {
    const disabledError = {
      response: {
        status: 403,
        data: {
          error: {
            code: 403,
            message: 'The video has disabled comments.',
            errors: [{ reason: 'commentsDisabled' }],
          },
        },
      },
    };

    mockedAxios.get.mockRejectedValueOnce(disabledError);

    const result = await fetchCommentThreads('dQw4w9WgXcQ', 'fake_api_key', 10);
    expect(result.commentsDisabled).toBe(true);
    expect(result.totalCommentsFetched).toBe(0);
    expect(result.comments.length).toBe(0);
  });
});
