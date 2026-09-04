import React, { useState } from 'react';
import { analyzeVideo, friendlyRequestError, getCachedVideoAnalysis } from './services/api';
import { AnalyzeVideoResponse } from './types';
import { DataInspectionView } from './components/DataInspectionView';
import { RequestError, RequestErrorDetails } from './components/RequestError';

const DEMO_VIDEO_ID = 'PFDu9oVAE-g';
const DEMO_THUMBNAIL = `https://i.ytimg.com/vi/${DEMO_VIDEO_ID}/hqdefault.jpg`;

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestErrorDetails | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeVideoResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError({ title: 'Enter a valid public YouTube video URL.', message: 'Check the link and try again.' });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeVideo(url.trim());
      if (response.status === 'error') {
        setError(friendlyRequestError(undefined, response.error));
        setAnalysisResult(null);
      } else {
        setAnalysisResult(response);
      }
    } catch (err: any) {
      setError(friendlyRequestError());
    } finally {
      setLoading(false);
    }
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      setAnalysisResult(await getCachedVideoAnalysis(DEMO_VIDEO_ID));
    } catch {
      setError({ title: 'Demo analysis is temporarily unavailable.', message: 'You can still analyze a public educational YouTube video above.' });
    } finally {
      setDemoLoading(false);
    }
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setError(null);
    setUrl('');
  };

  return (
    <div className="app-container">
      {/* Background Ambient Code Matrix Layer */}
      <div className="background-matrix-code" aria-hidden="true">
        {`const trace = await LearnTrace.analyze(url);
if (trace.gapDetected) { renderHeatmap(); updateMetrics(); }
const observer = new LearningObservability();
observer.observe(gapAnalysis);
if (trace.gapDetected) { renderHeatmap(); updateMetrics(); }
const trace = await LearnTrace.analyze(url);
if (trace.gapDetected) { renderHeatmap(); updateMetrics(); }`}
      </div>

      <header className="header">
        <div className="brand-logo" onClick={handleReset} style={{ cursor: 'pointer' }}>
          LearnTrace
        </div>
        {analysisResult
          ? <button type="button" className="header-back-button" onClick={handleReset}>&larr; Back to videos</button>
          : <span className="subtitle-tag">Learning Observability for Educational Content</span>}
      </header>

      <main className="main-content">
        {analysisResult ? (
          <DataInspectionView data={analysisResult} />
        ) : (
          <div className="hero-section">
            <p className="tagline">AI-powered learning observability for educational content.</p>
            <h1 className="main-heading">Where is learning breaking down?</h1>
            <p className="hero-description">
              Analyze learner conversations to uncover recurring questions, learning friction, and concepts that need clearer explanation.
            </p>

            <form onSubmit={handleSubmit} className="input-form">
              <input
                type="text"
                id="youtube-url-input"
                className="url-input"
                placeholder="Paste a YouTube video URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
              />
              <button
                type="submit"
                id="analyze-btn"
                className="analyze-button"
                disabled={loading}
              >
                {loading ? (
                  <span className="button-spinner-wrapper">
                    <span className="spinner"></span>
                    Analyzing...
                  </span>
                ) : (
                  'Analyze'
                )}
              </button>
            </form>

            {error && <RequestError error={error} onRetry={url.trim() ? () => void handleSubmit({ preventDefault: () => undefined } as React.FormEvent) : undefined} />}

            <section className="demo-section" aria-labelledby="demo-heading">
              <h2 id="demo-heading">Try a pre-tested example</h2>
              <p>Explore LearnTrace instantly with a pre-analyzed educational video.</p>
              <button type="button" className="demo-card" onClick={() => void handleDemo()} disabled={demoLoading}>
                <img src={DEMO_THUMBNAIL} alt="Eigenvectors and eigenvalues video thumbnail" />
                <span className="demo-card-copy"><strong>Eigenvectors and eigenvalues</strong><em>3Blue1Brown</em><small>Explore recurring learner questions, Learning Friction and creator actions.</small></span>
                <span className="demo-card-cta">{demoLoading ? 'Loading…' : 'View analysis →'}</span>
              </button>
              <small className="demo-caption">Uses cached analysis for a faster shared demo.</small>
            </section>

            <div className="features-badges">
              <span className="feature-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                Learner Question Discovery
              </span>
              <span className="feature-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Learning Friction Mapping
              </span>
              <span className="feature-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                Evidence-backed AI Insights
              </span>
              <span className="feature-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Educational Action Recommendations
              </span>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} LearnTrace. All rights reserved.</p>
      </footer>

    </div>
  );
}
