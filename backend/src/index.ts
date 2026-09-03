import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import analyzeRouter from './routes/analyze';
import dataRouter from './routes/data';
import frictionRouter from './routes/friction';
import { initializeBigQueryTables } from './services/bigquery/bigquery.init';
import learningSignalsRouter from './routes/learning-signals';

dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Analyze Endpoints
app.use('/api/analyze', analyzeRouter);
app.use('/api/analyze', learningSignalsRouter);
app.use('/api/analyze', frictionRouter);

// Data / Verification Endpoints
app.use('/api/data', dataRouter);

// Serve the built frontend from the project root in both compiled and ts-node
// runtimes, without relying on the process working directory.
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
app.use(express.static(frontendDistPath));

// Let the React app handle client-side routes, while preserving normal API
// routing and errors for every /api request.
app.use((req: Request, res: Response, next) => {
  if (req.method !== 'GET' || req.path === '/api' || req.path.startsWith('/api/')) {
    return next();
  }

  res.sendFile(path.join(frontendDistPath, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// ── BigQuery Table Initialization ─────────────────────────────────────────────
// Runs once on startup. Creates tables if they don't exist yet (idempotent).
// If BigQuery is unavailable, logs a warning but does NOT crash the server —
// YouTube analysis will still work; BigQuery persistence will fail gracefully.
initializeBigQueryTables()
  .then(() => {
    console.log('[BigQuery] Tables ready.');
  })
  .catch((err: Error) => {
    console.warn(
      '[BigQuery] Table initialization failed — BigQuery persistence will be unavailable.\n' +
        `  Reason: ${err.message}\n` +
        '  Make sure GOOGLE_CLOUD_PROJECT_ID and BIGQUERY_DATASET are set, and run:\n' +
        '  gcloud auth application-default login'
    );
  });

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`[LearnTrace Server] Running on port ${PORT}`);
});
