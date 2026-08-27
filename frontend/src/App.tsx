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
          </div>
        )}
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} LearnTrace. All rights reserved.</p>
      </footer>
    </div>
  );
}
