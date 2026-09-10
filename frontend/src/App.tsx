import React, { useEffect, useState } from 'react';
import { analyzeVideo, friendlyRequestError, resolveChannel } from './services/api';
import { AnalyzeVideoResponse } from './types';
import { DataInspectionView } from './components/DataInspectionView';
import { RequestError, RequestErrorDetails } from './components/RequestError';
import { ChannelOverview } from './components/ChannelOverview';
import { BrandMark } from './components/BrandMark';

const DEMO_CHANNEL_URL = 'https://www.youtube.com/@googlecloudtech';
const DEMO_CHANNEL_LOGO = 'https://www.gstatic.com/images/branding/product/2x/google_cloud_48dp.png';
const DEMO_VIDEOS = [
  {
    url: 'https://www.youtube.com/watch?v=Th8uRHWOv-Q',
    videoId: 'Th8uRHWOv-Q',
    title: 'React Native Development Build tutorial with EAS',
    description: 'Pre-tested video example with stored learner analysis.',
  },
  {
    url: 'https://www.youtube.com/watch?v=KEs5UyBJ39g',
    videoId: 'KEs5UyBJ39g',
    title: 'Hashing | Maps | Time Complexity | Collisions | Division Rule of Hashing | Strivers A2Z DSA Course',
    description: 'Pre-tested video example with stored learner analysis.',
  },
] as const;
// Replace this with your GitHub profile or repository URL before publishing.
const GITHUB_URL = 'https://github.com/your-github-username';
const LINKEDIN_URL = 'https://www.linkedin.com/in/manasvi-alimchandani-934b49197/';

export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<RequestErrorDetails | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);
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
    setDemoLoading('channel');
    setError(null);
    try {
      const channel = await resolveChannel(DEMO_CHANNEL_URL);
      setChannelId(channel.channelId);
      window.history.pushState({}, '', `/channel/${channel.channelId}`);
    } catch {
      setError({ title: 'Demo channel is temporarily unavailable.', message: 'You can still analyze a public educational YouTube link above.' });
    } finally {
      setDemoLoading(null);
    }
  };

  const handleVideoDemo = async (videoUrl: string) => {
    setDemoLoading(videoUrl);
    setError(null);
    try {
      const response = await analyzeVideo(videoUrl);
      if (response.status === 'error') {
        setError(friendlyRequestError(undefined, response.error));
        return;
      }
      setAnalysisResult(response);
    } catch {
      setError({ title: 'Demo video is temporarily unavailable.', message: 'You can still analyze another public YouTube link above.' });
    } finally {
      setDemoLoading(null);
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
              <button type="button" className="demo-card" onClick={() => void handleDemo()} disabled={Boolean(demoLoading)}>
                <span className="demo-channel-logo"><img src={DEMO_CHANNEL_LOGO} alt="Google Cloud Tech channel logo" /></span>
                <span className="demo-card-copy"><strong>Google Cloud Tech</strong><em>YouTube channel example</em><small>Explore channel-wide learner themes, pending responses, and video-level evidence.</small></span>
                <span className="demo-card-cta">{demoLoading === 'channel' ? 'Loading…' : 'Explore channel →'}</span>
              </button>
              {DEMO_VIDEOS.map((video) => <button type="button" className="demo-card demo-video-card" key={video.videoId} onClick={() => void handleVideoDemo(video.url)} disabled={Boolean(demoLoading)}>
                <img className="demo-video-thumbnail" src={`https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`} alt="" />
                <span className="demo-card-copy"><strong>{video.title}</strong><em>YouTube video example</em><small>{video.description}</small></span>
                <span className="demo-card-cta">{demoLoading === video.url ? 'Loading…' : 'View analysis →'}</span>
              </button>)}
              <small className="demo-caption">These examples use stored LearnTrace analyses when available.</small>
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
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="8" y="4" width="8" height="4" rx="1"></rect>
                  <path d="M16 6h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2"></path>
                  <path d="M8 13h8M8 17h5"></path>
                </svg>
                Actionable Creator Recommendations
              </span>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} LearnTrace</p>
        <p className="footer-credit">Made with <span className="footer-heart" aria-label="love">♥</span> by Manasvi Alimchandani</p>
        <nav className="footer-socials" aria-label="Manasvi Alimchandani social links">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="GitHub"><FooterIcon name="github" /></a>
          <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" aria-label="LinkedIn"><FooterIcon name="linkedin" /></a>
        </nav>
      </footer>

    </div>
  );
}

function FooterIcon({ name }: { name: 'github' | 'linkedin' }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">{name === 'github'
    ? <path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.49 0-.24-.01-1.04-.01-1.89-2.78.62-3.37-1.2-3.37-1.2-.45-1.18-1.11-1.49-1.11-1.49-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.56 2.35 1.11 2.92.85.09-.67.35-1.12.64-1.37-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.31.1-2.73 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.4c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.42.2 2.47.1 2.73.64.72 1.03 1.63 1.03 2.75 0 3.95-2.34 4.81-4.57 5.07.36.32.68.92.68 1.86 0 1.35-.01 2.43-.01 2.76 0 .27.18.6.69.49A10.25 10.25 0 0 0 22 12.23C22 6.58 17.52 2 12 2Z" />
    : <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.35V8.98h3.42v1.57h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.26 2.37 4.26 5.45v6.3ZM5.34 7.41a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14Zm1.78 13.04H3.56V8.98h3.56v11.47Z" />}</svg>;
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
