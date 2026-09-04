export interface RequestErrorDetails {
  title: string;
  message: string;
}

export function RequestError({ error, onRetry }: { error: RequestErrorDetails; onRetry?: () => void }) {
  return (
    <div className="request-error" role="alert">
      <span className="request-error-icon" aria-hidden="true">!</span>
      <div><strong>{error.title}</strong><p>{error.message}</p></div>
      {onRetry && <button type="button" onClick={onRetry}>Try again</button>}
    </div>
  );
}
