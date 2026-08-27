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
            <p className="tagline">
              AI that reveals the gap between what you teach and what your audience understands.
            </p>
            <h1 className="main-heading">Where is learning breaking down?</h1>

            <form onSubmit={handleSubmit} className="input-form">
              <input
                type="text"
                id="youtube-url-input"
                className="url-input"
                placeholder="Paste YouTube video URL (e.g. https://www.youtube.com/watch?v=...)"
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
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                View-by-view analysis
              </span>
              <span className="feature-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="18" cy="18" r="3"></circle>
                  <line x1="8.5" y1="8.5" x2="15.5" y2="15.5"></line>
                  <circle cx="18" cy="6" r="2"></circle>
                </svg>
                Concept-by-concept alignment
              </span>
              <span className="feature-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
                </svg>
                Retention Heatmap
              </span>
              <span className="feature-badge">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14"></line>
                  <line x1="4" y1="10" x2="4" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="12"></line>
                  <line x1="12" y1="8" x2="12" y2="3"></line>
                  <line x1="20" y1="21" x2="20" y2="16"></line>
                  <line x1="20" y1="12" x2="20" y2="3"></line>
                  <line x1="1" y1="14" x2="7" y2="14"></line>
                  <line x1="9" y1="8" x2="15" y2="8"></line>
                  <line x1="17" y1="16" x2="23" y2="16"></line>
                </svg>
                Compact analysis
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
