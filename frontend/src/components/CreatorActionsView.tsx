import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { assessCreatorReply, generateConceptDiagnosis, generateResponseDraft, getConceptDiagnosis, getCreatorActions, getResponseWorkflow, setResponseWorkflowResolution } from '../services/api';
import { AiInterpretation, CreatorAction, CreatorActionsResponse, CreatorReplyContext, ResponseDraftMode, ResponseWorkflowItem } from '../types';
import { LearnTraceIcon, LearnTraceIconName } from './LearnTraceIcon';

interface CreatorActionsViewProps { videoId: string; }

type CategoryKey = 'learning' | 'technical' | 'curriculum_navigation' | 'content_opportunity' | 'actionable_feedback' | 'positive_signal';

function draftLabel(mode: ResponseDraftMode): string {
  return ({
    individual_reply: 'Draft a reply', public_clarification: 'Draft a clarification', technical_fix: 'Draft a fix',
    learning_path_guidance: 'Draft guidance', request_acknowledgement: 'Draft acknowledgement', feedback_acknowledgement: 'Draft acknowledgement',
  })[mode];
}

function draftDescription(mode: ResponseDraftMode): string {
  return mode === 'public_clarification' || mode === 'technical_fix' || mode === 'learning_path_guidance'
    ? 'This is written as a standalone explanation for multiple viewers.'
    : 'Review and edit before posting.';
}

interface CategoryDefinition {
  key: CategoryKey;
  label: string;
  icon: Extract<LearnTraceIconName, 'learning' | 'content' | 'feedback' | 'positive' | 'technical' | 'path'>;
  heading: string;
  description: string;
  cta: string;
  countLabel: (data: CreatorActionsResponse) => string;
  actions: (data: CreatorActionsResponse) => CreatorAction[];
  count: (data: CreatorActionsResponse) => number;
  secondary?: (data: CreatorActionsResponse) => string | null;
}

const categories: CategoryDefinition[] = [
  { key: 'learning', label: 'Learning', icon: 'learning', heading: 'What are learners asking?', description: 'Questions and difficulties learners raised while following the lesson.', cta: 'Explore', countLabel: () => 'learner questions', actions: (data) => data.learningInsights || [], count: (data) => data.audienceOverview?.learning || 0, secondary: (data) => `${data.audienceOverview?.recurringLearningQuestions || 0} repeated` },
  { key: 'technical', label: 'Code & Setup', icon: 'technical', heading: 'Code & Setup', description: 'Problems learners reported while trying to follow or run the example.', cta: 'Explore', countLabel: () => 'reported issues', actions: (data) => data.technicalBarriers || [], count: (data) => data.audienceOverview?.technical || 0 },
  { key: 'curriculum_navigation', label: 'Course & Learning Path', icon: 'path', heading: 'Questions about the course', description: 'Questions about prerequisites, sequence, scope, and what to learn next.', cta: 'Explore', countLabel: () => 'learner questions', actions: (data) => data.curriculumNavigation || [], count: (data) => data.audienceOverview?.curriculum_navigation || 0 },
  { key: 'content_opportunity', label: 'Content Requests', icon: 'content', heading: 'What do learners want next?', description: 'Requested future coverage and follow-up material.', cta: 'Explore', countLabel: () => 'things learners want', actions: (data) => data.contentOpportunities || [], count: (data) => data.audienceOverview?.content_opportunity || 0, secondary: (data) => categoryTopicSummary(data.contentOpportunities || [], 'trending') },
  { key: 'actionable_feedback', label: 'Video Feedback', icon: 'feedback', heading: 'What could be improved?', description: 'Common suggestions about the explanation, presentation, examples, or video experience.', cta: 'Explore', countLabel: () => 'useful suggestions', actions: (data) => data.improvementOpportunities || [], count: (data) => data.audienceOverview?.actionable_feedback || 0, secondary: (data) => repeatedThemeSummary(data.improvementOpportunities || []) },
  { key: 'positive_signal', label: 'What Worked', icon: 'positive', heading: 'What worked well?', description: 'Specific teaching approaches learners responded to positively.', cta: 'Explore', countLabel: () => 'positive comments', actions: (data) => data.positiveSignals || [], count: (data) => data.audienceOverview?.positive_signal || 0, secondary: (data) => specificThemeSummary(data.positiveSignals || []) },
];

function categoryTopicSummary(actions: CreatorAction[], prefix: string): string | null {
  const strongest = [...actions].sort((a, b) => b.supportingSignalCount - a.supportingSignalCount)[0];
  if (!strongest) return null;
  const topic = actionLabel(strongest).toLowerCase();
  return prefix === 'trending' ? `${strongest.supportingSignalCount} trending` : `${prefix} ${topic}`;
}

function repeatedThemeSummary(actions: CreatorAction[]): string | null {
  const repeated = actions.filter((action) => action.supportingSignalCount >= 2).length;
  return repeated ? `${repeated} repeated` : null;
}

function specificThemeSummary(actions: CreatorAction[]): string | null {
  const strengths = actions.filter((action) => !action.isGeneralPositive);
  if (!strengths.length) return null;
  const specificComments = strengths.reduce((sum, action) => sum + action.supportingSignalCount, 0);
  return `${specificComments} specific comment${specificComments === 1 ? '' : 's'} · ${strengths.length} strength${strengths.length === 1 ? '' : 's'}`;
}

const TECHNICAL_ACRONYMS = new Set(['ai', 'api', 'css', 'dsa', 'dp', 'html', 'json', 'sql', 'ui', 'ux']);

/** Formats stored labels for people without mutating the source data. */
function formatDisplayLabel(value: string): string {
  return value.replace(/[A-Za-z][A-Za-z0-9]*/g, (word) => {
    if (word.length > 1 && word === word.toUpperCase()) return word;
    const lower = word.toLowerCase();
    if (TECHNICAL_ACRONYMS.has(lower)) return lower.toUpperCase();
    return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
  });
}

function actionLabel(action: CreatorAction): string {
  return formatDisplayLabel(action.concept || action.title);
}

