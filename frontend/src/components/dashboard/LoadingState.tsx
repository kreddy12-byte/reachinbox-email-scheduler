interface LoadingStateProps {
  rows?: number;
}

export function LoadingState({ rows = 5 }: LoadingStateProps) {
  return (
    <div className="space-y-3 p-4" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-11 animate-pulse rounded-xl bg-slate-100"
        />
      ))}
    </div>
  );
}
