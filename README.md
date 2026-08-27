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
- Node.js (v18 or higher recommended)
- npm

### 1. Backend Setup & Local Execution

Navigate to the `backend` directory, install dependencies, and start the development server:

```bash
cd backend
npm install
npm run dev
```

The backend server will run on `http://localhost:3001`.

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