/** Uses only stored semantic fields; this does not infer a question from raw text. */
function courseQuestion(action: CreatorAction): string | null {
  return action.category === 'curriculum_navigation' && action.canonicalQuestion?.trim()
    ? action.canonicalQuestion.trim()
    : null;
}

function courseActionTitle(action: CreatorAction): string {
  const title = actionLabel(action);
  return ['curriculum navigation signal', 'curriculum navigation', 'navigation signal', 'learning path'].includes(title.toLowerCase())
    ? 'Course guidance question'
    : title;
}

function isPriority(action: CreatorAction): boolean {
  if (action.category === 'learning') return action.evidenceStrength === 'strong' || action.evidenceStrength === 'recurring';
  return action.supportingSignalCount >= 2 && ['technical', 'curriculum_navigation', 'content_opportunity', 'actionable_feedback'].includes(action.category);
}

export function CreatorActionsView({ videoId }: CreatorActionsViewProps) {
  const [data, setData] = useState<CreatorActionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [openInsight, setOpenInsight] = useState<string | null>(null);
  const [responseItems, setResponseItems] = useState<ResponseWorkflowItem[]>([]);
  const [responseFilter, setResponseFilter] = useState<'all' | 'needs'>('all');
  const categoryPanelRef = useRef<HTMLElement>(null);
  const refreshResponseWorkflow = () => getResponseWorkflow(videoId)
    .then((result) => setResponseItems([...(result.needsResponse || []), ...(result.resolved || [])]))
    .catch(() => undefined);

  useEffect(() => {
    let active = true;
    setData(null); setError(null); setSelectedCategory(null); setOpenInsight(null); setResponseItems([]); setResponseFilter('all');
    void getCreatorActions(videoId)
      .then((result) => { if (active) setData(result); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load audience insights.'); });
    void getResponseWorkflow(videoId).then((result) => { if (active) setResponseItems([...(result.needsResponse || []), ...(result.resolved || [])]); }).catch(() => undefined);
    return () => { active = false; };
  }, [videoId]);

  const visibleCategories = useMemo(() => data ? categories.filter((category) => category.count(data) > 0) : [], [data]);
  const responseByInsight = useMemo(() => new Map(responseItems.map((item) => [item.sourceInsightId, item])), [responseItems]);
  const creatorRepliesByInsight = useMemo(() => new Map((data?.creatorReplies || []).map((reply) => [reply.sourceInsightId, reply])), [data]);
  const needsResponse = useMemo(() => responseItems.filter((item) => item.resolutionStatus === 'needs_response' || item.resolutionStatus === 'unclear'), [responseItems]);
  const priorities = useMemo(() => data ? (data.creatorActions || []).filter(isPriority).slice(0, 3) : [], [data]);
  const chooseCategory = (category: CategoryKey, insightId: string | null = null, shouldScroll = true) => {
    if (!insightId && selectedCategory === category) {
      setSelectedCategory(null); setOpenInsight(null); return;
    }
    setSelectedCategory(category); setOpenInsight(insightId);
    if (shouldScroll) window.setTimeout(() => categoryPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  if (error) return <section className="creator-actions-section"><div className="notice-banner error-banner">{error}</div></section>;
  if (!data?.audienceOverview) return <section className="creator-actions-section"><p className="section-secondary-text">Preparing your audience overview…</p></section>;
  const selected = categories.find((category) => category.key === selectedCategory) || null;
  const responseFilteredItems = responseFilter === 'needs' ? needsResponse : responseItems;
  const selectedActions = selected ? selected.actions(data).filter((action) => responseFilter === 'all' || responseFilteredItems.some((item) => item.sourceInsightId === action.id)) : [];
  const selectedInsight = (data.creatorActions || []).find((action) => action.id === openInsight) || null;

  return <section className="creator-actions-section">
    {priorities.length > 0 && <section className="priority-section">
      <div className="priority-heading-row"><h3 className="priority-heading"><LearnTraceIcon name="flame" size={20} /> Worth your attention</h3></div>
      <p className="priority-supporting-copy">Repeated or actionable patterns from the conversations analyzed.</p>
      <div className="priority-list">{priorities.map((action, index) => <PriorityItem key={action.id} action={action} response={responseByInsight.get(action.id)} index={index} onReview={() => {
        setSelectedCategory(action.category as CategoryKey); setOpenInsight(action.id);
      }} />)}</div>
    </section>}

    <section className="audience-explorer">
      <div className="audience-explorer-heading"><h3 className="audience-explorer-title">Explore your audience</h3><div className="response-filter"><button type="button" className={responseFilter === 'all' ? 'active' : ''} onClick={() => setResponseFilter('all')}>All insights</button><button type="button" className={responseFilter === 'needs' ? 'active' : ''} onClick={() => { setResponseFilter('needs'); void refreshResponseWorkflow(); }}>Needs response <b>{needsResponse.length}</b></button></div></div>
      <div className="category-grid">{visibleCategories.map((category) => <button type="button" className={`category-card category-${category.key} ${selectedCategory === category.key ? 'selected' : ''}`} key={category.key} onClick={() => chooseCategory(category.key)} aria-pressed={selectedCategory === category.key}>
        <span className="category-heading"><span className="category-icon" aria-hidden="true"><LearnTraceIcon name={category.icon} /></span><span className="category-label">{category.label}</span></span>
        <strong>{category.count(data).toLocaleString()}</strong>
        <span className="category-count-label">{category.countLabel(data)}</span>
        {responseFilter === 'needs' ? <span className="category-secondary">{responseFilteredItems.filter((item) => item.sourceCategory === category.key).length} need response</span> : category.secondary && <span className="category-secondary">{category.secondary(data)}</span>}
        <span className="category-cta">{category.cta}</span>
      </button>)}</div>
    </section>

    {selected && <section className="category-panel" ref={categoryPanelRef} tabIndex={-1}>
      <div className="category-panel-heading"><div><span className="category-detail-label">{selected.key === 'actionable_feedback' || selected.key === 'positive_signal' || selected.key === 'curriculum_navigation' ? <><LearnTraceIcon name={selected.icon} size={16} /> {selected.label}</> : selected.label}</span><h3>{selected.heading}</h3><p>{selected.description}</p></div><button type="button" className="text-button" onClick={() => { setSelectedCategory(null); setOpenInsight(null); }}>Close</button></div>
      {selected.key === 'learning' && <LearningGroups actions={selectedActions} onOpen={setOpenInsight} compact={Boolean(openInsight)} />}
      {selected.key !== 'learning' && (selected.key === 'actionable_feedback' || selected.key === 'positive_signal'
        ? <ThemeRows actions={selectedActions} category={selected.key} onOpen={setOpenInsight} />
        : <CategoryActionCarousel actions={selectedActions} onOpen={setOpenInsight} creatorReplies={creatorRepliesByInsight} responseItems={responseByInsight} videoId={videoId} showReplyTools={responseFilter === 'needs'} />)}
    </section>}
    {selectedInsight && <InsightDrawer action={selectedInsight} response={responseByInsight.get(selectedInsight.id)} creatorReply={creatorRepliesByInsight.get(selectedInsight.id)} videoId={videoId} onClose={() => setOpenInsight(null)} onWorkflowUpdated={() => { setOpenInsight(null); void refreshResponseWorkflow(); }} />}
  </section>;
}

const GENERIC_PRIORITY_TITLES = new Set([
  'improvement opportunity', 'content opportunity', 'creator feedback', 'curriculum navigation signal',
  'curriculum navigation', 'course learning path', 'technical barrier', 'learning opportunity',
  'learning friction opportunity', 'learning friction', 'recurring learning question', 'what worked',
  'presentation feedback', 'other feedback', 'positive feedback',
]);

function priorityDisplayTitle(action: CreatorAction): string {
  const semanticTitle = [action.concept, action.canonicalQuestion]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => formatDisplayLabel(value.trim()))
    .find((value) => !GENERIC_PRIORITY_TITLES.has(value.toLowerCase()));
  return semanticTitle || formatDisplayLabel(action.title);
}

function priorityCategory(action: CreatorAction): { label: string; icon: LearnTraceIconName; count: string } {
  const count = action.supportingSignalCount;
  const learners = `${count} learner${count === 1 ? '' : 's'}`;
  switch (action.category) {
    case 'learning': return { label: 'Learning', icon: 'learning', count: action.learningFrictionScore !== null ? `${learners} are struggling with this` : `${learners} asked something similar` };
    case 'actionable_feedback': return { label: 'Video feedback', icon: 'feedback', count: `${learners} mentioned this` };
    case 'content_opportunity': return { label: 'Content request', icon: 'content', count: `${learners} requested this` };
    case 'technical': return { label: 'Code & setup', icon: 'technical', count: `${learners} reported this` };
    case 'curriculum_navigation': return { label: 'Course & learning path', icon: 'path', count: `${learners} asked about this` };
    default: return { label: action.title, icon: 'comment', count: `${learners} mentioned this` };
  }
}

function PriorityItem({ action, response, index, onReview }: { action: CreatorAction; response?: ResponseWorkflowItem; index: number; onReview: () => void }) {
  const category = priorityCategory(action);
  const severeLearning = action.category === 'learning' && ['High', 'Critical'].includes(action.learningFrictionStatus || '');
  return <button type="button" className={`priority-item priority-category-${action.category} ${severeLearning ? 'priority-high' : ''}`} onClick={onReview}><span className="priority-number">{String(index + 1).padStart(2, '0')}</span><span className="priority-copy"><span className="priority-category"><LearnTraceIcon name={category.icon} size={14} /> {category.label}</span><strong>{priorityDisplayTitle(action)}</strong><small>{category.count}</small>{response?.resolutionStatus === 'needs_response' && <em className="response-status-pill">Needs response</em>}</span><span className="priority-chevron">›</span></button>;
}


type LearningTab = 'attention' | 'repeated' | 'individual';

function learningEvidenceLevel(action: CreatorAction): LearningTab {
  if (action.supportingSignalCount >= 3 || action.learningFrictionScore !== null || action.evidenceStrength === 'strong') return 'attention';
  if (action.supportingSignalCount >= 2 || action.evidenceStrength === 'recurring') return 'repeated';
  return 'individual';
}

function LearningGroups({ actions, onOpen, compact }: { actions: CreatorAction[]; onOpen: (id: string) => void; compact: boolean }) {
  const [tab, setTab] = useState<LearningTab>('attention');
  const [page, setPage] = useState(0);
  const groups: Record<LearningTab, CreatorAction[]> = {
    attention: actions.filter((action) => learningEvidenceLevel(action) === 'attention'),
    repeated: actions.filter((action) => learningEvidenceLevel(action) === 'repeated'),
    individual: actions.filter((action) => learningEvidenceLevel(action) === 'individual'),
  };
  const tabs: Array<{ key: LearningTab; label: string; detail: string }> = [
    { key: 'attention', label: 'Needs attention', detail: '3+' },
    { key: 'repeated', label: 'Repeated', detail: '2' },
    { key: 'individual', label: 'Individual', detail: '1' },
  ];
  const activeActions = groups[tab];
  const pageSize = compact ? 4 : 6;
  const pageCount = Math.max(1, Math.ceil(activeActions.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleActions = activeActions.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useEffect(() => { setPage(0); }, [tab, pageSize]);
  const emptyMessage: Record<LearningTab, string> = {
    attention: 'No learning questions have enough independent evidence to need attention yet.',
    repeated: 'No repeated learner questions yet. LearnTrace will surface them when a similar question appears again.',
    individual: 'No individual learner questions were found in the analyzed conversations.',
  };

  return <section className="learning-browser" aria-label="Learning questions by evidence level">
    <div className="learning-tabs" role="tablist" aria-label="Learning question categories">
      {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`learning-tab learning-tab-${item.key} ${tab === item.key ? 'active' : ''}`} onClick={() => setTab(item.key)}>
        <span><span className={`learning-tab-dots dots-${item.key}`} aria-hidden="true">{item.key === 'attention' ? '●●●' : item.key === 'repeated' ? '●●' : '●'}</span><strong>{item.label}</strong><small>{item.detail}{item.key === 'attention' ? '+ learners' : item.key === 'repeated' ? ' learners' : ' learner'}</small></span><b>{groups[item.key].length}</b>
      </button>)}
    </div>
    {visibleActions.length > 0 ? <>
      <div className={`learning-question-grid ${compact ? 'compact' : ''}`}>{visibleActions.map((action) => <InsightCard key={action.id} action={action} onOpen={() => onOpen(action.id)} />)}</div>
      {activeActions.length > pageSize && <nav className="learning-pagination" aria-label="Learning question pages">
        <button type="button" aria-label="Previous questions" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>←</button>
        <span>Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, activeActions.length)} of {activeActions.length}</span>
        <span className="pagination-dots" aria-hidden="true">{Array.from({ length: pageCount }, (_, index) => <i key={index} className={index === currentPage ? 'active' : ''} />)}</span>
        <button type="button" aria-label="Next questions" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage === pageCount - 1}>→</button>
      </nav>}
    </> : <p className="learning-empty-state">{emptyMessage[tab]}</p>}
  </section>;
}

