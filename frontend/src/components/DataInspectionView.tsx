import React, { useState } from 'react';
import { AnalyzeVideoResponse, YouTubeComment } from '../types';

interface DataInspectionViewProps {
  data: AnalyzeVideoResponse;
  onReset: () => void;
}

export function DataInspectionView({ data, onReset }: DataInspectionViewProps) {
  const { video, totalCommentsFetched, totalRepliesFetched, comments, commentsDisabled } = data;
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});
  const [showConversations, setShowConversations] = useState(false);
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
          <p>{totalConversations.toLocaleString()} public audience conversations are ready to be analyzed for learner questions, recurring confusion, and learning friction.</p>
        </div>
        <button className="analysis-cta-button" disabled title="AI analysis coming next">
          Analyze Learning Friction
        </button>
        <span className="coming-next-label">AI analysis coming next</span>
      </section>

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
