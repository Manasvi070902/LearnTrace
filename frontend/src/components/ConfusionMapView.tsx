import { useState } from 'react';
import { generateConceptDiagnosis, getConceptClusters, getConceptDiagnosis } from '../services/api';
import { AiInterpretation, DiagnosisResponse, FrictionReport, FrictionScore, QuestionClusterDetail } from '../types';
import { CreatorActionsView } from './CreatorActionsView';

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
  const [diagnosis, setDiagnosis] = useState<DiagnosisResponse | null>(null);
  const [generatingDiagnosis, setGeneratingDiagnosis] = useState(false);
  const analysisCoverage = report.availableComments > 0
    ? (report.aiAnalyzedComments / report.availableComments) * 100
    : 0;
  const recurringQuestionCount = (concept: FrictionScore) => concept.cluster_count;
  const hasRecurrence = confusionMap.some((concept) => recurringQuestionCount(concept) > 0);
  const hasScoredFriction = confusionMap.some((concept) => concept.learning_friction_score !== null);
  const plural = (count: number, singular: string, pluralForm = `${singular}s`) => `${count} ${count === 1 ? singular : pluralForm}`;

  const selectConcept = async (concept: FrictionScore) => {
    setSelectedConcept(concept);
    setLoadingConcept(true);
    setDetailError(null);
    setClusters([]);
    setDiagnosis(null);
    try {
      const [result, diagnosisResult] = await Promise.all([
        getConceptClusters(videoId, concept.normalized_concept),
        getConceptDiagnosis(videoId, concept.normalized_concept),
      ]);
      setClusters(result.clusters || []);
      setDiagnosis(diagnosisResult);
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Could not load the supporting comments.');
    } finally {
      setLoadingConcept(false);
    }
  };

  const generateInterpretation = async () => {
    if (!selectedConcept) return;
    setGeneratingDiagnosis(true);
    try { setDiagnosis(await generateConceptDiagnosis(videoId, selectedConcept.normalized_concept)); }
    catch (error) { setDiagnosis({ status: 'error', error: error instanceof Error ? error.message : 'AI interpretation is temporarily unavailable.' }); }
    finally { setGeneratingDiagnosis(false); }
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
        <span>Conceptual learning signals: <strong>{report.learningSignals.toLocaleString()}</strong></span>
        <span>Technical barriers: <strong>{report.technicalBarriers.toLocaleString()}</strong></span>
        <span>Curriculum/navigation signals: <strong>{report.curriculumNavigationSignals.toLocaleString()}</strong></span>
        <span>Analysis coverage: <strong>{analysisCoverage.toFixed(1)}%</strong></span>
      </div>
      <p className="early-analysis-note">Analysis based on {report.aiAnalyzedComments.toLocaleString()} of {report.availableComments.toLocaleString()} public conversations.</p>

      {report.learningSignals === 0 && (
        <div className="notice-banner info-banner">No conceptual learning signals detected in the analyzed conversations.</div>
      )}
      {report.learningSignals > 0 && !hasRecurrence && !hasScoredFriction && (
        <div className="notice-banner info-banner"><strong>No recurring learning friction detected yet.</strong> Individual learner questions were found, but no repeated learning difficulty was detected.</div>
      )}
      {report.learningSignals > 0 && hasRecurrence && !hasScoredFriction && (
        <div className="notice-banner info-banner">Recurring learner questions were detected, but there is not yet enough evidence to assign a reliable Learning Friction score.</div>
      )}

      {confusionMap.length > 0 && (
        <div className="comments-table-wrapper">
          <table className="comments-table confusion-map-table">
            <thead><tr><th>Concept</th><th>Learning Signals</th><th>Recurring Questions</th><th>Learning Friction</th><th>Status</th></tr></thead>
            <tbody>{confusionMap.map((row) => (
              <tr key={row.normalized_concept} className="concept-row" onClick={() => void selectConcept(row)}>
                <td>{row.normalized_concept}</td>
                <td>{row.question_count}</td>
                <td>{recurringQuestionCount(row)}</td>
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
            <p>Learning Friction: <strong>{selectedConcept.learning_friction_score === null ? 'Insufficient Evidence' : selectedConcept.learning_friction_score.toFixed(0)}</strong> · {plural(selectedConcept.question_count, 'learning signal')} · {plural(clusters.length, 'learner question')} · {plural(recurringQuestionCount(selectedConcept), 'recurring question')}</p>
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
          <section className="concept-detail ai-interpretation">
            <span className="section-kicker">LEARNTRACE AI INTERPRETATION</span>
            {diagnosis?.eligible === false && <><p><strong>Not enough repeated evidence yet.</strong></p><p className="section-secondary-text">{diagnosis.supportingText}</p></>}
            {diagnosis?.eligible && !diagnosis.interpretation && <button className="conversations-toggle" disabled={generatingDiagnosis} onClick={() => void generateInterpretation()}>{generatingDiagnosis ? 'Generating…' : 'Generate AI Interpretation'}</button>}
            {diagnosis?.interpretation && <InterpretationContent interpretation={diagnosis.interpretation} />}
            {diagnosis?.status === 'error' && <p className="section-secondary-text">AI interpretation is temporarily unavailable.</p>}
          </section>
        </section>
      )}
      <CreatorActionsView videoId={videoId} />
    </section>
  );
}

function InterpretationContent({ interpretation }: { interpretation: AiInterpretation }) {
  return <div>
    <h4>SUMMARY</h4><p>{interpretation.summary}</p>
    <h4>POSSIBLE LEARNING GAP</h4><p>{interpretation.possibleLearningGap}</p>
    <h4>RECOMMENDED ACTION</h4><p>{interpretation.recommendedAction}</p>
    <h4>CONFIDENCE</h4><p>{Math.round(interpretation.confidence * 100)}%</p>
  </div>;
}
