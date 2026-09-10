# LearnTrace

LearnTrace turns YouTube comments into clear, evidence-backed audience insights for educational creators. Paste a public YouTube video or channel link to discover learner questions, content requests, feedback, teaching strengths, and follow-ups that need a response.

## Features

- 🔗 **Video and channel analysis** — Paste a public YouTube video or channel link and explore its audience in one place.
- 💬 **Comment coverage you can trust** — Fetches top-level comments and replies, then shows how much of YouTube’s reported discussion was available.
- 🧠 **Learner questions** — Finds questions, confusions, code/setup issues, and learning-path guidance raised by viewers.
- 💡 **Content requests** — Surfaces topics, follow-ups, translations, and future videos learners are asking for.
- 🗣️ **Video feedback** — Separates actionable suggestions about the lesson, presentation, examples, or video experience.
- ❤️ **What worked** — Highlights teaching approaches and explanations learners responded to positively.
- 🔎 **Evidence-first insights** — Every group links back to the original comments, so creators can verify the finding before acting on it.
- 🧩 **Smart topic grouping** — Combines similar learner questions into clear creator-facing themes while keeping strict source clusters as an audit trail.
- 🔥 **Priority follow-ups** — Ranks recurring and actionable patterns, with suggested response types such as clarify for everyone or answer individually.
- ✨ **AI interpretation and reply drafts** — Generates deeper interpretation only when there is enough recurring evidence, plus creator-ready response drafts.
- ✅ **Reply-aware workflow** — Detects creator replies, checks whether they addressed the learner, and removes resolved conversations from the action queue.
- 🗂️ **Channel intelligence** — Compares analyzed videos, reveals recurring themes across a channel, and provides a channel-wide action queue.
- ⏰ **Follow-up management** — Snooze, restore, or mark items resolved without losing their underlying evidence.

## Stack

- Frontend: React, TypeScript, Vite
- Backend: Node.js, Express, TypeScript
- Data: YouTube Data API v3 and Google BigQuery
- AI: Vertex AI with Gemini 3.6 Flash and Gemini Embedding

## Requirements

- Node.js 22 or later
- npm
- A Google Cloud project with BigQuery and Vertex AI enabled
- A YouTube Data API v3 key
- Google Cloud CLI for local Application Default Credentials

## Set up locally

### 1. Configure the backend

Copy the safe environment template and fill in your project values:

```bash
cp .env.example backend/.env
```

The important values are:

```env
YOUTUBE_API_KEY=your_youtube_api_key
GOOGLE_CLOUD_PROJECT_ID=your-gcp-project-id
BIGQUERY_DATASET=learntrace
BIGQUERY_LOCATION=US

GEMINI_PROVIDER=vertex-ai
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=global
GEMINI_MODEL=gemini-3.6-flash
GEMINI_EMBEDDING_MODEL=gemini-embedding-001
GEMINI_MAX_REQUESTS_PER_DAY=500
```

Create the BigQuery dataset before starting the application. The backend creates its required tables automatically. Keep API keys and service-account files out of source control.

Authenticate your local machine with Google Cloud:

```bash
gcloud auth application-default login
```

Then start the API:

```bash
cd backend
npm install
npm run dev
```

The API runs at `http://localhost:3001`.

### 2. Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Use LearnTrace

1. Paste a public YouTube video or channel URL.
2. Let LearnTrace fetch the available comments and replies.
3. Choose **Analyze comments**. Later, **Analyze more comments** only selects comments that have not already been analyzed.
4. Explore the audience categories and open any insight to see its evidence.
5. Use the suggested response type, optional AI interpretation, and draft tools to decide what to do next.
6. At channel level, compare analyzed videos, investigate recurring themes, and manage the channel action queue.

## Data and AI behavior

- Comments, analysis results, embeddings, and workflow status are stored in BigQuery.
- Re-running analysis updates existing records rather than intentionally duplicating comments.
- Rebuilding audience insights regroups stored data; it does not reclassify comments.
- Semantic grouping uses stored embeddings, while original strict clusters remain available as the audit trail.
- AI request limits in `backend/.env` are application safeguards. Set them to values that match your Vertex AI quota.
- New creator replies are assessed once and cached so resolved conversations do not remain in the action queue.

## Useful checks

Confirm the API is running:

```bash
curl http://localhost:3001/api/health
```

Build the projects before deployment:

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

Run the backend tests:

```bash
cd backend
npm test -- --runInBand
```

For BigQuery data checks, see [`database/queries/verification.sql`](database/queries/verification.sql). Replace its example project, dataset, and video IDs before running a query.

## Project layout

```text
LearnTrace/
├── frontend/   React creator experience
├── backend/    API, YouTube ingestion, AI, and BigQuery services
├── database/   Verification queries
└── .env.example
```

## Deployment

LearnTrace is deployed as one combined **Google Cloud Run** service, so the app and its API are available from a single URL. The service uses a service account with access to BigQuery and Vertex AI, and its runtime configuration contains the backend environment variables shown above.

For a new deployment, keep credentials server-side: use the Cloud Run service account rather than committing a service-account JSON file.
