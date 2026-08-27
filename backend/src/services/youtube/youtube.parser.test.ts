import { extractVideoId } from './youtube.parser';

describe('YouTube URL Parser - extractVideoId', () => {
  test('extracts video ID from standard youtube.com watch URL', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts video ID from watch URL with extra query parameters', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s&feature=shared')).toBe('dQw4w9WgXcQ');
  });

  test('extracts video ID from mobile YouTube URL', () => {
    expect(extractVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts video ID from YouTube Music URL', () => {
    expect(extractVideoId('https://music.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts video ID from shortened youtu.be URL', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=45')).toBe('dQw4w9WgXcQ');
  });

  test('extracts video ID from embed URL', () => {
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts video ID from shorts URL', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts video ID from v/ URL', () => {
    expect(extractVideoId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('accepts raw 11-character video ID', () => {
    expect(extractVideoId('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('handles URLs entered without http:// or https://', () => {
    expect(extractVideoId('www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('returns null for invalid YouTube URLs or strings', () => {
    expect(extractVideoId('https://google.com')).toBeNull();
    expect(extractVideoId('https://youtube.com/about')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/watch?v=short')).toBeNull(); // Less than 11 chars
    expect(extractVideoId('invalid_string')).toBeNull();
    expect(extractVideoId('')).toBeNull();
    expect(extractVideoId(null as any)).toBeNull();
    expect(extractVideoId(undefined as any)).toBeNull();
  });
});
