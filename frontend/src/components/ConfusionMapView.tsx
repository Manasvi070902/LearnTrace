import { useState } from 'react';
import { getConceptClusters } from '../services/api';
import { FrictionReport, FrictionScore, QuestionClusterDetail } from '../types';

interface ConfusionMapViewProps {
  videoId: string;
  report: FrictionReport;
  confusionMap: FrictionScore[];
}

export function ConfusionMapView({ videoId, report, confusionMap }: ConfusionMapViewProps) {
  const [selectedConcept, setSelectedConcept] = useState<FrictionScore | null>(null);
  const [clusters, setClusters] = useState<QuestionClusterDetail[]>([]);
  const [loadingConcept, setLoadingConcept] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});
  const analysisCoverage = report.availableComments > 0
    ? (report.aiAnalyzedComments / report.availableComments) * 100
    : 0;

  const selectConcept = async (concept: FrictionScore) => {
    setSelectedConcept(concept);
    setLoadingConcept(true);
    setDetailError(null);
    setClusters([]);
    try {
      const result = await getConceptClusters(videoId, concept.normalized_concept);
      setClusters(result.clusters || []);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Could not load the supporting comments.');
    } finally {
      setLoadingConcept(false);
    }
  };

  return (
    <section className="confusion-map-section">
      <div className="confusion-map-heading">
        <span className="section-kicker">AUDIENCE CONFUSION MAP</span>
        <h3>Audience Confusion Map</h3>
        <p>Where are learners showing recurring difficulty?</p>
      </div>

      <div className="analysis-coverage" aria-label="Analysis coverage">
        <span>Public conversations available: <strong>{report.availableComments.toLocaleString()}</strong></span>
        <span>AI-analyzed conversations: <strong>{report.aiAnalyzedComments.toLocaleString()}</strong></span>
        <span>Learning signals found: <strong>{report.learningSignals.toLocaleString()}</strong></span>
        <span>Analysis coverage: <strong>{analysisCoverage.toFixed(1)}%</strong></span>
      </div>
      <p className="early-analysis-note">Analysis based on {report.aiAnalyzedComments.toLocaleString()} public conversations.</p>

      {confusionMap.length === 0 ? (
        <div className="notice-banner info-banner">No qualifying learning signals were found in the cached analysis.</div>
      ) : (
        <div className="comments-table-wrapper">
          <table className="comments-table confusion-map-table">
            <thead><tr><th>Concept</th><th>Learning Signals</th><th>Recurring Questions</th><th>Learning Friction</th><th>Status</th></tr></thead>
            <tbody>{confusionMap.map((row) => (
              <tr key={row.normalized_concept} className="concept-row" onClick={() => void selectConcept(row)}>
                <td>{row.normalized_concept}</td>
                <td>{row.question_count}</td>
                <td>{row.cluster_count}</td>
                <td>{row.learning_friction_score === null ? '—' : row.learning_friction_score.toFixed(0)}</td>
                <td><span className={`friction-status ${row.friction_level.toLowerCase().replace(/\s+/g, '-')}`}>{row.friction_level}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {selectedConcept && (
        <section className="concept-detail">
          <div className="concept-detail-heading">
            <span className="section-kicker">CONCEPT DETAIL</span>
            <h3>{selectedConcept.normalized_concept}</h3>
            <p>Learning Friction: <strong>{selectedConcept.learning_friction_score === null ? 'Insufficient Evidence' : selectedConcept.learning_friction_score.toFixed(0)}</strong> · {selectedConcept.question_count} learning signals · {selectedConcept.cluster_count} recurring questions</p>
          </div>
          <h4>WHAT ARE LEARNERS ASKING?</h4>
          {loadingConcept && <p className="section-secondary-text">Loading real source comments…</p>}
          {detailError && <div className="notice-banner error-banner">{detailError}</div>}
          {clusters.map((cluster) => (
            <article className="question-cluster" key={cluster.cluster_id}>
              <p className="cluster-question">“{cluster.cluster_label}”</p>
              <p className="section-secondary-text">{cluster.question_count} related signal{cluster.question_count === 1 ? '' : 's'}</p>
              <button className="conversations-toggle" onClick={() => setOpenEvidence((current) => ({ ...current, [cluster.cluster_id]: !current[cluster.cluster_id] }))}>
                {openEvidence[cluster.cluster_id] ? 'Hide Evidence' : 'View Evidence'}
              </button>
              {openEvidence[cluster.cluster_id] && (
                <ul className="evidence-list">
                  {cluster.evidence.map((evidence) => <li key={evidence.comment_id}>{evidence.comment_text}</li>)}
                </ul>
              )}
            </article>
          ))}
        </section>
      )}
    </section>
  );
}
