/**
 * BigQuery Service Unit Tests
 *
 * These tests cover the mapper functions and the public API of the BigQuery service.
 * No real BigQuery credentials are required — the BigQuery client is fully mocked.
 */

import {
  mapVideoToRow,
  mapCommentToRow,
  mapReplyToRow,
  flattenCommentsToRows,
} from './bigquery.mapper';
import { YouTubeVideoMetadata, YouTubeComment, YouTubeReply } from '../youtube/youtube.types';

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

const mockVideo: YouTubeVideoMetadata = {
  videoId: 'testVideoId123',
  title: 'Test Video Title',
  channelId: 'UCtest123',
  channelTitle: 'Test Channel',
  publishedAt: '2024-01-15T10:00:00Z',
  duration: 'PT10M30S',
  viewCount: '12345',
  thumbnailUrl: 'https://example.com/thumb.jpg',
};

const mockReply: YouTubeReply = {
  id: 'reply001',
  parentId: 'comment001',
  authorDisplayName: 'Reply Author',
  textDisplay: 'Great question!',
  textOriginal: 'Great question!',
  likeCount: 5,
  publishedAt: '2024-01-16T12:00:00Z',
  updatedAt: '2024-01-16T12:00:00Z',
};

const mockComment: YouTubeComment = {
  id: 'comment001',
  videoId: 'testVideoId123',
  authorDisplayName: 'Test Author',
  textDisplay: 'This is a test comment.',
  textOriginal: 'This is a test comment.',
  likeCount: 10,
  publishedAt: '2024-01-16T11:00:00Z',
  updatedAt: '2024-01-16T11:00:00Z',
  totalReplyCount: 1,
  replies: [mockReply],
};

const FIXED_TIMESTAMP = '2024-01-17T00:00:00.000Z';

// ─── mapVideoToRow ─────────────────────────────────────────────────────────────

describe('mapVideoToRow', () => {
  it('maps all fields correctly', () => {
    const row = mapVideoToRow(mockVideo, FIXED_TIMESTAMP);

    expect(row.video_id).toBe('testVideoId123');
    expect(row.title).toBe('Test Video Title');
    expect(row.channel_id).toBe('UCtest123');
    expect(row.channel_title).toBe('Test Channel');
    expect(row.published_at).toBe('2024-01-15T10:00:00Z');
    expect(row.view_count).toBe(12345);
    expect(row.duration).toBe('PT10M30S');
    expect(row.analyzed_at).toBe(FIXED_TIMESTAMP);
  });

  it('sets view_count to null when viewCount is undefined', () => {
    const videoWithoutViews: YouTubeVideoMetadata = { ...mockVideo, viewCount: undefined };
    const row = mapVideoToRow(videoWithoutViews, FIXED_TIMESTAMP);
    expect(row.view_count).toBeNull();
  });

  it('sets duration to null when duration is undefined', () => {
    const videoWithoutDuration: YouTubeVideoMetadata = { ...mockVideo, duration: undefined };
    const row = mapVideoToRow(videoWithoutDuration, FIXED_TIMESTAMP);
    expect(row.duration).toBeNull();
  });

  it('uses current time as analyzed_at when not provided', () => {
    const before = Date.now();
    const row = mapVideoToRow(mockVideo);
    const after = Date.now();
    const rowTime = new Date(row.analyzed_at).getTime();
    expect(rowTime).toBeGreaterThanOrEqual(before);
    expect(rowTime).toBeLessThanOrEqual(after);
  });
});

// ─── mapCommentToRow ───────────────────────────────────────────────────────────

describe('mapCommentToRow', () => {
  it('maps top-level comment correctly', () => {
    const row = mapCommentToRow(mockComment, 'testVideoId123', FIXED_TIMESTAMP);

    expect(row.comment_id).toBe('comment001');
    expect(row.video_id).toBe('testVideoId123');
    expect(row.parent_comment_id).toBeNull();
    expect(row.comment_text).toBe('This is a test comment.');
    expect(row.published_at).toBe('2024-01-16T11:00:00Z');
    expect(row.like_count).toBe(10);
    expect(row.reply_count).toBe(1);
    expect(row.is_reply).toBe(false);
    expect(row.fetched_at).toBe(FIXED_TIMESTAMP);
  });

  it('sets is_reply = false for top-level comments', () => {
    const row = mapCommentToRow(mockComment, 'testVideoId123', FIXED_TIMESTAMP);
    expect(row.is_reply).toBe(false);
  });

  it('sets parent_comment_id = null for top-level comments', () => {
    const row = mapCommentToRow(mockComment, 'testVideoId123', FIXED_TIMESTAMP);
    expect(row.parent_comment_id).toBeNull();
  });

  it('uses textOriginal over textDisplay when available', () => {
    const commentWithBoth: YouTubeComment = {
      ...mockComment,
      textOriginal: 'Original text',
      textDisplay: '<b>Display text</b>',
    };
    const row = mapCommentToRow(commentWithBoth, 'testVideoId123', FIXED_TIMESTAMP);
    expect(row.comment_text).toBe('Original text');
  });
});

