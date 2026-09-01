import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { getCreatorActions } from '../services/api';
import { CreatorAction, CreatorActionsResponse } from '../types';
import { LearnTraceIcon, LearnTraceIconName } from './LearnTraceIcon';

interface CreatorActionsViewProps { videoId: string; }

type CategoryKey = 'learning' | 'technical' | 'curriculum_navigation' | 'content_opportunity' | 'actionable_feedback' | 'positive_signal';

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
  { key: 'curriculum_navigation', label: 'Course & Learning Path', icon: 'path', heading: 'Course & Learning Path', description: 'Questions about prerequisites, sequence, scope, and what to learn next.', cta: 'Explore', countLabel: () => 'learner questions', actions: (data) => data.curriculumNavigation || [], count: (data) => data.audienceOverview?.curriculum_navigation || 0 },
  { key: 'content_opportunity', label: 'Content Requests', icon: 'content', heading: 'What do learners want next?', description: 'Requested future coverage and follow-up material.', cta: 'Explore', countLabel: () => 'things learners want', actions: (data) => data.contentOpportunities || [], count: (data) => data.audienceOverview?.content_opportunity || 0, secondary: (data) => categoryTopicSummary(data.contentOpportunities || [], 'trending') },
  { key: 'actionable_feedback', label: 'Video Feedback', icon: 'feedback', heading: 'What could be improved?', description: 'Actionable feedback about the presentation or explanation.', cta: 'Explore', countLabel: () => 'useful suggestions', actions: (data) => data.improvementOpportunities || [], count: (data) => data.audienceOverview?.actionable_feedback || 0, secondary: (data) => categoryTopicSummary(data.improvementOpportunities || [], 'about') },
  { key: 'positive_signal', label: 'What Worked', icon: 'positive', heading: 'What worked well?', description: 'Specific teaching approaches learners responded to positively.', cta: 'Explore', countLabel: () => 'positive comments', actions: (data) => data.positiveSignals || [], count: (data) => data.audienceOverview?.positive_signal || 0, secondary: (data) => categoryTopicSummary(data.positiveSignals || [], 'most about') },
];

function categoryTopicSummary(actions: CreatorAction[], prefix: string): string | null {
  const strongest = [...actions].sort((a, b) => b.supportingSignalCount - a.supportingSignalCount)[0];
  if (!strongest) return null;
  const topic = actionLabel(strongest).toLowerCase();
  return prefix === 'trending' ? `${strongest.supportingSignalCount} trending` : `${prefix} ${topic}`;
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

function isPriority(action: CreatorAction): boolean {
  if (action.category === 'learning') return action.evidenceStrength === 'strong' || action.evidenceStrength === 'recurring';
  return action.supportingSignalCount >= 2 && ['technical', 'curriculum_navigation', 'content_opportunity', 'actionable_feedback'].includes(action.category);
}

export function CreatorActionsView({ videoId }: CreatorActionsViewProps) {
  const [data, setData] = useState<CreatorActionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey | null>(null);
  const [openInsight, setOpenInsight] = useState<string | null>(null);
  const categoryPanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    setData(null); setError(null); setSelectedCategory(null); setOpenInsight(null);
    void getCreatorActions(videoId)
      .then((result) => { if (active) setData(result); })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load audience insights.'); });
    return () => { active = false; };
  }, [videoId]);

  const visibleCategories = useMemo(() => data ? categories.filter((category) => category.count(data) > 0) : [], [data]);
  const priorities = useMemo(() => data ? (data.creatorActions || []).filter(isPriority).slice(0, 3) : [], [data]);
  const chooseCategory = (category: CategoryKey, insightId: string | null = null, shouldScroll = true) => {
    setSelectedCategory(category); setOpenInsight(insightId);
    if (shouldScroll) window.setTimeout(() => categoryPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  if (error) return <section className="creator-actions-section"><div className="notice-banner error-banner">{error}</div></section>;
  if (!data?.audienceOverview) return <section className="creator-actions-section"><p className="section-secondary-text">Preparing your audience overview…</p></section>;
  const selected = categories.find((category) => category.key === selectedCategory) || null;
  const selectedActions = selected ? selected.actions(data) : [];
  const selectedInsight = (data.creatorActions || []).find((action) => action.id === openInsight) || null;

  return <section className="creator-actions-section">
    {priorities.length > 0 && <section className="priority-section">
      <div className="priority-heading-row"><h3 className="priority-heading">{priorities.length} thing{priorities.length === 1 ? '' : 's'} worth your attention <LearnTraceIcon name="flame" size={20} /></h3><button type="button" className="priority-link" onClick={() => chooseCategory('learning')}>View all learning questions →</button></div>
      <div className="priority-list">{priorities.map((action, index) => <PriorityItem key={action.id} action={action} index={index} onReview={() => {
        setSelectedCategory(null); setOpenInsight(action.id);
      }} />)}</div>
    </section>}

    <section className="audience-explorer">
      <h3 className="audience-explorer-title">Explore your audience</h3>
      <div className="category-grid">{visibleCategories.map((category) => <button type="button" className={`category-card category-${category.key} ${selectedCategory === category.key ? 'selected' : ''}`} key={category.key} onClick={() => chooseCategory(category.key)} aria-pressed={selectedCategory === category.key}>
        <span className="category-heading"><span className="category-icon" aria-hidden="true"><LearnTraceIcon name={category.icon} /></span><span className="category-label">{category.label}</span></span>
        <strong>{category.count(data).toLocaleString()}</strong>
        <span className="category-count-label">{category.countLabel(data)}</span>
        {category.secondary && <span className="category-secondary">{category.secondary(data)}</span>}
        <span className="category-cta">{category.cta}</span>
      </button>)}</div>
    </section>

    {selected && <section className="category-panel" ref={categoryPanelRef} tabIndex={-1}>
      <div className="category-panel-heading"><div><span className="category-detail-label">{selected.label}</span><h3>{selected.heading}</h3><p>{selected.description}</p></div><button type="button" className="text-button" onClick={() => { setSelectedCategory(null); setOpenInsight(null); }}>Back to overview</button></div>
      {selected.key === 'learning' && <LearningGroups actions={selectedActions} onOpen={setOpenInsight} compact={Boolean(openInsight)} />}
      {selected.key !== 'learning' && <CategoryActionCarousel actions={selectedActions} onOpen={setOpenInsight} />}
    </section>}
    {selectedInsight && <InsightDrawer action={selectedInsight} onClose={() => setOpenInsight(null)} />}
  </section>;
}

function PriorityItem({ action, index, onReview }: { action: CreatorAction; index: number; onReview: () => void }) {
  const tone = action.learningFrictionScore !== null ? 'high' : action.evidenceStrength === 'strong' ? 'attention' : 'repeated';
  return <button type="button" className={`priority-item priority-${tone} priority-rank-${index + 1}`} onClick={onReview}><span className="priority-number">{String(index + 1).padStart(2, '0')}</span><span className="priority-copy"><strong>{actionLabel(action)}</strong><small>{action.supportingSignalCount} learner{action.supportingSignalCount === 1 ? '' : 's'} {action.category === 'learning' ? 'asked something similar' : 'raised this pattern'}</small></span><span className="priority-chevron">›</span></button>;
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
  useEffect(() => {
    if (groups[tab].length) return;
    if (groups.attention.length) setTab('attention');
    else if (groups.repeated.length) setTab('repeated');
    else setTab('individual');
  }, [actions, tab]);

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
    </> : <p className="learning-empty-state">No questions in this evidence level yet.</p>}
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
  return 'Learning path';
}