function InsightCard({ action, onOpen }: { action: CreatorAction; onOpen: () => void }) {
  const learning = action.category === 'learning';
  const evidenceLevel = learning ? learningEvidenceLevel(action) : null;
  const isRepeated = evidenceLevel === 'repeated';
  const isAttention = evidenceLevel === 'attention';
  if (learning) return <button type="button" className={`insight-card learning-insight-card ${evidenceLevel}-insight`} onClick={onOpen} aria-label={`View details for ${actionLabel(action)} `}>
    <span className={`learning-card-status ${evidenceLevel}`}>{isAttention ? 'Needs attention' : isRepeated ? 'Repeated' : 'Individual'}</span>
    <h4>{actionLabel(action)}</h4>
    <p className="section-secondary-text">{action.supportingSignalCount} learner{action.supportingSignalCount === 1 ? ' asked this' : 's asked something similar'}.</p>
    <span className="insight-open">›</span>
  </button>;
  return <button type="button" className="insight-card" onClick={onOpen} aria-label={`View details for ${actionLabel(action)}`}>
    <span className="insight-kind">{action.learningFrictionScore !== null ? 'Learning difficulty' : isRepeated ? 'Repeated question' : learning ? 'Learner question' : action.title}</span>
    <h4>{actionLabel(action)}</h4>
    <p className="insight-summary">{learning && action.evidence[0]?.commentText ? `“${action.evidence[0].commentText}”` : action.summary}</p>
    <p className="section-secondary-text">{action.supportingSignalCount} learner{action.supportingSignalCount === 1 ? ' asked this' : 's raised this'}{isRepeated ? ' or something similar' : ''}.</p>
    <span className="insight-open">See details →</span>
  </button>;
}

