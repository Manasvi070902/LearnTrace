-- Set these values before running the queries.
DECLARE project_id STRING DEFAULT 'your-gcp-project-id';
DECLARE dataset_id STRING DEFAULT 'learntrace';
DECLARE video_id STRING DEFAULT 'your-youtube-video-id';

-- 1. Count top-level comments for one video
EXECUTE IMMEDIATE FORMAT('''
  SELECT COUNT(*) AS comments_stored
  FROM `%s.%s.comments`
  WHERE video_id = @video_id AND is_reply = FALSE
''', project_id, dataset_id) USING video_id AS video_id;

-- 2. Count replies for one video
EXECUTE IMMEDIATE FORMAT('''
  SELECT COUNT(*) AS replies_stored
  FROM `%s.%s.comments`
  WHERE video_id = @video_id AND is_reply = TRUE
''', project_id, dataset_id) USING video_id AS video_id;

-- 3. Count all comment records for one video
EXECUTE IMMEDIATE FORMAT('''
  SELECT COUNT(*) AS total_records
  FROM `%s.%s.comments`
  WHERE video_id = @video_id
''', project_id, dataset_id) USING video_id AS video_id;

-- 4. Most-liked comments (including replies)
EXECUTE IMMEDIATE FORMAT('''
  SELECT comment_id, video_id, comment_text, like_count, is_reply
  FROM `%s.%s.comments`
  WHERE video_id = @video_id
  ORDER BY like_count DESC
  LIMIT 20
''', project_id, dataset_id) USING video_id AS video_id;

-- 5. List analyzed videos
EXECUTE IMMEDIATE FORMAT('''
  SELECT video_id, title, channel_title, analyzed_at
  FROM `%s.%s.videos`
  ORDER BY analyzed_at DESC
''', project_id, dataset_id);

-- 6. Detect duplicate comment IDs
EXECUTE IMMEDIATE FORMAT('''
  SELECT comment_id, COUNT(*) AS record_count
  FROM `%s.%s.comments`
  GROUP BY comment_id
  HAVING COUNT(*) > 1
  ORDER BY record_count DESC
''', project_id, dataset_id);

-- 7. Top-level comments vs replies distribution
EXECUTE IMMEDIATE FORMAT('''
  SELECT
    video_id,
    is_reply,
    COUNT(*) AS record_count
  FROM `%s.%s.comments`
  GROUP BY video_id, is_reply
  ORDER BY video_id, is_reply
''', project_id, dataset_id);