function displayActionTitle(action: CreatorAction): string {
  const title = actionLabel(action);
  if (action.category === 'content_opportunity' && ['content opportunity', 'content request'].includes(title.toLowerCase())) return 'Learner request';
  return title;
}

function CategoryActionCarousel({ actions, onOpen }: { actions: CreatorAction[]; onOpen: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  const activeIndex = Math.min(index, Math.max(0, actions.length - 1));
  const action = actions[activeIndex];
  useEffect(() => { setIndex(0); }, [actions]);
  if (!action) return <p className="learning-empty-state">No audience signals in this category yet.</p>;
  const icon = CATEGORY_ICONS[action.category as Exclude<CategoryKey, 'learning'>] || 'content';
  const quote = action.evidence[0]?.commentText;
  return <section className={`category-action-carousel carousel-${action.category}`} aria-label={`${actionKind(action)} carousel`}>
    <button type="button" className="category-feature-card" onClick={() => onOpen(action.id)} aria-label={`View details for ${actionLabel(action)}`}>
      <span className="category-feature-icon"><LearnTraceIcon name={icon} size={31} /></span>
      <span className="category-feature-copy">
        <span className="category-feature-kind">{actionKind(action)}</span>
        <strong>{displayActionTitle(action)}</strong>
        <span className="category-feature-evidence">{quote ? `“${quote}”` : action.summary}</span>
        {quote && action.category === 'content_opportunity' && <span className="category-feature-read-more">Read full request →</span>}
        <span className="category-feature-footer"><span><LearnTraceIcon name="users" size={16} /> {action.supportingSignalCount} learner{action.supportingSignalCount === 1 ? '' : 's'} {action.category === 'content_opportunity' ? 'requested this' : 'raised this'}</span><em>View evidence →</em></span>
      </span>
    </button>
    {actions.length > 1 && <nav className="category-carousel-controls" aria-label="Category signals">
      <button type="button" aria-label="Previous signal" disabled={activeIndex === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>←</button>
      <span className="pagination-dots" aria-hidden="true">{actions.map((item, itemIndex) => <i key={item.id} className={itemIndex === activeIndex ? 'active' : ''} />)}</span>
      <span>{activeIndex + 1} of {actions.length}</span>
      <button type="button" aria-label="Next signal" disabled={activeIndex === actions.length - 1} onClick={() => setIndex((value) => Math.min(actions.length - 1, value + 1))}>→</button>
    </nav>}
  </section>;
}

function InsightDrawer({ action, onClose }: { action: CreatorAction; onClose: () => void }) {
  const [showComments, setShowComments] = useState(false);
  const learning = action.category === 'learning';
  const repeated = learning && (action.evidenceStrength === 'strong' || action.evidenceStrength === 'recurring');
  const hasInterpretation = learning && action.source === 'phase6_ai';
  const status = hasInterpretation ? 'Needs attention' : repeated ? 'Repeated question' : learning ? 'Learner question' : action.title;
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
  return <><button className="insight-drawer-backdrop" aria-label="Close insight details" onClick={onClose} /><aside className="insight-drawer" role="dialog" aria-modal="true" aria-label={`${actionLabel(action)} details`}>
    <button type="button" className="drawer-close" onClick={onClose} aria-label="Close insight details"><LearnTraceIcon name="close" size={20} /></button>
    <span className={`insight-kind drawer-status ${hasInterpretation ? 'status-strong' : repeated ? 'status-repeated' : ''}`}>{hasInterpretation && <LearnTraceIcon name="flame" size={15} />}{repeated && !hasInterpretation && <LearnTraceIcon name="messages" size={15} />}{status}</span><h3>{displayActionTitle(action)}</h3>
    {hasInterpretation && action.learningFrictionStatus && <span className="difficulty-pill">{action.learningFrictionStatus} learning difficulty</span>}
    <p className="drawer-count">{action.supportingSignalCount} learner{action.supportingSignalCount === 1 ? '' : 's'} {repeated ? 'asked something similar' : 'asked this'}</p>
    {learning && action.evidence[0] && <section className="drawer-section"><DrawerHeading icon="comment">{action.supportingSignalCount === 1 ? 'What the learner asked' : 'What learners are asking'}</DrawerHeading><p className="drawer-question">{action.evidence[0].commentText}</p><button type="button" className="drawer-comments-toggle" onClick={() => setShowComments((visible) => !visible)} aria-expanded={showComments}>{showComments ? 'Hide comments' : 'See comments'} →</button>{showComments && <ul className="evidence-list drawer-evidence">{action.evidence.map((item) => <li key={item.commentId}>{item.isReply && item.parentCommentText && <><span className="reply-context"><LearnTraceIcon name="reply" size={14} /> Reply to: {item.parentCommentText}</span></>}{item.commentText}</li>)}</ul>}</section>}
    {!learning && action.evidence[0] && <section className="drawer-section"><DrawerHeading icon="comment">{action.category === 'content_opportunity' ? 'What learners requested' : 'What learners said'}</DrawerHeading><p className="drawer-question">{action.evidence[0].commentText}</p>{action.evidence.length > 1 && <><button type="button" className="drawer-comments-toggle" onClick={() => setShowComments((visible) => !visible)} aria-expanded={showComments}>{showComments ? 'Hide supporting comments' : `See ${action.evidence.length} supporting comments`} →</button>{showComments && <ul className="evidence-list drawer-evidence">{action.evidence.slice(1).map((item) => <li key={item.commentId}>{item.isReply && item.parentCommentText && <><span className="reply-context"><LearnTraceIcon name="reply" size={14} /> Reply to: {item.parentCommentText}</span></>}{item.commentText}</li>)}</ul>}</>}</section>}
    {hasInterpretation && <section className="drawer-section"><DrawerHeading icon="sparkles">What LearnTrace noticed</DrawerHeading><p>{action.summary}</p></section>}
    {hasInterpretation && <section className="drawer-section drawer-action"><DrawerHeading icon="content">What you could try</DrawerHeading><p>{action.suggestedAction}</p></section>}
    {learning && repeated && !hasInterpretation && <section className="drawer-section drawer-watch"><DrawerHeading icon="eye">Worth watching</DrawerHeading><p>{recommendation}</p></section>}
    {!learning && <section className="drawer-section drawer-action"><DrawerHeading icon="content">What you could try</DrawerHeading><p>{action.suggestedAction}</p></section>}
    <details className="drawer-trust"><summary><LearnTraceIcon name="info" size={16} /> Why this is showing</summary><p>{hasInterpretation ? 'Multiple learners independently raised a similar difficulty, and the existing evidence supports deeper interpretation.' : repeated ? 'This question appeared more than once, so LearnTrace is keeping it visible as a repeated learner question.' : 'A learner raised this question in the conversation around this video.'}</p></details>
  </aside></>;
}

function DrawerHeading({ icon, children }: { icon: LearnTraceIconName; children: ReactNode }) {
  return <h4><LearnTraceIcon name={icon} size={18} /> {children}</h4>;
}