const CATEGORY_ICONS: Record<Exclude<CategoryKey, 'learning'>, LearnTraceIconName> = {
  technical: 'technical',
  curriculum_navigation: 'path',
  content_opportunity: 'content',
  actionable_feedback: 'feedback',
  positive_signal: 'positive',
};

function actionKind(action: CreatorAction): string {
  if (action.category === 'content_opportunity') return action.supportingSignalCount >= 2 ? 'Trending request' : 'Content request';
  if (action.category === 'actionable_feedback') return 'Creator feedback';
  if (action.category === 'positive_signal') return 'What worked';
  if (action.category === 'technical') return 'Technical barrier';
  if (action.category === 'curriculum_navigation') return 'Course & Learning Path';
  return 'Audience signal';
}

function displayActionTitle(action: CreatorAction): string {
  if (action.category === 'curriculum_navigation') return courseActionTitle(action);
  const title = actionLabel(action);
  if (action.category === 'content_opportunity' && ['content opportunity', 'content request'].includes(title.toLowerCase())) return 'Learner request';
  if (action.category === 'actionable_feedback' && ['feedback', 'improvement opportunity', 'presentation feedback'].includes(title.toLowerCase())) return 'Individual feedback';
  if (action.category === 'positive_signal' && ['what worked', 'positive response', 'positive signal'].includes(title.toLowerCase())) return 'Positive Feedback';
  return title;
}

function isGenericFeedback(action: CreatorAction): boolean {
  return action.category === 'actionable_feedback' && displayActionTitle(action) === 'Individual feedback';
}

