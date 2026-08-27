import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyzeRouter from './routes/analyze';
import dataRouter from './routes/data';
import { initializeBigQueryTables } from './services/bigquery/bigquery.init';

dotenv.config();

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

// Data / Verification Endpoints
app.use('/api/data', dataRouter);

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

app.listen(PORT, () => {
  console.log(`[LearnTrace Server] Running on http://localhost:${PORT}`);
});
