interface SummaryCardsProps {
  scheduled: number;
  sent: number;
  failed: number;
  senders: number;
  loading?: boolean;
}

function Card({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="rounded-[var(--ri-radius)] border border-[var(--ri-border)] bg-[var(--ri-surface)] p-4 shadow-[var(--ri-shadow)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ri-muted)]">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${accent}`}>{value}</p>
    </div>
  );
}

export function SummaryCards({
  scheduled,
  sent,
  failed,
  senders,
  loading,
}: SummaryCardsProps) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse rounded-[var(--ri-radius)] bg-slate-100"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Scheduled" value={scheduled} accent="text-sky-700" />
      <Card label="Sent" value={sent} accent="text-emerald-700" />
      <Card label="Failed" value={failed} accent="text-rose-700" />
      <Card label="Senders" value={senders} accent="text-[var(--ri-ink)]" />
    </div>
  );
}
