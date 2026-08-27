import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyzeRouter from './routes/analyze';

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

app.listen(PORT, () => {
  console.log(`[LearnTrace Server] Running on http://localhost:${PORT}`);
});

