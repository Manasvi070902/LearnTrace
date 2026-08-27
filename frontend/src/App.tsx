import React, { useState } from 'react';
import { analyzeVideo } from './services/api';
import { AnalyzeVideoResponse } from './types';
import { DataInspectionView } from './components/DataInspectionView';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeVideoResponse | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please enter a valid YouTube video URL.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await analyzeVideo(url.trim());
      if (response.status === 'error') {
        setError(response.error || 'Failed to analyze video. Please try again.');
        setAnalysisResult(null);
      } else {
        setAnalysisResult(response);
      }
    } catch (err: any) {
      setError('An unexpected error occurred while processing your request.');
    } finally {
      setLoading(false);
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
        <span className="subtitle-tag">Learning Observability for Educational Content</span>
      </header>

      <main className="main-content">
        {analysisResult ? (
          <DataInspectionView data={analysisResult} onReset={handleReset} />
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

            {error && (
              <div className="error-banner">
                <span className="error-icon">&#9888;</span>
                <span className="error-message">{error}</span>
              </div>
            )}

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

      {/* Decorative Sparkle */}
      <div className="bottom-sparkle" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
        </svg>
      </div>
    </div>
  );
}
