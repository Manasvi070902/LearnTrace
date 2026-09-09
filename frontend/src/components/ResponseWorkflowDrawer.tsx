import { ReactNode, useEffect, useState } from 'react';
import { generateResponseDraft, restoreResponseWorkflow, setResponseWorkflowResolution, snoozeResponseWorkflow } from '../services/api';
import { ResponseDraftMode, ResponseWorkflowItem } from '../types';
import { LearnTraceIcon, LearnTraceIconName } from './LearnTraceIcon';

export type WorkflowDrawerAction = 'resolved' | 'snoozed' | 'restored';

const ACRONYMS = new Set(['ai', 'api', 'css', 'gcp', 'html', 'json', 'sql', 'ui', 'ux']);

function displayLabel(value: string): string {
  return value.replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => {
    if (word.length > 1 && word === word.toUpperCase()) return word;
    const lower = word.toLowerCase();
    return ACRONYMS.has(lower) ? lower.toUpperCase() : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  });
}

function draftLabel(mode: ResponseDraftMode): string {
  return ({
    individual_reply: 'Draft a reply', public_clarification: 'Draft a clarification', technical_fix: 'Draft a fix',
    learning_path_guidance: 'Draft guidance', request_acknowledgement: 'Draft acknowledgement', feedback_acknowledgement: 'Draft acknowledgement',
  })[mode];
}

function DrawerHeading({ icon, children }: { icon: LearnTraceIconName; children: ReactNode }) {
  return <h4><LearnTraceIcon name={icon} size={18} /> {children}</h4>;
}

export function ResponseWorkflowDrawer({ item, videoId, workflowIds = [item.workflowId], onClose, onUpdated }: { item: ResponseWorkflowItem; videoId: string; workflowIds?: string[]; onClose: () => void; onUpdated: (action: WorkflowDrawerAction) => void | Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const isSnoozed = item.resolutionStatus === 'snoozed';
  const learnerCount = item.supportingCommentIds.length;
  const isLearning = item.sourceCategory === 'learning';
  const evidenceLevel = item.priority === 'high' ? 'attention' : learnerCount >= 2 ? 'repeated' : 'individual';
  const status = isSnoozed ? 'Snoozed' : isLearning ? evidenceLevel === 'attention' ? 'Needs attention' : evidenceLevel === 'repeated' ? 'Repeated question' : 'Learner question' : 'Needs response';

  useEffect(() => {
    document.body.classList.add('insight-drawer-open');
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.classList.remove('insight-drawer-open');
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const createDraft = async (regenerate = false) => {
    setWorking(true); setError(null);
    try {
      const result = await generateResponseDraft(videoId, item.workflowId, item.primaryDraftMode, regenerate);
      setDraft(result.draft?.draft_text || '');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not create a reply draft.'); }
    finally { setWorking(false); }
  };
  const update = async (action: WorkflowDrawerAction) => {
    if (action === 'resolved' && !window.confirm('Mark this task as replied? Use this only after posting the response.')) return;
    setWorking(true); setError(null);
    try {
      await Promise.all(workflowIds.map((workflowId) => action === 'snoozed'
        ? snoozeResponseWorkflow(videoId, workflowId)
        : action === 'restored'
          ? restoreResponseWorkflow(videoId, workflowId)
          : setResponseWorkflowResolution(videoId, workflowId, true)));
      await onUpdated(action);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not update this task.'); }
    finally { setWorking(false); }
  };
  const copyDraft = async () => { await navigator.clipboard?.writeText(draft); setCopied(true); window.setTimeout(() => setCopied(false), 1600); };

  return <>
    <button className="insight-drawer-backdrop" aria-label="Close task details" onClick={onClose} />
    <aside className="insight-drawer workflow-drawer" role="dialog" aria-modal="true" aria-label={`${displayLabel(item.title)} details`}>
      <button type="button" className="drawer-close" onClick={onClose} aria-label="Close task details"><LearnTraceIcon name="close" size={20} /></button>
      <span className={`insight-kind drawer-status ${evidenceLevel === 'attention' ? 'status-strong' : evidenceLevel === 'repeated' ? 'status-repeated' : ''}`}>
        {isLearning && <LearnTraceIcon name={evidenceLevel === 'attention' ? 'flame' : 'messages'} size={15} />}{status}
      </span>
      <h3>{displayLabel(item.title)}</h3>
      <p className="drawer-count">{learnerCount} learner{learnerCount === 1 ? ' raised this' : 's asked something similar'}</p>

      <section className="drawer-section">
        <DrawerHeading icon="comment">{learnerCount === 1 ? 'What the learner asked' : 'What learners are asking'}</DrawerHeading>
        <p className="drawer-question">{item.normalizedNeed || item.evidence[0]?.comment_text || 'Review the supporting learner evidence.'}</p>
        {item.evidence.length > 1 && <>
          <button type="button" className="drawer-comments-toggle" onClick={() => setShowEvidence((visible) => !visible)} aria-expanded={showEvidence}>{showEvidence ? 'Hide comments' : 'See supporting comments'} →</button>
          {showEvidence && <ul className="evidence-list drawer-evidence">{item.evidence.map((evidence) => <li key={evidence.comment_id}>{evidence.comment_text}</li>)}</ul>}
        </>}
      </section>

      {item.hasPhase6Interpretation && <section className="drawer-section drawer-diagnosis"><DrawerHeading icon="sparkles">AI interpretation available</DrawerHeading><p>This recurring audience need has enough evidence for deeper interpretation in the video analysis.</p></section>}

      <section className="drawer-section drawer-response">
        <DrawerHeading icon="reply">Response</DrawerHeading>
        {isSnoozed ? <div className="response-review"><span>SNOOZED</span><p>This follow-up is set aside for later.</p></div> : <>
          <div className="response-review"><span>NEEDS RESPONSE</span><p>Suggested response: <b>{item.suggestedResponseType}</b></p></div>
          <button type="button" className="drawer-generate-button" onClick={() => void createDraft(false)} disabled={working}>{working ? 'Writing a draft…' : item.cachedDraftModes?.includes(item.primaryDraftMode) ? `View saved ${draftLabel(item.primaryDraftMode).toLowerCase()}` : `${draftLabel(item.primaryDraftMode)} ✦`}</button>
          {draft && <div className="reply-draft-card"><label className="ai-draft-label" htmlFor="channel-reply-draft">AI-generated draft <small>Review and edit before posting.</small></label><textarea id="channel-reply-draft" className="reply-draft" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={900} /><div className="reply-draft-actions"><button type="button" onClick={() => void createDraft(true)} disabled={working}>Regenerate</button><button type="button" onClick={() => void copyDraft()}>{copied ? 'Copied' : 'Copy reply'}</button></div></div>}
        </>}
        <div className="workflow-status-actions">{isSnoozed ? <button type="button" className="text-button" disabled={working} onClick={() => void update('restored')}>Restore to open</button> : <><button type="button" className="text-button" disabled={working} onClick={() => void update('snoozed')}>Snooze</button><button type="button" className="text-button response-resolve" disabled={working} onClick={() => void update('resolved')}>Mark replied</button></>}</div>
        {error && <p className="drawer-diagnosis-error">{error}</p>}
      </section>

      <details className="drawer-trust"><summary><LearnTraceIcon name="info" size={16} /> Why this is showing</summary><p>{learnerCount > 1 ? 'Multiple learners independently raised a similar need, so LearnTrace grouped it into one follow-up.' : 'A learner raised a specific need that may benefit from a creator response.'}</p></details>
    </aside>
  </>;
}
