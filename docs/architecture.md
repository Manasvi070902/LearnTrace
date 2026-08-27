# LearnTrace Architecture Overview

LearnTrace is an AI-powered learning observability platform designed for educational YouTube content. It helps educators identify where viewer understanding breaks down.

## High-Level System Architecture

```text
┌─────────────────────────┐         ┌─────────────────────────┐
│                        │         │                         │
│   Frontend (React/Vite)│  HTTP   │   Backend (Express/TS)  │
│   - Landing Page       ├────────►│   - REST API            │
│   - YouTube Input UI   │         │   - GET /api/health     │
│                        │         │                         │
└─────────────────────────┘         └─────────────────────────┘
```

## Component Breakdown

### 1. Frontend (`/frontend`)
- **Framework**: React 18 with TypeScript and Vite
- **Styling**: Minimal, clean Vanilla CSS with a light color palette
- **Purpose**: Interactive UI for content creators to submit YouTube URLs and view observational analytics.

### 2. Backend (`/backend`)
- **Framework**: Node.js + Express with TypeScript
- **Purpose**: API layer to handle analysis requests, process content, and interface with future AI services.
- **Endpoints**:
  - `GET /api/health`: Health status endpoint returning `{"status": "ok"}`.

### 3. Future System Roadmap (Planned)
- **YouTube Integration**: Extracting captions and video metadata.
- **AI Processing Engine**: Analyzing educational clarity and audience friction points.
- **Observability Dashboard**: Visualizing learning breakdown metrics for educators.
