import React, { useState } from 'react';
import { AnalyzeVideoResponse, YouTubeComment } from '../types';

interface DataInspectionViewProps {
  data: AnalyzeVideoResponse;
  onReset: () => void;
}

export function DataInspectionView({ data, onReset }: DataInspectionViewProps) {
  const { video, totalCommentsFetched, totalRepliesFetched, comments, commentsDisabled } = data;
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

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
        <span className="inspection-badge">Data Inspection View (Phase 2)</span>
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
          <span className="stat-label">Comments Fetched</span>
          <span className="stat-value">{totalCommentsFetched}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Replies Fetched</span>
          <span className="stat-value">{totalRepliesFetched}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">Comments Status</span>
          <span className={`stat-value ${commentsDisabled ? 'status-disabled' : 'status-enabled'}`}>
            {commentsDisabled ? 'Disabled' : 'Enabled'}
          </span>
        </div>
      </div>

      {commentsDisabled ? (
        <div className="notice-banner warning-banner">
          Comments are disabled on this video. No public comments available for analysis.
        </div>
      ) : comments.length === 0 ? (
        <div className="notice-banner info-banner">
          No public comments found for this video.
        </div>
      ) : (
        <div className="comments-table-wrapper">
          <table className="comments-table">
            <thead>
              <tr>
                <th style={{ width: '45%' }}>Comment Text</th>
                <th style={{ width: '20%' }}>Author</th>
                <th style={{ width: '15%' }}>Published Date</th>
                <th style={{ width: '10%' }}>Likes</th>
                <th style={{ width: '10%' }}>Replies</th>
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
                        <div
                          className="comment-text-content"
                          dangerouslySetInnerHTML={{ __html: comment.textDisplay }}
                        />
                        {hasReplies && (
                          <button
                            onClick={() => toggleExpand(comment.id)}
                            className="toggle-replies-btn"
                          >
                            {isExpanded ? 'Hide Replies' : `Show Replies (${comment.replies.length})`}
                          </button>
                        )}
                      </td>
                      <td className="author-cell">{comment.authorDisplayName}</td>
                      <td className="date-cell">{formatDate(comment.publishedAt)}</td>
                      <td className="likes-cell">{comment.likeCount}</td>
                      <td className="replies-cell">{comment.totalReplyCount}</td>
                    </tr>
                    {isExpanded && hasReplies && (
                      <tr className="replies-row">
                        <td colSpan={5} className="replies-container-cell">
                          <div className="replies-list">
                            <span className="replies-heading">Inline Replies:</span>
                            {comment.replies.map((reply) => (
                              <div key={reply.id} className="reply-item">
                                <div className="reply-header">
                                  <strong className="reply-author">{reply.authorDisplayName}</strong>
                                  <span className="reply-date">{formatDate(reply.publishedAt)}</span>
                                  <span className="reply-likes">&hearts; {reply.likeCount}</span>
                                </div>
                                <div
                                  className="reply-text"
                                  dangerouslySetInnerHTML={{ __html: reply.textDisplay }}
                                />
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
    </div>
  );
}
