interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-lg font-bold text-[var(--ri-primary)]">
        ∅
      </div>
      <h3 className="text-base font-semibold text-[var(--ri-ink)]">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-[var(--ri-muted)]">
        {description}
      </p>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-6 rounded-xl bg-[var(--ri-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--ri-primary-hover)]"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
