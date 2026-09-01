import { useEffect, useState } from 'react';
import { getCreatorActions } from '../services/api';
import { CreatorAction, CreatorActionsResponse } from '../types';

interface CreatorActionsViewProps { videoId: string; }

const sectionDefinitions: Array<{ key: keyof Pick<CreatorActionsResponse, 'learningInsights' | 'technicalBarriers' | 'curriculumNavigation' | 'contentOpportunities' | 'improvementOpportunities' | 'positiveSignals' | 'peerLearning' | 'otherUseful'>; title: string; description: string }> = [
  { key: 'learningInsights', title: 'Learning Insights', description: 'Emerging, recurring, and evidence-backed learner questions.' },
  { key: 'technicalBarriers', title: 'Technical Barriers', description: 'Execution, setup, and tooling issues reported by learners.' },
  { key: 'curriculumNavigation', title: 'Curriculum & Navigation', description: 'Questions about prerequisites, sequence, scope, or where to find content.' },
  { key: 'contentOpportunities', title: 'Content Opportunities', description: 'Requested future coverage and follow-up material.' },
  { key: 'improvementOpportunities', title: 'Improvement Opportunities', description: 'Actionable feedback about the presentation or explanation.' },
  { key: 'positiveSignals', title: 'What Worked', description: 'Specific teaching approaches learners responded to positively.' },
  { key: 'peerLearning', title: 'Peer Learning', description: 'Audience members helping explain the material to one another.' },
  { key: 'otherUseful', title: 'Other Audience Signals', description: 'Potentially useful comments that do not fit another action category.' },
];

export function CreatorActionsView({ videoId }: CreatorActionsViewProps) {
  const [data, setData] = useState<CreatorActionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openEvidence, setOpenEvidence] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    void getCreatorActions(videoId)
      .then((result) => { if (active) setData(result); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load creator actions.'); });
    return () => { active = false; };
  }, [videoId]);

  if (error) return <section className="creator-actions-section"><div className="notice-banner error-banner">{error}</div></section>;
  if (!data?.audienceOverview) return <section className="creator-actions-section"><p className="section-secondary-text">Loading audience signals…</p></section>;

  const overview = data.audienceOverview;
  return (
    <section className="creator-actions-section">
      <div className="confusion-map-heading">
        <span className="section-kicker">AUDIENCE OVERVIEW</span>
        <h3>What is your audience telling you?</h3>
        <p>Meaningful comments are grouped into evidence-backed signals and actions.</p>
      </div>
      <div className="audience-overview-grid">
        <OverviewItem label="Conceptual learning" value={overview.learning} />
        <OverviewItem label="Recurring learner questions" value={overview.recurringLearningQuestions} />
        <OverviewItem label="Technical barriers" value={overview.technical} />
        <OverviewItem label="Curriculum / navigation" value={overview.curriculum_navigation} />
        <OverviewItem label="Content requests" value={overview.content_opportunity} />
        <OverviewItem label="Actionable feedback" value={overview.actionable_feedback} />
        <OverviewItem label="Positive signals" value={overview.positive_signal} />
      </div>

      {data.creatorActions?.length ? (
        <>
          <div className="creator-actions-heading"><span className="section-kicker">CREATOR ACTIONS</span><h3>What deserves your attention?</h3></div>
          <div className="creator-action-list">
            {data.creatorActions.slice(0, 8).map((action) => <ActionCard key={action.id} action={action} open={Boolean(openEvidence[action.id])} onToggle={() => setOpenEvidence((current) => ({ ...current, [action.id]: !current[action.id] }))} />)}
          </div>
        </>
      ) : <p className="section-secondary-text">No actionable audience signals were found in the analyzed conversations yet.</p>}

      {sectionDefinitions.map((section) => {
        const actions = data[section.key] || [];
        if (!actions.length) return null;
        return <section className="creator-category" key={section.key}>
          <h3>{section.title}</h3><p className="section-secondary-text">{section.description}</p>
          {actions.map((action) => <ActionCard key={action.id} action={action} open={Boolean(openEvidence[action.id])} onToggle={() => setOpenEvidence((current) => ({ ...current, [action.id]: !current[action.id] }))} />)}
        </section>;
      })}
    </section>
  );
}

function OverviewItem({ label, value }: { label: string; value: number }) {
  return <div className="overview-item"><strong>{value.toLocaleString()}</strong><span>{label}</span></div>;
}

function ActionCard({ action, open, onToggle }: { action: CreatorAction; open: boolean; onToggle: () => void }) {
  return <article className="creator-action-card">
    <div className="creator-action-meta"><span>{action.evidenceStrength}</span>{action.learningFrictionStatus && <span>{action.learningFrictionStatus}</span>}</div>
    <h4>{action.title}{action.concept ? `: ${action.concept}` : ''}</h4>
    <p>{action.summary}</p>
    <p><strong>Suggested attention:</strong> {action.suggestedAction}</p>
    <p className="section-secondary-text">{action.supportingSignalCount} supporting signal{action.supportingSignalCount === 1 ? '' : 's'}</p>
    <button className="conversations-toggle" onClick={onToggle}>{open ? 'Hide Evidence' : 'View Evidence'}</button>
    {open && <ul className="evidence-list">{action.evidence.map((item) => <li key={item.commentId}>{item.commentText}</li>)}</ul>}
  </article>;
}
