import { useEffect, useState } from 'react';
import { getResponseWorkflow } from '../services/api';
import { ResponseWorkflowItem, ResponseWorkflowResponse } from '../types';
import { LearnTraceIcon } from './LearnTraceIcon';
import { ResponseWorkflowDrawer } from './ResponseWorkflowDrawer';

export function ResponseWorkflowView({ videoId }: { videoId: string }) {
  const [data, setData] = useState<ResponseWorkflowResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'needs' | 'resolved'>('needs');
  const [selected, setSelected] = useState<ResponseWorkflowItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => getResponseWorkflow(videoId).then(setData).catch((err) => setError(err instanceof Error ? err.message : 'Could not load response workflow.'));
  useEffect(() => { setOpen(false); setSelected(null); setError(null); void load(); }, [videoId]);
  const items = tab === 'needs' ? data?.needsResponse || [] : data?.resolved || [];
  const choose = (item: ResponseWorkflowItem) => { setSelected(item); setError(null); };
  const summary = data?.summary;
  const needsCount = summary?.needsResponse ?? 0;
  return <>
    <section className="response-workflow-entry"><button type="button" onClick={() => setOpen(!open)}><span className="response-workflow-icon"><LearnTraceIcon name="messages" /></span><span><b>Needs a response</b><small>{summary ? `${needsCount} conversation${needsCount === 1 ? '' : 's'} to review` : 'Load response workflow'}</small></span><strong>Review ›</strong></button></section>
    {open && <section className="response-workflow-panel"><div className="category-panel-heading"><div><span className="category-detail-label"><LearnTraceIcon name="messages" size={16} /> Needs a response</span><h3>Meaningful learner conversations that may still need your attention.</h3></div><button type="button" className="text-button" onClick={() => setOpen(false)}>Close</button></div>{!summary ? <p className="workflow-empty">{error || 'Loading response workflow…'}</p> : <><div className="workflow-tabs"><button className={tab === 'needs' ? 'active' : ''} onClick={() => setTab('needs')}>Needs response <b>{summary.needsResponse}</b></button><button className={tab === 'resolved' ? 'active' : ''} onClick={() => setTab('resolved')}>Resolved <b>{summary.resolved}</b></button></div>{items.length ? <div className="workflow-list">{items.map((item) => <button type="button" key={item.workflowId} className={`workflow-row workflow-${item.priority}`} onClick={() => choose(item)}><em>{item.priority}</em><strong>{item.title}</strong><p>{item.normalizedNeed || 'Review the supporting learner comments.'}</p><small>{item.supportingCommentIds.length} learner{item.supportingCommentIds.length === 1 ? '' : 's'} · {item.sourceCategory.replace('_', ' ')}</small><span>Draft reply ›</span></button>)}</div> : <p className="workflow-empty">No actionable learner conversations need a response yet.</p>}</>}</section>}
    {selected && <ResponseWorkflowDrawer item={selected} videoId={videoId} onClose={() => setSelected(null)} onUpdated={async () => { await load(); setSelected(null); }} />}
  </>;
}
