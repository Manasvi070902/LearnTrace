# LearnTrace

AI-powered learning observability platform for educational YouTube content.

## Project Structure

```text
/LearnTrace
├── frontend/     # React + TypeScript + Vite frontend app
├── backend/      # Node.js + Express + TypeScript backend API
├── docs/         # Architecture & project documentation
├── .env.example  # Environment variables placeholder
├── .gitignore    # Source control ignores
└── README.md     # Setup and usage guide
```

## Getting Started

### Prerequisites

- Node.js 22 or higher (the current development runtime is Node 26)
- npm
- A Google Cloud project with BigQuery enabled (for persistence)
- Google Cloud CLI (for local ADC authentication)

### 1. Backend Setup & Local Execution

Navigate to the `backend` directory, install dependencies, and start the development server:

```bash
cd backend
npm install
npm run dev
```

The backend server will run on `http://localhost:3001`.

#### BigQuery configuration

Copy `.env.example` to `.env` and set `YOUTUBE_API_KEY`, `GOOGLE_CLOUD_PROJECT_ID`,
and `BIGQUERY_DATASET`. The dataset must already exist in Google Cloud. Set
`BIGQUERY_LOCATION` to the dataset location, such as `US` or `asia-south1`.

Authenticate local development with Application Default Credentials:

```bash
gcloud auth application-default login
```

On startup, LearnTrace verifies the `videos`, `comments`, `comment_analysis`, and `analysis_runs` tables in the configured
dataset and creates either table when it is missing. BigQuery initialization failures
are logged without preventing YouTube analysis from starting.

#### Learning-signal analysis and coverage expansion

Set `GEMINI_API_KEY` in the backend environment. The key is read only by the server;
it is never sent to the frontend. The data inspection view's **Analyze Learning
Signals** action expands analysis to `GEMINI_TARGET_ANALYZED_CONVERSATIONS` total
cached conversations (default `200`). It selects only the remaining unanalyzed
comments, in deterministic diverse batches controlled by `GEMINI_BATCH_SIZE`
(default `50`). Internal request pacing and daily limits are controlled by
`GEMINI_MAX_REQUESTS_PER_MINUTE` and `GEMINI_MAX_REQUESTS_PER_DAY`. Results are
validated, versioned as prompt `v1`, and stored in `comment_analysis`; existing
rows are not re-sent to Gemini. Run metadata is stored in `analysis_runs`.

#### Manual coverage test

Real coverage expansion consumes Gemini API requests. Confirm `GEMINI_API_KEY`,
`GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`, and BigQuery credentials are configured,
then confirm the current count in `comment_analysis`. Set the following in
`backend/.env` before starting the app:

```env
GEMINI_TARGET_ANALYZED_CONVERSATIONS=200
```

Start the backend and frontend. Open an existing analyzed video and click
**Analyze More Conversations**. Review the backend's pre-flight summary, then
allow the run to proceed. Confirm the cached analysis total reaches approximately
200, open **Build Confusion Map**, inspect any concepts with sufficient evidence,
open a concept, and use **View Evidence** to confirm the displayed comments came
from BigQuery.

#### Phase 5.2 manual recomputation

To apply the learning-friction eligibility refinement to existing cached analyses,
do **not** click **Analyze More Conversations**. Rebuild and restart the backend,
then open the existing video and click **Build Confusion Map**. This recomputes the
map from cached `comment_analysis` rows. This action performs **zero new Gemini
classification calls**. With the existing 200-comment dataset, it should also make
**zero embedding calls** because canonical-question embeddings are already cached.
The primary map should contain only conceptual learning signals; tooling errors,
playlist/course coverage, interview-syllabus questions, links, and learning-path
navigation must not appear or affect Learning Friction. Confirm Concept Detail and
**View Evidence** show only the conceptual source comments for a primary-map concept.

Inspect results with:

```sql
SELECT *
FROM `PROJECT_ID.learntrace.comment_analysis`
WHERE video_id = 'VIDEO_ID' AND prompt_version = 'v1'
ORDER BY analyzed_at;
```

#### Health Check Endpoint

Verify the backend is functioning:

```bash
curl http://localhost:3001/api/health
# Response: {"status":"ok"}
```

### 2. Frontend Setup & Local Execution

In a separate terminal window, navigate to the `frontend` directory, install dependencies, and start Vite:

```bash
cd frontend
npm install
npm run dev
```

Open your browser at `http://localhost:5173`.

### Verify persisted data

After analyzing a video, use **Verify BigQuery** in the data inspection view. The
backend endpoint `GET /api/data/video/:videoId/stats` reports the stored video,
top-level comment, reply, and total record counts.

Seven ready-to-run queries are in [`database/queries/verification.sql`](database/queries/verification.sql).
Replace the example project, dataset, and video ID parameters before running them in
the BigQuery console. Re-analyzing a video uses `MERGE` keyed by `video_id` and
`comment_id`, so repeated analyses update existing records instead of creating duplicates.

### 3. Building for Production

To build both projects:

```bash
# Build Frontend
cd frontend
npm run build

# Build Backend
cd ../backend
npm run build
```
