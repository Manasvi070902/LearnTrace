/** LearnTrace mark: an open book with a small insight spark above it. */
export function BrandMark({ size = 32 }: { size?: number }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M5 22.5c3.4-2.1 7-2.1 11 0V10.2c-4-2.1-7.6-2.1-11 0v12.3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M27 22.5c-3.4-2.1-7-2.1-11 0V10.2c4-2.1 7.6-2.1 11 0v12.3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M16 5.2v-2.7M10.7 7.4 8.8 5.5M21.3 7.4l1.9-1.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M16 6.3c1.3 0 2.3-1 2.3-2.2S17.3 1.9 16 1.9s-2.3 1-2.3 2.2S14.7 6.3 16 6.3Z" fill="currentColor" />
  </svg>;
}
