import { ReactNode } from 'react';

export type LearnTraceIconName = 'learning' | 'content' | 'feedback' | 'positive' | 'technical' | 'path' | 'comment' | 'reply' | 'users' | 'activity' | 'close' | 'flame' | 'messages' | 'eye' | 'sparkles' | 'info' | 'refresh' | 'play';

/** Small, consistent in-project line icon set; no third-party icon dependency is installed. */
export function LearnTraceIcon({ name, size = 20 }: { name: LearnTraceIconName; size?: number }) {
  const paths: Record<LearnTraceIconName, ReactNode> = {
    learning: <><path d="M8 4a4 4 0 0 0-4 4v5a3 3 0 0 0 3 3h1" /><path d="M16 4a4 4 0 0 1 4 4v5a3 3 0 0 1-3 3h-1" /><path d="M8 8h.01M16 8h.01M8 13h8M12 13v7" /></>,
    content: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M8 14c-1.5-1-2.5-2.7-2.5-4.7A6.5 6.5 0 0 1 12 3a6.5 6.5 0 0 1 6.5 6.3c0 2-1 3.7-2.5 4.7-.9.7-1.3 1.5-1.5 2H9.5c-.2-.5-.6-1.3-1.5-2Z" /></>,
    feedback: <><path d="M20 15a4 4 0 0 1-4 4H9l-5 3V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7Z" /><path d="M8 10h8M8 14h5" /></>,
    positive: <path d="M20.8 4.6a5.4 5.4 0 0 0-7.6 0L12 5.8l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 21l8.8-8.8a5.4 5.4 0 0 0 0-7.6Z" />,
    technical: <><path d="m14.7 6.3 3-3 3 3-3 3" /><path d="M4 20 20 4M5 5l3 3-3 3-3-3 3-3ZM19 19l3 3-3 3-3 3-3-3 3-3Z" /></>,
    path: <><circle cx="6" cy="6" r="2" /><circle cx="18" cy="18" r="2" /><path d="M8 6h4a4 4 0 0 1 4 4v4" /></>,
    comment: <><path d="M20 15a4 4 0 0 1-4 4H9l-5 3V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7Z" /></>,
    reply: <><path d="M9 17 4 12l5-5" /><path d="M4 12h10a6 6 0 0 1 6 6v1" /></>,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1" /><path d="M16 5.5a3 3 0 0 1 0 5.7M20 20v-1a6 6 0 0 0-3.2-5.3" /></>,
    activity: <path d="M3 12h4l3-7 4 14 3-7h4" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    flame: <path d="M12 22c4 0 7-2.7 7-6.5 0-2.9-1.8-5.5-4.3-7.4.1 2.1-1.1 3.6-2.2 4.4.1-3.7-1.6-7.2-4.7-10.5C7.8 7.2 3.5 9.3 5 15.9 5.7 19.4 8.5 22 12 22Z" />,
    messages: <><path d="M20 15a4 4 0 0 1-4 4H9l-5 3V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v7Z" /><path d="M8 10h8M8 14h5" /><path d="M7 18v1a3 3 0 0 0 3 3h5l4 2v-7" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    sparkles: <><path d="m12 2 1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2Z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7L19 16Z" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.8-4L3 10" /><path d="M3 4v6h6" /><path d="M4 13a8 8 0 0 0 14.8 4L21 14" /><path d="M21 20v-6h-6" /></>,
    play: <path d="m9 7 8 5-8 5V7Z" fill="currentColor" stroke="none" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
