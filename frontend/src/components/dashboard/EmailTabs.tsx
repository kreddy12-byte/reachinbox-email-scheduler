export type EmailTab = 'scheduled' | 'sent';

interface EmailTabsProps {
  active: EmailTab;
  onChange: (tab: EmailTab) => void;
  scheduledCount?: number;
  sentCount?: number;
}

export function EmailTabs({
  active,
  onChange,
  scheduledCount,
  sentCount,
}: EmailTabsProps) {
  const tabs: Array<{ id: EmailTab; label: string; count?: number }> = [
    { id: 'scheduled', label: 'Scheduled Emails', count: scheduledCount },
    { id: 'sent', label: 'Sent Emails', count: sentCount },
  ];

  return (
    <div
      role="tablist"
      aria-label="Email views"
      className="inline-flex rounded-2xl border border-[var(--ri-border)] bg-[var(--ri-surface)] p-1 shadow-sm"
    >
      {tabs.map((tab) => {
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              selected
                ? 'bg-[var(--ri-ink)] text-white'
                : 'text-[var(--ri-muted)] hover:text-[var(--ri-ink)]'
            }`}
          >
            {tab.label}
            {typeof tab.count === 'number' ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  selected
                    ? 'bg-white/15 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
