import { useMemo, useState } from 'react';
import { getResponseWorkflow, restoreResponseWorkflow, snoozeResponseWorkflow } from '../services/api';
import { ChannelActionQueue, ChannelActionQueueItem, ResponseWorkflowItem } from '../types';
import { ResponseWorkflowDrawer, WorkflowDrawerAction } from './ResponseWorkflowDrawer';

const QUEUE_ACRONYMS = new Set(['ai', 'api', 'gcp', 'sql', 'ui', 'ux']);
const queueTitle = (value: string) => value.replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => {
  const lower = word.toLowerCase();
  return QUEUE_ACRONYMS.has(lower) ? lower.toUpperCase() : `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
});

// Channel tasks may combine several underlying workflows. Their visual evidence tier
// must reflect the combined learner count, not the priority of the first workflow.
const evidenceTier = (item: ChannelActionQueueItem) => (
  item.supportingLearners >= 3 ? 'attention' : item.supportingLearners >= 2 ? 'repeated' : 'individual'
);

export function ChannelActionQueuePanel({ queue }: { queue: ChannelActionQueue }) {
  const [showSnoozed, setShowSnoozed] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedQueueItem, setSelectedQueueItem] = useState<ChannelActionQueueItem | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<ResponseWorkflowItem | null>(null);
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(() => new Set());
  const [restoredIds, setRestoredIds] = useState<Set<string>>(() => new Set());
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());
  const [pendingActions, setPendingActions] = useState<Record<string, 'details' | 'snoozed' | 'restored'>>({});
  const [error, setError] = useState<string | null>(null);

  const openItems = useMemo(() => [
    ...queue.items,
    ...queue.snoozedItems.filter((item) => restoredIds.has(item.workflowId)),
  ].filter((item) => !snoozedIds.has(item.workflowId) && !resolvedIds.has(item.workflowId)), [queue.items, queue.snoozedItems, resolvedIds, restoredIds, snoozedIds]);
  const snoozedItems = useMemo(() => [
    ...queue.snoozedItems,
    ...queue.items.filter((item) => snoozedIds.has(item.workflowId)),
  ].filter((item) => !restoredIds.has(item.workflowId) && !resolvedIds.has(item.workflowId)), [queue.items, queue.snoozedItems, resolvedIds, restoredIds, snoozedIds]);
  const sourceItems = showSnoozed ? snoozedItems : openItems;
  const visibleItems = selectedVideoId ? sourceItems.filter((item) => item.videoId === selectedVideoId) : sourceItems;
  const byVideo = useMemo(() => {
    const grouped = new Map<string, { videoId: string; title: string; value: number }>();
    sourceItems.forEach((item) => grouped.set(item.videoId, { videoId: item.videoId, title: item.videoTitle, value: (grouped.get(item.videoId)?.value || 0) + 1 }));
    return [...grouped.values()].sort((a, b) => b.value - a.value || a.title.localeCompare(b.title));
  }, [sourceItems]);
  const byType = useMemo(() => {
    const grouped = new Map<string, number>();
    sourceItems.forEach((item) => grouped.set(item.actionType, (grouped.get(item.actionType) || 0) + 1));
    return [...grouped.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  }, [sourceItems]);
  const total = Math.max(sourceItems.length, 1);
  const circumference = 2 * Math.PI * 42;
  let offset = 0;

  const applyAction = (item: ChannelActionQueueItem, action: WorkflowDrawerAction) => {
    if (action === 'resolved') setResolvedIds((current) => new Set([...current, item.workflowId]));
    if (action === 'snoozed') {
      setSnoozedIds((current) => new Set([...current, item.workflowId]));
      setRestoredIds((current) => { const next = new Set(current); next.delete(item.workflowId); return next; });
    }
    if (action === 'restored') {
      setRestoredIds((current) => new Set([...current, item.workflowId]));
      setSnoozedIds((current) => { const next = new Set(current); next.delete(item.workflowId); return next; });
    }
  };
  const updateQueueItem = async (item: ChannelActionQueueItem, action: 'snoozed' | 'restored') => {
    setPendingActions((current) => ({ ...current, [item.workflowId]: action })); setError(null);
    try {
      await Promise.all(item.workflowIds.map((workflowId) => action === 'snoozed'
        ? snoozeResponseWorkflow(item.videoId, workflowId)
        : restoreResponseWorkflow(item.videoId, workflowId)));
      applyAction(item, action);
    } catch (err) { setError(err instanceof Error ? err.message : `Could not ${action === 'snoozed' ? 'snooze' : 'restore'} this follow-up.`); }
    finally { setPendingActions((current) => { const next = { ...current }; delete next[item.workflowId]; return next; }); }
  };
  const openTask = async (item: ChannelActionQueueItem) => {
    setPendingActions((current) => ({ ...current, [item.workflowId]: 'details' })); setError(null);
    try {
      const data = await getResponseWorkflow(item.videoId);
      const candidates = showSnoozed ? data.snoozed || [] : data.needsResponse || [];
      const workflow = candidates.find((candidate) => item.workflowIds.includes(candidate.workflowId));
      if (!workflow) throw new Error('This task changed after the latest analysis. Refresh the channel and try again.');
      setSelectedQueueItem(item); setSelectedWorkflow(workflow);
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load task details.'); }
    finally { setPendingActions((current) => { const next = { ...current }; delete next[item.workflowId]; return next; }); }
  };
  const switchTab = (next: boolean) => { setShowSnoozed(next); setSelectedVideoId(null); setSelectedQueueItem(null); setSelectedWorkflow(null); setError(null); };

  return <section className="channel-action-queue">
    <div className="channel-action-queue-heading"><div><h2>Channel action queue</h2><p>{showSnoozed ? 'Follow-ups set aside for later.' : 'Open audience follow-ups across every analyzed video.'}</p></div><strong>{sourceItems.length} {showSnoozed ? 'snoozed' : 'pending'}</strong></div>
    <div className="channel-queue-tabs"><button type="button" className={!showSnoozed ? 'active' : ''} onClick={() => switchTab(false)}>Open {openItems.length}</button><button type="button" className={showSnoozed ? 'active' : ''} onClick={() => switchTab(true)}>Snoozed {snoozedItems.length}</button></div>
    {sourceItems.length === 0 ? <div className="channel-empty"><strong>No {showSnoozed ? 'snoozed' : 'pending'} follow-ups.</strong></div> : <>
      <div className="channel-action-queue-content"><div className="channel-action-donut-wrap"><svg className="channel-action-donut" viewBox="0 0 120 120" role="img" aria-label={`${showSnoozed ? 'Snoozed' : 'Pending'} tasks split by video`}><circle cx="60" cy="60" r="42" fill="none" stroke="rgba(148,163,184,.16)" strokeWidth="16" />{byVideo.map((video, index) => { const length = circumference * video.value / total; const circle = <circle key={video.videoId} cx="60" cy="60" r="42" fill="none" stroke={`var(--channel-queue-${index % 5})`} strokeWidth="16" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" className={selectedVideoId && selectedVideoId !== video.videoId ? 'muted' : ''} onClick={() => setSelectedVideoId((current) => current === video.videoId ? null : video.videoId)} />; offset += length; return circle; })}<text x="60" y="57" textAnchor="middle" className="channel-action-donut-total">{sourceItems.length}</text><text x="60" y="70" textAnchor="middle" className="channel-action-donut-label">{showSnoozed ? 'snoozed' : 'pending'}</text></svg><small>Click a segment to focus on one video.</small></div><div className="channel-action-breakdown"><h3>By video</h3>{byVideo.map((video, index) => <button type="button" key={video.videoId} className={selectedVideoId === video.videoId ? 'active' : ''} onClick={() => setSelectedVideoId((current) => current === video.videoId ? null : video.videoId)}><i style={{ background: `var(--channel-queue-${index % 5})` }} /><span>{video.title}</span><strong>{video.value}</strong></button>)}<h3>Action types</h3><div className="channel-action-types">{byType.map((type) => <span key={type.label}>{type.label}<b>{type.value}</b></span>)}</div></div></div>
      <div className="channel-action-items"><h3>{showSnoozed ? 'Snoozed follow-ups' : selectedVideoId ? 'Pending for selected video' : 'Highest-priority follow-ups'}</h3><div className="channel-queue-rows">{visibleItems.slice(0, 8).map((item, index) => { const pendingAction = pendingActions[item.workflowId]; const loadingDetails = pendingAction === 'details'; const loadingSnooze = pendingAction === 'snoozed'; const loadingRestore = pendingAction === 'restored'; const tier = evidenceTier(item); const tierClass = tier === 'attention' ? 'priority-evidence-attention priority-high' : tier === 'repeated' ? 'priority-evidence-repeated' : 'priority-evidence-individual'; const tierLabel = tier === 'attention' ? 'NEEDS ATTENTION' : tier === 'repeated' ? 'REPEATED' : 'FOLLOW-UP'; return <article className={`priority-item channel-queue-card ${tierClass}`} key={item.workflowId}><button type="button" className="channel-queue-card-main" onClick={() => void openTask(item)} disabled={Boolean(pendingAction)}><span className="priority-number">{String(index + 1).padStart(2, '0')}</span><span className="priority-copy"><span className="priority-category">{showSnoozed ? 'SNOOZED' : tierLabel}</span><strong>{queueTitle(item.title)}</strong><small>{item.supportingLearners} learner{item.supportingLearners === 1 ? '' : 's'} · {item.videoTitle}</small></span></button><span className="channel-queue-card-actions">{showSnoozed ? <button type="button" className="restore" onClick={() => void updateQueueItem(item, 'restored')} disabled={Boolean(pendingAction)}>{loadingRestore ? 'Restoring…' : 'Restore'}</button> : <button type="button" className="snooze" onClick={() => void updateQueueItem(item, 'snoozed')} disabled={Boolean(pendingAction)}>{loadingSnooze ? 'Saving…' : 'Snooze'}</button>}<button type="button" className="view-details" onClick={() => void openTask(item)} disabled={Boolean(pendingAction)}>{loadingDetails ? 'Loading…' : 'View details →'}</button></span></article>; })}</div></div>
    </>}
    {error && <p className="channel-action-error">{error}</p>}
    {selectedQueueItem && selectedWorkflow && <ResponseWorkflowDrawer item={selectedWorkflow} videoId={selectedQueueItem.videoId} workflowIds={selectedQueueItem.workflowIds} onClose={() => { setSelectedQueueItem(null); setSelectedWorkflow(null); }} onUpdated={(action) => { applyAction(selectedQueueItem, action); setSelectedQueueItem(null); setSelectedWorkflow(null); }} />}
  </section>;
}