function ThemeRows({ actions, category, onOpen }: { actions: CreatorAction[]; category: 'actionable_feedback' | 'positive_signal'; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(0);
  const positive = category === 'positive_signal';
  const pageSize = positive ? 5 : 4;
  const pageCount = Math.max(1, Math.ceil(actions.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleActions = actions.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useEffect(() => { setPage(0); }, [actions]);
  if (!actions.length) return <p className="learning-empty-state">{positive ? "Learners responded positively, but there isn't enough specific feedback yet to identify a clear teaching strength." : 'No specific themes are available yet.'}</p>;
  return <section className={`theme-row-list ${positive ? 'theme-row-positive' : 'theme-row-feedback'}`} aria-label={positive ? 'What worked themes' : 'Video feedback themes'}>
    {visibleActions.map((action) => {
      const genericFeedback = isGenericFeedback(action);
      const rowTitle = genericFeedback ? 'Individual feedback' : displayActionTitle(action);
      const rowSummary = genericFeedback ? action.evidence[0]?.commentText || action.summary : action.summary;
      return <button type="button" key={action.id} className={`theme-row ${action.isGeneralPositive ? 'theme-row-general-positive' : ''}`} onClick={() => onOpen(action.id)} aria-label={`View ${rowTitle}`}>
      <span className="theme-row-icon"><LearnTraceIcon name={positive ? 'positive' : 'feedback'} size={21} /></span>
      <span className="theme-row-copy"><strong>{rowTitle}</strong><small>{rowSummary}</small></span>
      <span className="theme-row-meta"><em>{positive ? (action.isGeneralPositive ? 'General appreciation' : action.supportingSignalCount >= 2 ? 'Positive pattern' : 'One positive comment') : (genericFeedback ? 'Individual comment' : action.supportingSignalCount >= 2 ? 'Repeated' : 'One suggestion')}</em><small>{action.supportingSignalCount} comment{action.supportingSignalCount === 1 ? '' : 's'} mentioned this</small></span>
      <span className="theme-row-chevron">›</span>
    </button>;
    })}
    {actions.length > pageSize && <nav className="theme-row-pagination" aria-label="Theme pages"><button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>←</button><span className="pagination-dots" aria-hidden="true">{Array.from({ length: pageCount }, (_, item) => <i key={item} className={item === currentPage ? 'active' : ''} />)}</span><span>{currentPage + 1} of {pageCount}</span><button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage === pageCount - 1}>→</button></nav>}
  </section>;
}

function CategoryActionCarousel({ actions, onOpen, creatorReplies, responseItems, videoId, showReplyTools }: { actions: CreatorAction[]; onOpen: (id: string) => void; creatorReplies: Map<string, CreatorReplyContext>; responseItems: Map<string, ResponseWorkflowItem>; videoId: string; showReplyTools: boolean }) {
  const [index, setIndex] = useState(0);
  const [inlineDraft, setInlineDraft] = useState('');
  const [draftingInline, setDraftingInline] = useState(false);
  const [inlineDraftError, setInlineDraftError] = useState<string | null>(null);
  const actionIdentity = actions.map((item) => item.id).join('|');
  const activeIndex = Math.min(index, Math.max(0, actions.length - 1));
  const action = actions[activeIndex];
  // `actions` is often a freshly filtered array. Reset only when its actual
  // contents change, never just because opening a drawer caused a re-render.
  useEffect(() => { setIndex(0); }, [actionIdentity]);
  if (!action) return <p className="learning-empty-state">No audience signals in this category yet.</p>;
  const icon = CATEGORY_ICONS[action.category as Exclude<CategoryKey, 'learning'>] || 'content';
  const normalizedCourseQuestion = courseQuestion(action);
  const quote = normalizedCourseQuestion || action.evidence[0]?.commentText;
  const isSingleContentRequest = action.category === 'content_opportunity' && action.supportingSignalCount === 1;
  const creatorReply = creatorReplies.get(action.id);
  const responseItem = responseItems.get(action.id);
  const createInlineDraft = async (regenerate = false) => {
    if (!responseItem || draftingInline) return;
    setDraftingInline(true); setInlineDraftError(null);
    try { const result = await generateResponseDraft(videoId, responseItem.workflowId, responseItem.primaryDraftMode, regenerate); setInlineDraft(result.draft?.draft_text || ''); }
    catch (error) { setInlineDraftError(error instanceof Error ? error.message : 'Could not draft a reply.'); }
    finally { setDraftingInline(false); }
  };
  const cardContent = <>
    <span className="category-feature-icon"><LearnTraceIcon name={icon} size={31} /></span>
    <div className="category-feature-copy">
      <span className="category-feature-kind">{actionKind(action)}</span>
      <strong>{displayActionTitle(action)}</strong>
      <span className={`category-feature-evidence ${normalizedCourseQuestion ? 'normalized-course-question' : ''} ${isSingleContentRequest ? 'full-request-visible' : ''}`}>{quote ? normalizedCourseQuestion || `“${quote}”` : action.summary}</span>
      {isSingleContentRequest && creatorReply && <details className="inline-creator-reply"><summary><span>{creatorReply.avatarUrl ? <img src={creatorReply.avatarUrl} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <i>{(creatorReply.authorName || 'C').charAt(0).toUpperCase()}</i>}</span>{creatorReply.authorName || 'Video creator'} replied <b>⌄</b></summary><p>{creatorReply.text}</p></details>}
      <span className="category-feature-footer"><span><LearnTraceIcon name="users" size={16} /> {action.supportingSignalCount} learner{action.category === 'curriculum_navigation' ? (action.supportingSignalCount === 1 ? ' asked this' : 's asked something similar') : (action.supportingSignalCount === 1 ? '' : 's')} {action.category === 'content_opportunity' ? 'requested this' : action.category === 'curriculum_navigation' ? '' : 'raised this'}</span>{isSingleContentRequest && responseItem?.resolutionStatus !== 'resolved' && showReplyTools ? <button type="button" className="inline-draft-reply" onClick={() => void createInlineDraft()}>{draftingInline ? 'Writing a draft…' : responseItem?.hasDraft ? 'View saved draft' : 'Draft a reply ✦'}</button> : <em>{isSingleContentRequest && responseItem?.resolutionStatus !== 'resolved' ? 'Needs review' : isSingleContentRequest ? 'Shown inline' : action.category === 'curriculum_navigation' ? 'See original comment →' : 'View evidence →'}</em>}</span>
      {isSingleContentRequest && showReplyTools && inlineDraft && <div className="inline-draft-card"><label htmlFor={`inline-reply-${action.id}`}>Draft reply <small>Review before posting</small></label><textarea id={`inline-reply-${action.id}`} value={inlineDraft} onChange={(event) => setInlineDraft(event.target.value)} maxLength={900} /><div><button type="button" onClick={() => void createInlineDraft(true)}>Regenerate</button><button type="button" onClick={() => void navigator.clipboard?.writeText(inlineDraft)}>Copy reply</button></div></div>}
      {isSingleContentRequest && inlineDraftError && <p className="inline-draft-error">{inlineDraftError}</p>}
    </div>
  </>;
  return <section className={`category-action-carousel carousel-${action.category}`} aria-label={`${actionKind(action)} carousel`}>
    {isSingleContentRequest ? <article className="category-feature-card category-feature-static">{cardContent}</article> : <button type="button" className="category-feature-card" onClick={() => onOpen(action.id)} aria-label={`View details for ${actionLabel(action)}`}>{cardContent}</button>}
    {actions.length > 1 && <nav className="category-carousel-controls" aria-label="Category signals">
      <button type="button" aria-label="Previous signal" disabled={activeIndex === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>←</button>
      <span className="pagination-dots" aria-hidden="true">{actions.map((item, itemIndex) => <i key={item.id} className={itemIndex === activeIndex ? 'active' : ''} />)}</span>
      <span>{activeIndex + 1} of {actions.length}</span>
      <button type="button" aria-label="Next signal" disabled={activeIndex === actions.length - 1} onClick={() => setIndex((value) => Math.min(actions.length - 1, value + 1))}>→</button>
    </nav>}
  </section>;
}

function InsightDrawer({ action, response, creatorReply, videoId, onClose, onWorkflowUpdated }: { action: CreatorAction; response?: ResponseWorkflowItem; creatorReply?: CreatorReplyContext; videoId: string; onClose: () => void; onWorkflowUpdated: () => void }) {
  const [showComments, setShowComments] = useState(false);
  const [diagnosis, setDiagnosis] = useState<AiInterpretation | null>(null);
  const [diagnosisEligible, setDiagnosisEligible] = useState(false);
  const [diagnosisChecked, setDiagnosisChecked] = useState(false);
  const [diagnosisMessage, setDiagnosisMessage] = useState<string | null>(null);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [generatingDiagnosis, setGeneratingDiagnosis] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [activeDraftMode, setActiveDraftMode] = useState<ResponseDraftMode | null>(null);
  const [draftingReply, setDraftingReply] = useState(false);
  const [checkingCreatorReply, setCheckingCreatorReply] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const learning = action.category === 'learning';
  const feedback = action.category === 'actionable_feedback';
  const positive = action.category === 'positive_signal';
  const course = action.category === 'curriculum_navigation';
  const repeated = learning && (action.evidenceStrength === 'strong' || action.evidenceStrength === 'recurring');
  const hasInterpretation = learning && (action.source === 'phase6_ai' || Boolean(diagnosis));
  const status = hasInterpretation ? 'Needs attention' : repeated ? 'Repeated question' : learning ? 'Learner question' : feedback ? 'Video Feedback' : positive ? 'What Worked' : course ? 'Course & Learning Path' : action.title;
  const learnerQuestion = action.canonicalQuestion || action.evidence[0]?.commentText || null;
  const normalizedCourseQuestion = courseQuestion(action);
  const displayedAudienceRequest = course
    ? normalizedCourseQuestion
    : action.category === 'content_opportunity'
    ? action.canonicalQuestion || action.evidence[0]?.commentText
    : action.evidence[0]?.commentText;
  const usesCanonicalRequest = (action.category === 'content_opportunity' && Boolean(action.canonicalQuestion)) || Boolean(normalizedCourseQuestion);
  const supportingEvidence = usesCanonicalRequest ? action.evidence : action.evidence.slice(1);
  const recommendation = 'This question has come up more than once. Keep an eye on it as more comments are analyzed.';
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);
  useEffect(() => {
    document.body.classList.add('insight-drawer-open');
    return () => document.body.classList.remove('insight-drawer-open');
  }, []);
  useEffect(() => {
    let active = true;
    setDiagnosis(null); setDiagnosisEligible(false); setDiagnosisChecked(false); setDiagnosisMessage(null); setDiagnosisError(null);
    if (!learning || !action.concept) return () => { active = false; };
    void getConceptDiagnosis(videoId, action.concept)
      .then((result) => {
        if (!active) return;
        setDiagnosisChecked(true);
        setDiagnosisEligible(Boolean(result.eligible));
        setDiagnosisMessage(result.message || result.supportingText || null);
        setDiagnosis(result.interpretation || null);
      })
      .catch(() => { if (active) { setDiagnosisChecked(true); setDiagnosisMessage('AI interpretation eligibility could not be checked right now.'); } });
    return () => { active = false; };
  }, [action.id, action.concept, learning, videoId]);
  const countText = learning
    ? `${action.supportingSignalCount} learner${action.supportingSignalCount === 1 ? '' : 's'} ${repeated ? 'asked something similar' : 'asked this'}`
    : feedback || positive
      ? `${action.supportingSignalCount} comment${action.supportingSignalCount === 1 ? '' : 's'} mentioned this`
      : `${action.supportingSignalCount} learner${action.supportingSignalCount === 1 ? ' asked this' : 's asked something similar'}`;
  const trustText = feedback
    ? (action.supportingSignalCount >= 2 ? 'This feedback appeared in multiple meaningful audience comments.' : 'This is a specific audience comment that may be useful to review.')
    : positive
      ? (action.supportingSignalCount >= 2 ? 'Multiple learners independently praised this aspect of the lesson.' : 'This is a specific positive audience comment worth keeping in view.')
      : hasInterpretation ? 'Multiple learners independently raised a similar difficulty, and the existing evidence supports deeper interpretation.'
        : repeated ? 'This question appeared more than once, so LearnTrace is keeping it visible as a repeated learner question.'
          : 'A learner raised this question in the conversation around this video.';
  const courseTrustText = action.supportingSignalCount >= 2
    ? 'Multiple learners are asking about the same course guidance.'
    : 'This learner is asking about course guidance rather than expressing difficulty with the lesson itself.';
  const interpretationSummary = diagnosis?.possibleLearningGap || action.summary;
  const interpretationAction = diagnosis?.recommendedAction || action.suggestedAction;
  const generateInterpretation = async () => {
    if (!action.concept || generatingDiagnosis) return;
    setGeneratingDiagnosis(true); setDiagnosisError(null);
    try {
      const result = await generateConceptDiagnosis(videoId, action.concept);
      if (!result.eligible || !result.interpretation) throw new Error(result.message || 'AI interpretation is not available for this evidence yet.');
      setDiagnosis(result.interpretation);
      setDiagnosisEligible(true);
    } catch (error) {
      setDiagnosisError(error instanceof Error ? error.message : 'AI interpretation is temporarily unavailable.');
    } finally {
      setGeneratingDiagnosis(false);
    }
  };
  const draftReply = async (mode: ResponseDraftMode, regenerate = false) => {
    if (!response || draftingReply) return;
    setDraftingReply(true); setResponseError(null);
    try { const result = await generateResponseDraft(videoId, response.workflowId, mode, regenerate); setActiveDraftMode(mode); setReplyDraft(result.draft?.draft_text || ''); }
    catch (error) { setResponseError(error instanceof Error ? error.message : 'A reply draft is temporarily unavailable.'); }
    finally { setDraftingReply(false); }
  };
  const resolveResponse = async (resolved: boolean) => {
    if (!response) return;
    setResponseError(null);
    try { await setResponseWorkflowResolution(videoId, response.workflowId, resolved); onWorkflowUpdated(); }
    catch (error) { setResponseError(error instanceof Error ? error.message : 'Could not update response status.'); }
  };
  const checkCreatorReply = async () => {
    if (!response || !response.creatorReplyText || checkingCreatorReply) return;
    setCheckingCreatorReply(true); setResponseError(null);
    try { await assessCreatorReply(videoId, response.workflowId); onWorkflowUpdated(); }
    catch (error) { setResponseError(error instanceof Error ? error.message : 'Creator-reply review is temporarily unavailable.'); }
    finally { setCheckingCreatorReply(false); }
  };
  return <><button className="insight-drawer-backdrop" aria-label="Close insight details" onClick={onClose} /><aside className={`insight-drawer ${feedback ? 'drawer-feedback' : positive ? 'drawer-positive' : ''}`} role="dialog" aria-modal="true" aria-label={`${displayActionTitle(action)} details`}>
    <button type="button" className="drawer-close" onClick={onClose} aria-label="Close insight details"><LearnTraceIcon name="close" size={20} /></button>
    <span className={`insight-kind drawer-status ${hasInterpretation ? 'status-strong' : repeated ? 'status-repeated' : ''}`}>{hasInterpretation && <LearnTraceIcon name="flame" size={15} />}{repeated && !hasInterpretation && <LearnTraceIcon name="messages" size={15} />}{status}</span><h3>{displayActionTitle(action)}</h3>
    {hasInterpretation && action.learningFrictionStatus && <span className="difficulty-pill">{action.learningFrictionStatus} learning difficulty</span>}
    <p className="drawer-count">{countText}</p>
    {learning && learnerQuestion && <section className="drawer-section"><DrawerHeading icon="comment">{action.supportingSignalCount === 1 ? 'What the learner asked' : 'What learners are asking'}</DrawerHeading><p className="drawer-question">{learnerQuestion}</p>{action.supportingSignalCount > 1 && <><button type="button" className="drawer-comments-toggle" onClick={() => setShowComments((visible) => !visible)} aria-expanded={showComments}>{showComments ? 'Hide comments' : 'See supporting comments'} →</button>{showComments && <ul className="evidence-list drawer-evidence">{action.evidence.map((item) => <li key={item.commentId}>{item.isReply && item.parentCommentText && <><span className="reply-context"><LearnTraceIcon name="reply" size={14} /> Reply to: {item.parentCommentText}</span></>}{item.commentText}</li>)}</ul>}</>}</section>}
    {!learning && (displayedAudienceRequest || course) && <section className="drawer-section"><DrawerHeading icon={course ? 'path' : 'comment'}>{course ? 'What the learner wants to know' : action.category === 'content_opportunity' ? 'What learners requested' : 'What learners said'}</DrawerHeading>{displayedAudienceRequest ? <p className="drawer-question">{displayedAudienceRequest}</p> : <p className="drawer-question course-question-fallback">A learner asked about course guidance.</p>}{supportingEvidence.length > 0 && <><button type="button" className="drawer-comments-toggle" onClick={() => setShowComments((visible) => !visible)} aria-expanded={showComments}>{course ? (showComments ? 'Hide original comment' : `See original comment${supportingEvidence.length === 1 ? '' : 's'}`) : (showComments ? 'Hide supporting comments' : `See ${supportingEvidence.length} supporting comment${supportingEvidence.length === 1 ? '' : 's'}`)} →</button>{showComments && <ul className="evidence-list drawer-evidence">{supportingEvidence.map((item) => <li key={item.commentId}>{item.isReply && item.parentCommentText && <><span className="reply-context"><LearnTraceIcon name="reply" size={14} /> Reply to: {item.parentCommentText}</span></>}{item.commentText}</li>)}</ul>}</>}</section>}
    {hasInterpretation && <section className="drawer-section"><DrawerHeading icon="sparkles">What LearnTrace noticed</DrawerHeading><p>{interpretationSummary}</p></section>}
    {hasInterpretation && <section className="drawer-section drawer-action"><DrawerHeading icon="content">What you could try</DrawerHeading><p>{interpretationAction}</p></section>}
    {learning && diagnosisChecked && diagnosisEligible && !hasInterpretation && <section className="drawer-section drawer-diagnosis"><DrawerHeading icon="sparkles">AI interpretation available</DrawerHeading><p>There is enough recurring evidence for LearnTrace to interpret this learner difficulty.</p><button type="button" className="drawer-generate-button" disabled={generatingDiagnosis} onClick={() => void generateInterpretation()}>{generatingDiagnosis ? 'Generating interpretation…' : 'Generate AI interpretation'}</button>{diagnosisError && <p className="drawer-diagnosis-error">{diagnosisError}</p>}</section>}
    {learning && diagnosisChecked && !diagnosisEligible && !hasInterpretation && <section className="drawer-section drawer-watch"><DrawerHeading icon="eye">Worth watching</DrawerHeading><p>{diagnosisMessage || 'More recurring evidence is needed before LearnTrace can generate an AI interpretation.'}</p></section>}
    {learning && repeated && !hasInterpretation && !diagnosisChecked && <section className="drawer-section drawer-watch"><DrawerHeading icon="eye">Worth watching</DrawerHeading><p>{recommendation}</p></section>}
    {positive && <section className="drawer-section drawer-positive-meaning"><DrawerHeading icon="positive">Why this matters</DrawerHeading><p>{action.isGeneralPositive ? 'Learners praised the teaching overall but did not name a particular teaching approach.' : `Learners specifically responded positively to ${displayActionTitle(action).toLocaleLowerCase()}.`}</p></section>}
    {!learning && <section className="drawer-section drawer-action"><DrawerHeading icon={positive ? 'positive' : feedback ? 'content' : course ? 'path' : 'content'}>{positive ? action.isGeneralPositive ? 'What this means' : 'Keep doing this' : course ? 'What you could clarify' : 'What you could try'}</DrawerHeading><p>{action.suggestedAction}</p></section>}
    {(response || creatorReply) && <section className="drawer-section drawer-response">
      <DrawerHeading icon="reply">{response?.creatorReplyText || creatorReply ? 'Response' : 'Response'}</DrawerHeading>
      {(response?.creatorReplyText || creatorReply) && <div className="creator-reply-context">
        <div className="creator-reply-header">{(response?.creatorReplyAvatarUrl || creatorReply?.avatarUrl) && <img src={response?.creatorReplyAvatarUrl || creatorReply?.avatarUrl || ''} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling?.classList.remove('is-hidden'); }} />}<span className={response?.creatorReplyAvatarUrl || creatorReply?.avatarUrl ? 'creator-avatar-fallback is-hidden' : 'creator-avatar-fallback'} aria-hidden="true">{(response?.creatorReplyAuthorName || creatorReply?.authorName || 'C').trim().charAt(0).toUpperCase()}</span><b>{response?.creatorReplyAuthorName || creatorReply?.authorName || 'Video creator'} replied in this thread</b></div>
        <p>{response?.creatorReplyText || creatorReply?.text}</p>
        {response?.creatorReplyAssessment ? <small className={`creator-reply-assessment assessment-${response.creatorReplyAssessment.outcome}`}><b>{response.creatorReplyAssessment.outcome === 'answered' ? 'Creator reply addresses this question.' : response.creatorReplyAssessment.outcome === 'partial' ? 'This reply only partially addresses the learner’s question.' : 'This reply does not fully address the learner’s question.'}</b> {response.creatorReplyAssessment.reason}</small> : response && response.resolutionStatus !== 'resolved' && <><p className="creator-reply-unchecked">LearnTrace has not checked whether this reply fully addresses the learner’s question.</p><button type="button" className="text-button creator-reply-check" disabled={checkingCreatorReply} onClick={() => void checkCreatorReply()}>{checkingCreatorReply ? 'Checking reply…' : 'Check whether this reply answers it ✦'} <small>Uses 1 AI request</small></button></>}
      </div>}
      {response && (response.resolutionStatus === 'resolved' || response.resolutionStatus === 'community_answered' ? <div className="response-complete"><p className="response-responded">{response.resolutionStatus === 'community_answered' ? 'Answered by the community' : response.resolutionSource === 'creator_reply_ai_confirmed' ? 'Creator reply addresses this question.' : 'Marked resolved by you.'}</p>{!response.creatorReplyText && <p>{response.communityReplyText || 'You marked this conversation as resolved.'}</p>}<button type="button" className="text-button" onClick={() => void resolveResponse(false)}>Undo</button></div> : <><div className="response-review"><span>{response.resolutionStatus === 'unclear' ? 'REVIEW NEEDED' : 'NEEDS RESPONSE'}</span><p>Suggested response: <b>{response.suggestedResponseType}</b></p></div><button type="button" className="drawer-generate-button" disabled={draftingReply} onClick={() => void draftReply(response.primaryDraftMode)}>{draftingReply ? 'Writing a draft…' : response.cachedDraftModes?.includes(response.primaryDraftMode) ? `View saved ${draftLabel(response.primaryDraftMode).toLocaleLowerCase()}` : `${response.creatorReplyAssessment && response.creatorReplyAssessment.outcome !== 'answered' && response.primaryDraftMode === 'individual_reply' ? 'Draft a better reply' : draftLabel(response.primaryDraftMode)} ✦`}</button>{response.secondaryDraftMode && <button type="button" className="text-button response-secondary-draft" disabled={draftingReply} onClick={() => void draftReply(response.secondaryDraftMode!)}>{draftLabel(response.secondaryDraftMode)} →</button>}{response.hasPhase6Interpretation && <p className="response-followup">Consider follow-up content: this issue may benefit from another worked example or short follow-up explanation.</p>}{replyDraft && activeDraftMode && <div className="reply-draft-card"><label className="ai-draft-label" htmlFor="reply-draft">AI-generated {activeDraftMode === 'public_clarification' ? 'clarification' : 'draft reply'} <small>{draftDescription(activeDraftMode)}</small></label><textarea id="reply-draft" className="reply-draft" value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} maxLength={900} /><div className="reply-draft-actions"><button type="button" onClick={() => void draftReply(activeDraftMode, true)}>Regenerate</button><button type="button" onClick={() => void navigator.clipboard?.writeText(replyDraft)}>{activeDraftMode === 'public_clarification' ? 'Copy clarification' : 'Copy reply'}</button></div></div>}<button type="button" className="text-button response-resolve" onClick={() => void resolveResponse(true)}>Mark as resolved</button></>)}
      {responseError && <p className="drawer-diagnosis-error">{responseError}</p>}
    </section>}
    <details className="drawer-trust"><summary><LearnTraceIcon name="info" size={16} /> Why this is showing</summary><p>{course ? courseTrustText : trustText}</p></details>
  </aside></>;
}

function DrawerHeading({ icon, children }: { icon: LearnTraceIconName; children: ReactNode }) {
  return <h4><LearnTraceIcon name={icon} size={18} /> {children}</h4>;
}
