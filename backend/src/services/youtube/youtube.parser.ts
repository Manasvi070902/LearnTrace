/**
 * YouTube URL Parser and Video ID Extractor
 */

// YouTube Video IDs are 11 characters long and consist of alphanumeric characters, hyphens, and underscores.
const YOUTUBE_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extracts and validates a 11-character YouTube video ID from various URL formats or direct video ID strings.
 *
 * Supported formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID&t=10s
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - https://music.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - Raw 11-character video ID string (e.g. "dQw4w9WgXcQ")
 *
 * @param input The URL or string provided by the user
 * @returns 11-character video ID string if valid, or null if invalid
 */
export function extractVideoId(input: string): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();

  // Direct match for raw 11-char video ID
  if (YOUTUBE_VIDEO_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  try {
    // Add protocol if user typed www.youtube.com without http(s)://
    let urlString = trimmed;
    if (!/^https?:\/\//i.test(urlString)) {
      urlString = 'https://' + urlString;
    }

    const parsedUrl = new URL(urlString);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');

    if (hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'music.youtube.com') {
      // 1. Standard watch URL: /watch?v=VIDEO_ID
      if (parsedUrl.pathname === '/watch') {
        const v = parsedUrl.searchParams.get('v');
        if (v && YOUTUBE_VIDEO_ID_REGEX.test(v)) {
          return v;
        }
      }

      // 2. Path-based URLs: /embed/VIDEO_ID, /v/VIDEO_ID, /shorts/VIDEO_ID
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      if (pathSegments.length >= 2) {
        const prefix = pathSegments[0].toLowerCase();
        if (prefix === 'embed' || prefix === 'v' || prefix === 'shorts') {
          const videoId = pathSegments[1];
          if (YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
            return videoId;
          }
        }
      }
    } else if (hostname === 'youtu.be') {
      // Shortened URL: https://youtu.be/VIDEO_ID
      const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
      if (pathSegments.length >= 1) {
        const videoId = pathSegments[0];
        if (YOUTUBE_VIDEO_ID_REGEX.test(videoId)) {
          return videoId;
        }
      }
    }
  } catch (err) {
    // Return null if URL parsing fails
    return null;
  }

  return null;
}
