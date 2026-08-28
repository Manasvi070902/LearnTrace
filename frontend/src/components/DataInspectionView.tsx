import React, { useState } from 'react';
import { AnalyzeVideoResponse, CommentAnalysis, YouTubeComment } from '../types';
import { analyzeLearningSignals } from '../services/api';

interface DataInspectionViewProps {
  data: AnalyzeVideoResponse;
  onReset: () => void;
}

export function DataInspectionView({ data, onReset }: DataInspectionViewProps) {
  const { video, totalCommentsFetched, totalRepliesFetched, comments, commentsDisabled } = data;
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [showConversations, setShowConversations] = useState(false);
  const [signalRows, setSignalRows] = useState<CommentAnalysis[]>([]);
  const [signalFilter, setSignalFilter] = useState('all');
  const [signalLoading, setSignalLoading] = useState(false);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [signalRun, setSignalRun] = useState<{ availableComments: number; commentsSelected: number; commentsCached: number; commentsSubmitted: number; geminiRequests: number; resultsStored: number } | null>(null);
  const totalConversations = totalCommentsFetched + totalRepliesFetched;
  const reportedComments = data.youtubeCommentCount;
  const coverage = reportedComments && reportedComments > 0
    ? (totalConversations / reportedComments) * 100
    : null;

  const toggleExpand = (commentId: string) => {
    setExpandedComments((prev) => ({
      ...prev,
      [commentId]: !prev[commentId],
    }));
  };

  const runSignalAnalysis = async () => {
    if (!video) return;
    setSignalLoading(true);
    setSignalError(null);
    try {
      const result = await analyzeLearningSignals(video.videoId);
      setSignalRows(result.analyses || []);
      setSignalRun({ availableComments: result.availableComments || 0, commentsSelected: result.commentsSelected || 0, commentsCached: result.commentsCached || 0, commentsSubmitted: result.commentsSubmitted || 0, geminiRequests: result.geminiRequests || 0, resultsStored: result.resultsStored || 0 });
    } catch (error) {
      setSignalError(error instanceof Error ? error.message : 'Learning-signal analysis failed.');
    } finally {
      setSignalLoading(false);
    }
  };

  const filteredSignalRows = signalRows.filter((row) => {
    if (signalFilter === 'all') return true;
    if (signalFilter === 'praise_noise') return row.intent === 'praise' || row.intent === 'noise';
    return row.intent === signalFilter;
  });

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
      <div className="inspection-header">
        <button onClick={onReset} className="back-button">
          &larr; Analyze Another Video
        </button>
        <span className="inspection-badge">VIDEO ANALYSIS</span>
      </div>

      {video && (
        <div className="video-meta-card">
          {video.thumbnailUrl && (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="video-thumbnail"
            />
          )}
          <div className="video-meta-info">
            <h2 className="video-title">{video.title}</h2>
            <div className="video-meta-details">
              <span className="channel-name">Channel: {video.channelTitle}</span>
              <span className="published-date">Published: {formatDate(video.publishedAt)}</span>
              {video.viewCount && (
                <span className="view-count">Views: {Number(video.viewCount).toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="stats-summary-bar">
        <div className="stat-box">
          <span className="stat-label">Public Comments</span>
          <span className="stat-value">{totalCommentsFetched}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Public Replies</span>
          <span className="stat-value">{totalRepliesFetched}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Public Conversations</span>
          <span className="stat-value">
            {totalConversations.toLocaleString()}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Data Coverage</span>
          <span className="stat-value">
            {coverage !== null
              ? `${coverage.toFixed(1)}%`
              : 'N/A'}
          </span>
          {reportedComments !== undefined && (
            <span className="stat-supporting-text">
              {totalConversations.toLocaleString()} of {reportedComments.toLocaleString()} reported
            </span>
          )}
        </div>
      </div>

      <section className="data-availability-section">
        <div>
          <span className="section-kicker">DATA AVAILABILITY</span>
          <h3>Data availability</h3>
          <p>LearnTrace retrieved {totalConversations.toLocaleString()} publicly accessible audience conversations for this video.</p>
          {reportedComments !== undefined && (
            <p className="section-secondary-text">
              YouTube reports {reportedComments.toLocaleString()} total comments. Some records may not be available through the public YouTube Data API.
            </p>
          )}
          {coverage !== null && (
            <span className="coverage-note">{coverage.toFixed(1)}% of reported conversations are publicly retrievable for analysis.</span>
          )}
        </div>
      </section>

      <section className="analysis-cta-section">
        <div>
          <span className="section-kicker">READY FOR LEARNING ANALYSIS</span>
          <h3>Ready for Learning Analysis</h3>
          <p>{totalConversations.toLocaleString()} public audience conversations are ready for learning-signal analysis.</p>
        </div>
        <button className="analysis-cta-button" onClick={runSignalAnalysis} disabled={signalLoading || !video}>
          {signalLoading ? 'Analyzing Learning Signals...' : 'Analyze Learning Signals'}
        </button>
        <span className="coming-next-label">AI analysis currently uses up to 50 public conversations for validation.</span>
      </section>

      {signalError && <div className="notice-banner error-banner">{signalError}</div>}
      {signalRows.length > 0 && (
        <section className="signal-validation-section">
          <div className="conversations-section-header">
            <div>
              <span className="section-kicker">PHASE 4 VALIDATION</span>
              <h3>Learning Signal Validation</h3>
              <p className="table-source-note">Gemini-derived classifications for manual inspection. No friction score is calculated here.</p>
            </div>
            <div className="signal-summary">{signalRows.length} analyzed · {signalRows.filter((row) => row.is_learning_signal).length} learning signals</div>
          </div>
          {signalRun && <div className="signal-run-stats"><span>Available: {signalRun.availableComments.toLocaleString()}</span><span>Selected: {signalRun.commentsSelected}</span><span>Cached: {signalRun.commentsCached}</span><span>Submitted: {signalRun.commentsSubmitted}</span><span>Gemini requests: {signalRun.geminiRequests}</span><span>Stored: {signalRun.resultsStored}</span></div>}
          <div className="signal-filters">
            {['all', 'conceptual_confusion', 'learning_question', 'technical_error', 'content_request', 'praise_noise'].map((filter) => (
              <button key={filter} className={signalFilter === filter ? 'signal-filter active' : 'signal-filter'} onClick={() => setSignalFilter(filter)}>
                {filter === 'all' ? 'All' : filter === 'praise_noise' ? 'Praise / Noise' : filter.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
          <div className="comments-table-wrapper">
            <table className="comments-table signal-table"><thead><tr><th>Original Comment</th><th>Intent</th><th>Canonical Question</th><th>Concept</th><th>Confusion</th><th>Confidence</th></tr></thead>
              <tbody>{filteredSignalRows.map((row) => <tr key={`${row.comment_id}-${row.prompt_version}`}>
                <td>{comments.flatMap((comment) => [comment, ...comment.replies]).find((comment) => comment.id === row.comment_id)?.textOriginal || 'Unavailable'}</td>
                <td>{row.intent.replace(/_/g, ' ')}</td><td>{row.canonical_question || '—'}</td><td>{row.concept || '—'}</td>
                <td>{row.confusion_strength.toFixed(2)}</td><td>{row.confidence.toFixed(2)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>
      )}

      <section className="conversations-section">
        <div className="conversations-section-header">
          <div>
            <h3>Retrieved Audience Conversations</h3>
            <p className="table-source-note">Public comments and replies available for LearnTrace analysis.</p>
          </div>
          <button className="conversations-toggle" onClick={() => setShowConversations((visible) => !visible)}>
            {showConversations ? 'Hide Retrieved Conversations' : 'View Retrieved Conversations'}
          </button>
        </div>

        {showConversations && comments.length > 0 && (
          <div className="comments-table-wrapper">
            <table className="comments-table">
              <thead>
                <tr>
                  <th style={{ width: '55%' }}>Comment Text</th>
                  <th style={{ width: '20%' }}>Published Date</th>
                  <th style={{ width: '10%' }}>Likes</th>
                  <th style={{ width: '15%' }}>Replies</th>
                </tr>
              </thead>
              <tbody>
                {comments.map((comment: YouTubeComment) => {
                  const isExpanded = !!expandedComments[comment.id];
                  const hasReplies = comment.replies && comment.replies.length > 0;

                  return (
                    <React.Fragment key={comment.id}>
                      <tr className="comment-row">
                        <td className="comment-text-cell">
                          <div className="comment-text-content" dangerouslySetInnerHTML={{ __html: comment.textDisplay }} />
                          {hasReplies && (
                            <button onClick={() => toggleExpand(comment.id)} className="toggle-replies-btn">
                              {isExpanded ? 'Hide Replies' : `Show Replies (${comment.replies.length})`}
                            </button>
                          )}
                        </td>
                        <td className="date-cell">{formatDate(comment.publishedAt)}</td>
                        <td className="likes-cell">{comment.likeCount}</td>
                        <td className="replies-cell">{comment.totalReplyCount}</td>
                      </tr>
                      {isExpanded && hasReplies && (
                        <tr className="replies-row">
                          <td colSpan={4} className="replies-container-cell">
                            <div className="replies-list">
                              <span className="replies-heading">Replies:</span>
                              {comment.replies.map((reply) => (
                                <div key={reply.id} className="reply-item">
                                  <div className="reply-header">
                                    <span className="reply-date">{formatDate(reply.publishedAt)}</span>
                                    <span className="reply-likes">&hearts; {reply.likeCount}</span>
                                  </div>
                                  <div className="reply-text" dangerouslySetInnerHTML={{ __html: reply.textDisplay }} />
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
