import type { EmailStatus } from '../../services/email.service';

interface SearchBarProps {
  query: string;
  status: EmailStatus | '';
  onQueryChange: (value: string) => void;
  onStatusChange: (value: EmailStatus | '') => void;
  onSubmit: () => void;
  searching: boolean;
}

const STATUS_OPTIONS: Array<{ value: EmailStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'SENT', label: 'Sent' },
  { value: 'FAILED', label: 'Failed' },
];

export function SearchBar({
  query,
  status,
  onQueryChange,
  onStatusChange,
  onSubmit,
  searching,
}: SearchBarProps) {
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor="email-search"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ri-muted)]"
        >
          Search emails
        </label>
        <input
          id="email-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search recipient, subject, or body…"
          className="w-full rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm text-[var(--ri-ink)] outline-none ring-[var(--ri-primary)] focus:ring-2"
        />
      </div>
      <div className="sm:w-44">
        <label
          htmlFor="email-status-filter"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--ri-muted)]"
        >
          Status
        </label>
        <select
          id="email-status-filter"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as EmailStatus | '')
          }
          className="w-full rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm text-[var(--ri-ink)] outline-none ring-[var(--ri-primary)] focus:ring-2"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        disabled={searching}
        className="rounded-xl bg-[var(--ri-ink)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {searching ? 'Searching…' : 'Search'}
      </button>
    </form>
  );
}
