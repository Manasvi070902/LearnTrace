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

#### Learning-signal analysis

Set `GEMINI_API_KEY` in the backend environment. The key is read only by the server;
it is never sent to the frontend. The data inspection view's **Analyze Learning
Signals** action sends up to `GEMINI_MAX_COMMENTS_PER_ANALYSIS` comments (default
`50`) to Gemini in batches controlled by `GEMINI_BATCH_SIZE` (default `50`), with
payload-size splitting only when required. Internal request pacing and daily limits
are controlled by `GEMINI_MAX_REQUESTS_PER_MINUTE` and `GEMINI_MAX_REQUESTS_PER_DAY`.
Results are validated, versioned as prompt `v1`, and stored in the BigQuery
`comment_analysis` table. Repeating the action reuses rows already analyzed with
the same `comment_id`, prompt version, and model name. Run metadata is stored in
`analysis_runs`; development usage is available at `GET /api/analyze/usage`.

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
