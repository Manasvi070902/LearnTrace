import { useEffect, useState } from 'react';
import { AnalyzeVideoResponse, FrictionResponse } from '../types';
import { analyzeLearningSignals, getCachedFrictionAnalysis, getCachedLearningSignals } from '../services/api';
import { ConfusionMapView } from './ConfusionMapView';
import { LearnTraceIcon } from './LearnTraceIcon';

interface DataInspectionViewProps {
  data: AnalyzeVideoResponse;
}

export function DataInspectionView({ data }: DataInspectionViewProps) {
  const { video, totalCommentsFetched, totalRepliesFetched, comments, commentsDisabled } = data;
  const [frictionResult, setFrictionResult] = useState<FrictionResponse | null>(null);
  const frictionLoading = false;
  const [expansionLoading, setExpansionLoading] = useState(false);
  const [expansionError, setExpansionError] = useState<string | null>(null);
  const totalConversations = totalCommentsFetched + totalRepliesFetched;
  const reportedComments = data.youtubeCommentCount;
  const coverage = reportedComments && reportedComments > 0
    ? (totalConversations / reportedComments) * 100
    : null;

  // Rehydrate the creator dashboard from stored analysis when it already
  // exists. These requests do not generate additional provider work.
  useEffect(() => {
    if (!video) return;
    let active = true;
    void Promise.all([getCachedLearningSignals(video.videoId), getCachedFrictionAnalysis(video.videoId)])
      .then(([signals, friction]) => {
        if (!active || !signals.commentsAnalyzed) return;
        setFrictionResult({
          ...friction,
          report: {
            availableComments: totalConversations,
            aiAnalyzedComments: signals.commentsAnalyzed,
            learningSignals: signals.learningSignals || 0,
            canonicalQuestions: 0,
            embeddingsGenerated: 0,
            embeddingsCached: 0,
            questionClusters: 0,
            normalizedConcepts: 0,
            conceptsWithEvidence: 0,
            conceptsInsufficientEvidence: 0,
            technicalBarriers: 0,
            curriculumNavigationSignals: 0,
          },
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [video?.videoId, totalConversations]);

  const analyzeMoreConversations = async () => {
    if (!video) return;
    setExpansionLoading(true);
    setExpansionError(null);
    try {
      const result = await analyzeLearningSignals(video.videoId);
      if (result.frictionReport) {
        setFrictionResult({
          status: 'success',
          videoId: result.videoId,
          report: result.frictionReport,
          confusionMap: result.confusionMap || [],
        });
      }
    } catch (error) {
      setExpansionError(error instanceof Error ? error.message : 'Additional AI analysis could not be completed.');
    } finally {
      setExpansionLoading(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'N/A';
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="inspection-view-container">
      {video && <section className="creator-video-hero">
        <div className="creator-video-main">
          {video.thumbnailUrl && <div className="video-thumbnail-frame">
            <img src={video.thumbnailUrl} alt={video.title} className="video-thumbnail" />
            <span className="thumbnail-play" aria-hidden="true"><LearnTraceIcon name="play" size={22} /></span>
          </div>}
          <div className="video-meta-info creator-video-info">
            <h2 className="video-title">{video.title}</h2>
            <div className="video-meta-details">
              <span className="channel-name">{video.channelTitle}</span>
              <span className="published-date">Published {formatDate(video.publishedAt)}</span>
              {video.viewCount && (
                <span className="view-count">{Number(video.viewCount).toLocaleString()} views</span>
              )}
            </div>
            <div className="conversation-summary-card">
              <strong>{totalConversations.toLocaleString()} public conversations found</strong>
              <div className="compact-conversation-stats">
                <span><LearnTraceIcon name="comment" size={16} /> <b>{totalCommentsFetched.toLocaleString()}</b> comments</span><span><LearnTraceIcon name="reply" size={16} /> <b>{totalRepliesFetched.toLocaleString()}</b> replies</span><span><LearnTraceIcon name="users" size={16} /> <b>{totalConversations.toLocaleString()}</b> conversations</span><span><LearnTraceIcon name="activity" size={16} /> <b>{coverage === null ? '—' : `${coverage.toFixed(1)}%`}</b> publicly available <button className="stats-info-button" type="button" aria-label="About public availability" title="LearnTrace can analyze conversations publicly available through YouTube's public API."><LearnTraceIcon name="info" size={14} /></button></span>
              </div>
              {reportedComments !== undefined && <small>YouTube reports {reportedComments.toLocaleString()} total comments.</small>}
            </div>
          </div>
        </div>
        <aside className="audience-status">
          <span className="audience-status-kicker"><LearnTraceIcon name="sparkles" size={16} /> Audience analysis</span>
          {frictionResult?.report ? <><strong>Audience insights ready</strong><p>{frictionResult.report.aiAnalyzedComments.toLocaleString()} of {totalConversations.toLocaleString()} conversations analyzed</p><div className="analysis-progress-row"><div className="analysis-progress"><span style={{ width: `${totalConversations ? Math.min(100, (frictionResult.report.aiAnalyzedComments / totalConversations) * 100) : 0}%` }} /></div><small>{totalConversations ? ((frictionResult.report.aiAnalyzedComments / totalConversations) * 100).toFixed(1) : '0.0'}%</small></div></> : <><strong>Ready to understand your audience</strong><p>Analyze conversations to uncover learner questions, repeated difficulties, requests, and feedback.</p></>}
          <button className="conversations-toggle audience-analyze-button" onClick={analyzeMoreConversations} disabled={frictionLoading || expansionLoading || !video}><LearnTraceIcon name="refresh" size={17} /> {expansionLoading ? 'Analyzing audience…' : frictionResult?.report ? 'Analyze more comments' : 'Analyze audience'}</button>
          {frictionResult?.report && <small>Get a broader view of your audience.</small>}
        </aside>
      </section>}

      {expansionError && <div className="notice-banner error-banner">{expansionError}</div>}
      {frictionResult?.report && (
        <ConfusionMapView videoId={video!.videoId} report={frictionResult.report} confusionMap={frictionResult.confusionMap || []} />
      )}

      {commentsDisabled && (
        <div className="notice-banner info-banner">
          No publicly accessible audience conversations were available for this video.
        </div>
      )}
      {!commentsDisabled && comments.length === 0 && (
        <div className="notice-banner info-banner">
          No publicly accessible audience conversations were found for this video.
        </div>
      )}
    </div>
  );
}
