import { useEffect, useState } from 'react';
import { AnalyzeVideoResponse, FrictionResponse } from '../types';
import { analyzeLearningSignals, getCachedFrictionAnalysis, getCachedLearningSignals, runFrictionAnalysis } from '../services/api';
import { ConfusionMapView } from './ConfusionMapView';
import { LearnTraceIcon } from './LearnTraceIcon';
import { RequestError, RequestErrorDetails } from './RequestError';
import { friendlyErrorMessage } from '../services/api';

interface DataInspectionViewProps {
  data: AnalyzeVideoResponse;
  onOpenChannel?: (channelId: string) => void;
}

export function DataInspectionView({ data, onOpenChannel }: DataInspectionViewProps) {
  const { video, totalCommentsFetched, totalRepliesFetched, comments, commentsDisabled } = data;
  const [frictionResult, setFrictionResult] = useState<FrictionResponse | null>(null);
  const frictionLoading = false;
  const [expansionLoading, setExpansionLoading] = useState(false);
  const [rebuildLoading, setRebuildLoading] = useState(false);
  const [expansionError, setExpansionError] = useState<RequestErrorDetails | null>(null);
  const totalConversations = totalCommentsFetched + totalRepliesFetched;
  const reportedComments = data.youtubeCommentCount;
  const coverage = reportedComments && reportedComments > 0
    ? (totalConversations / reportedComments) * 100
    : null;
  const missingRecords = reportedComments && reportedComments > totalConversations
    ? reportedComments - totalConversations
    : 0;

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
      setExpansionError(friendlyErrorMessage(error instanceof Error ? error.message : ''));
    } finally {
      setExpansionLoading(false);
    }
  };

  /** Rebuilds clustering and audience cards from cached analysis only. */
  const rebuildAudienceInsights = async () => {
    if (!video) return;
    setRebuildLoading(true);
    setExpansionError(null);
    try {
      setFrictionResult(await runFrictionAnalysis(video.videoId));
    } catch (error) {
      setExpansionError(friendlyErrorMessage(error instanceof Error ? error.message : ''));
    } finally {
      setRebuildLoading(false);
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
  const videoUrl = video && /^[A-Za-z0-9_-]{11}$/.test(video.videoId)
    ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`
    : undefined;
  const hasChannelLink = Boolean(video?.channelId && /^UC[A-Za-z0-9_-]{22}$/.test(video.channelId) && onOpenChannel);

  return (
    <div className="inspection-view-container">
      {video && <section className="creator-video-hero">
        <div className="creator-video-main">
          {video.thumbnailUrl && <a className="video-thumbnail-frame video-source-link" href={videoUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${video.title} on YouTube`}>
            <img src={video.thumbnailUrl} alt={video.title} className="video-thumbnail" />
            <span className="thumbnail-play" aria-hidden="true"><LearnTraceIcon name="play" size={22} /></span>
          </a>}
          <div className="video-meta-info creator-video-info">
            <h2 className="video-title"><a className="video-source-link title-source-link" href={videoUrl} target="_blank" rel="noopener noreferrer">{video.title}<span aria-hidden="true"> ↗</span></a></h2>
            <div className="video-meta-details">
              {hasChannelLink ? <button type="button" className="channel-analysis-link" onClick={() => onOpenChannel!(video!.channelId)}>{video.channelTitle}<span aria-hidden="true"> Explore channel →</span></button> : <span className="channel-name">{video.channelTitle}</span>}
              <span className="published-date">Published {formatDate(video.publishedAt)}</span>
              {video.viewCount && (
                <span className="view-count">{Number(video.viewCount).toLocaleString()} views</span>
              )}
            </div>
            <div className="conversation-summary-card">
              <strong>{totalConversations.toLocaleString()} public conversations found</strong>
              <div className="compact-conversation-stats">
                <span><LearnTraceIcon name="comment" size={16} /> <b>{totalCommentsFetched.toLocaleString()}</b> comments</span><span><LearnTraceIcon name="reply" size={16} /> <b>{totalRepliesFetched.toLocaleString()}</b> replies</span><span><LearnTraceIcon name="users" size={16} /> <b>{totalConversations.toLocaleString()}</b> conversations</span><span><LearnTraceIcon name="activity" size={16} /> <b>{coverage === null ? '—' : `${coverage.toFixed(1)}%`}</b> fetched <button className="stats-info-button" type="button" aria-label="About fetched-comment coverage" title={reportedComments === undefined ? 'YouTube did not provide a total comment count for this saved video.' : `YouTube reported ${reportedComments.toLocaleString()} comments. LearnTrace retrieved ${totalConversations.toLocaleString()}${missingRecords ? `; ${missingRecords.toLocaleString()} may be deleted, moderated, or unavailable through YouTube's API.` : '.'}`}><LearnTraceIcon name="info" size={14} /></button></span>
              </div>
              {reportedComments !== undefined && <small>{totalConversations.toLocaleString()} of {reportedComments.toLocaleString()} comments fetched{missingRecords ? ` (${missingRecords.toLocaleString()} unavailable).` : '.'}</small>}
            </div>
          </div>
        </div>
        <aside className="audience-status">
          <span className="audience-status-kicker"><LearnTraceIcon name="sparkles" size={16} /> Audience analysis</span>
          {frictionResult?.report ? <><strong>Audience insights ready</strong><p>{frictionResult.report.aiAnalyzedComments.toLocaleString()} of {totalConversations.toLocaleString()} conversations analyzed</p><div className="analysis-progress-row"><div className="analysis-progress"><span style={{ width: `${totalConversations ? Math.min(100, (frictionResult.report.aiAnalyzedComments / totalConversations) * 100) : 0}%` }} /></div><small>{totalConversations ? ((frictionResult.report.aiAnalyzedComments / totalConversations) * 100).toFixed(1) : '0.0'}%</small></div></> : <><strong>Ready to understand your audience</strong><p>Analyze conversations to uncover learner questions, repeated difficulties, requests, and feedback.</p></>}
          <button className="conversations-toggle audience-analyze-button" onClick={analyzeMoreConversations} disabled={frictionLoading || expansionLoading || !video || Boolean(frictionResult?.report && frictionResult.report.aiAnalyzedComments >= totalConversations)}><LearnTraceIcon name="refresh" size={17} /> {expansionLoading ? 'Analyzing audience…' : frictionResult?.report && frictionResult.report.aiAnalyzedComments >= totalConversations ? 'All available conversations analyzed' : frictionResult?.report ? 'Analyze more comments' : 'Analyze comments'}</button>
          {frictionResult?.report && <><button className="conversations-toggle audience-analyze-button" onClick={rebuildAudienceInsights} disabled={rebuildLoading || expansionLoading || !video}><LearnTraceIcon name="refresh" size={17} /> {rebuildLoading ? 'Refreshing insights…' : 'Refresh audience insights'}</button><small>Regroups cached comments without analyzing more.</small></>}
        </aside>
      </section>}

      {expansionError && <RequestError error={expansionError} onRetry={() => void analyzeMoreConversations()} />}
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
