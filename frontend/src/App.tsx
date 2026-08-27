import React, { useState } from 'react';

export default function App() {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Non-functional placeholder as per requirements
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="brand-logo">LearnTrace</div>
        <span className="subtitle-tag">Learning Observability for Educational Content</span>
      </header>

      <main className="main-content">
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
              placeholder="Paste YouTube video URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" id="analyze-btn" className="analyze-button">
              Analyze
            </button>
          </form>
        </div>
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} LearnTrace. All rights reserved.</p>
      </footer>
    </div>
  );
}
