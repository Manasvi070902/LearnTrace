import React, { useEffect, useState } from 'react';
import { analyzeVideo, friendlyRequestError, resolveChannel } from './services/api';
import { AnalyzeVideoResponse } from './types';
import { DataInspectionView } from './components/DataInspectionView';
import { RequestError, RequestErrorDetails } from './components/RequestError';
import { ChannelOverview } from './components/ChannelOverview';
import { BrandMark } from './components/BrandMark';

const DEMO_CHANNEL_URL = 'https://www.youtube.com/@googlecloudtech';
const DEMO_THUMBNAIL = 'https://i.ytimg.com/vi/IeMYQ-qJeK4/hqdefault.jpg';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestErrorDetails | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalyzeVideoResponse | null>(null);
  const [channelId, setChannelId] = useState<string | null>(() => /^\/channel\/(UC[A-Za-z0-9_-]{22})$/.exec(window.location.pathname)?.[1] || null);
  const [fromChannel, setFromChannel] = useState(false);
  const [sourceChannelId, setSourceChannelId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError({ title: 'Please enter a YouTube video or channel URL.', message: 'Check the link and try again.' });
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!isYouTubeUrl(url.trim())) {
        setError({ title: 'Enter a valid YouTube video or channel URL.', message: 'LearnTrace supports public YouTube links only.' });
        return;
      }
      if (!isYouTubeVideoUrl(url.trim())) {
        const channel = await resolveChannel(url.trim());
        setChannelId(channel.channelId);
        window.history.pushState({}, '', `/channel/${channel.channelId}`);
        return;
      }
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

  useEffect(() => {
    const onPopState = () => { setAnalysisResult(null); setChannelId(/^\/channel\/(UC[A-Za-z0-9_-]{22})$/.exec(window.location.pathname)?.[1] || null); };
    window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleDemo = async () => {
    setDemoLoading(true);
    setError(null);
    try {
      const channel = await resolveChannel(DEMO_CHANNEL_URL);
      setChannelId(channel.channelId);
      window.history.pushState({}, '', `/channel/${channel.channelId}`);
    } catch {
      setError({ title: 'Demo channel is temporarily unavailable.', message: 'You can still analyze a public educational YouTube link above.' });
    } finally {
      setDemoLoading(false);
    }
  };

  const handleReset = () => {
    setAnalysisResult(null);
    setChannelId(null);
    setFromChannel(false);
    setSourceChannelId(null);
    setError(null);
    setUrl('');
    if (window.location.pathname !== '/') window.history.pushState({}, '', '/');
  };

  const returnToSourceChannel = () => {
    if (!sourceChannelId) return handleReset();
    setAnalysisResult(null); setFromChannel(false); setSourceChannelId(null); setError(null);
    setChannelId(sourceChannelId);
    if (window.location.pathname !== `/channel/${sourceChannelId}`) window.history.pushState({}, '', `/channel/${sourceChannelId}`);
  };
  const openAnalysis = (data: AnalyzeVideoResponse, openedFromChannel = false) => {
    setAnalysisResult(data); setFromChannel(openedFromChannel);
    setSourceChannelId(openedFromChannel ? channelId : null);
  };
  const openChannelAnalysis = (nextChannelId: string) => { setAnalysisResult(null); setChannelId(nextChannelId); setFromChannel(false); setSourceChannelId(null); window.history.pushState({}, '', `/channel/${nextChannelId}`); };
  const analyzeFromChannel = async (videoUrl: string) => {
    setUrl(videoUrl); setLoading(true); setError(null); setFromChannel(true); setSourceChannelId(channelId);
    try {
      const response = await analyzeVideo(videoUrl);
      if (response.status === 'error') throw new Error(friendlyRequestError(undefined, response.error).message);
      else setAnalysisResult(response);
    } catch (error) { throw error instanceof Error ? error : new Error('Video analysis is temporarily unavailable.'); }
    finally { setLoading(false); }
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
          <BrandMark />
          LearnTrace
        </div>
        {analysisResult
          ? <button type="button" className="header-back-button" onClick={() => fromChannel ? returnToSourceChannel() : handleReset()}>&larr; {fromChannel ? 'Back to channel' : 'Back to videos'}</button>
          : <span className="subtitle-tag">Learning Observability for Educational Content</span>}
      </header>

      <main className="main-content">
        {analysisResult ? (
          <DataInspectionView data={analysisResult} onOpenChannel={openChannelAnalysis} />
        ) : channelId ? (
          <ChannelOverview channelId={channelId} onBack={handleReset} onOpenAnalysis={openAnalysis} onAnalyze={analyzeFromChannel} />
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
                placeholder="Enter your YouTube video link or channel"
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
              <p>Explore a real channel with analyzed videos, recurring themes, and action items.</p>
              <button type="button" className="demo-card" onClick={() => void handleDemo()} disabled={demoLoading}>
                <img src={DEMO_THUMBNAIL} alt="Google Cloud channel example thumbnail" />
                <span className="demo-card-copy"><strong>Google Cloud Tech</strong><em>YouTube channel example</em><small>Explore channel-wide learner themes, pending responses, and video-level evidence.</small></span>
                <span className="demo-card-cta">{demoLoading ? 'Loading…' : 'Explore channel →'}</span>
              </button>
              <small className="demo-caption">Uses stored LearnTrace analyses already available for this channel.</small>
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

function isYouTubeVideoUrl(value: string): boolean {
  try {
    let candidate = value.trim(); if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    const url = new URL(candidate); const host = url.hostname.toLowerCase().replace(/^www\./, ''); const segments = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') return /^[A-Za-z0-9_-]{11}$/.test(segments[0] || '');
    if (!['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) return false;
    return (url.pathname === '/watch' && /^[A-Za-z0-9_-]{11}$/.test(url.searchParams.get('v') || '')) || ['embed', 'v', 'shorts'].includes(segments[0]) && /^[A-Za-z0-9_-]{11}$/.test(segments[1] || '');
  } catch { return false; }
}

function isYouTubeUrl(value: string): boolean {
  try {
    let candidate = value.trim(); if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
    const hostname = new URL(candidate).hostname.toLowerCase().replace(/^www\./, '');
    return ['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(hostname);
  } catch { return false; }
}