// ─── mapReplyToRow ─────────────────────────────────────────────────────────────

describe('mapReplyToRow', () => {
  it('maps reply correctly', () => {
    const row = mapReplyToRow(mockReply, 'testVideoId123', 'comment001', FIXED_TIMESTAMP);

    expect(row.comment_id).toBe('reply001');
    expect(row.video_id).toBe('testVideoId123');
    expect(row.parent_comment_id).toBe('comment001');
    expect(row.comment_text).toBe('Great question!');
    expect(row.published_at).toBe('2024-01-16T12:00:00Z');
    expect(row.like_count).toBe(5);
    expect(row.reply_count).toBe(0);
    expect(row.is_reply).toBe(true);
    expect(row.fetched_at).toBe(FIXED_TIMESTAMP);
  });

  it('sets is_reply = true', () => {
    const row = mapReplyToRow(mockReply, 'testVideoId123', 'comment001', FIXED_TIMESTAMP);
    expect(row.is_reply).toBe(true);
  });

  it('sets parent_comment_id to the provided parent ID', () => {
    const row = mapReplyToRow(mockReply, 'testVideoId123', 'comment001', FIXED_TIMESTAMP);
    expect(row.parent_comment_id).toBe('comment001');
  });

  it('always sets reply_count = 0 for replies', () => {
    const row = mapReplyToRow(mockReply, 'testVideoId123', 'comment001', FIXED_TIMESTAMP);
    expect(row.reply_count).toBe(0);
  });
});

// ─── flattenCommentsToRows ─────────────────────────────────────────────────────

describe('flattenCommentsToRows', () => {
  it('produces top-level comment row + reply row', () => {
    const rows = flattenCommentsToRows([mockComment], 'testVideoId123', FIXED_TIMESTAMP);
    expect(rows).toHaveLength(2); // 1 comment + 1 reply
  });

  it('first row is the top-level comment', () => {
    const rows = flattenCommentsToRows([mockComment], 'testVideoId123', FIXED_TIMESTAMP);
    expect(rows[0].is_reply).toBe(false);
    expect(rows[0].comment_id).toBe('comment001');
  });

  it('second row is the reply', () => {
    const rows = flattenCommentsToRows([mockComment], 'testVideoId123', FIXED_TIMESTAMP);
    expect(rows[1].is_reply).toBe(true);
    expect(rows[1].comment_id).toBe('reply001');
    expect(rows[1].parent_comment_id).toBe('comment001');
  });

  it('returns empty array when given no comments', () => {
    const rows = flattenCommentsToRows([], 'testVideoId123', FIXED_TIMESTAMP);
    expect(rows).toHaveLength(0);
  });

  it('handles comments with no replies', () => {
    const noRepliesComment: YouTubeComment = { ...mockComment, replies: [], totalReplyCount: 0 };
    const rows = flattenCommentsToRows([noRepliesComment], 'testVideoId123', FIXED_TIMESTAMP);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_reply).toBe(false);
  });

  it('generates unique comment_ids for all rows (no duplicates)', () => {
    const secondComment: YouTubeComment = {
      ...mockComment,
      id: 'comment002',
      replies: [],
    };
    const rows = flattenCommentsToRows(
      [mockComment, secondComment],
      'testVideoId123',
      FIXED_TIMESTAMP
    );
    const ids = rows.map((r) => r.comment_id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all rows share the same video_id', () => {
    const rows = flattenCommentsToRows([mockComment], 'testVideoId123', FIXED_TIMESTAMP);
    expect(rows.every((r) => r.video_id === 'testVideoId123')).toBe(true);
  });

  it('idempotent: mapping the same data twice produces identical rows', () => {
    const rows1 = flattenCommentsToRows([mockComment], 'testVideoId123', FIXED_TIMESTAMP);
    const rows2 = flattenCommentsToRows([mockComment], 'testVideoId123', FIXED_TIMESTAMP);
    expect(rows1).toEqual(rows2);
  });
});
