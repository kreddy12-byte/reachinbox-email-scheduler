import type { AuthUser } from '../../services/auth.service';

interface HeaderProps {
  user: AuthUser;
  onLogout: () => void;
  onCompose: () => void;
}

export function Header({ user, onLogout, onCompose }: HeaderProps) {
  const initial = user.name.trim().slice(0, 1).toUpperCase() || 'U';

  return (
    <header className="border-b border-[var(--ri-border)] bg-[color-mix(in_srgb,var(--ri-surface)_88%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ri-primary)] text-sm font-bold text-white shadow-sm"
            aria-hidden
          >
            RI
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight text-[var(--ri-ink)]">
              ReachInbox
            </p>
            <p className="text-xs text-[var(--ri-muted)]">Email Scheduler</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onCompose}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--ri-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--ri-primary-ink)] shadow-sm transition hover:bg-[var(--ri-primary-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ri-primary)]"
          >
            + Compose New Email
          </button>

          <div className="flex items-center gap-3 rounded-2xl border border-[var(--ri-border)] bg-[var(--ri-surface)] px-3 py-2 shadow-sm">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--ri-ink)]">
                {user.name}
              </p>
              <p className="truncate text-xs text-[var(--ri-muted)]">
                {user.email}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-[var(--ri-border)] px-3 py-1.5 text-xs font-semibold text-[var(--ri-ink)] transition hover:bg-slate-50"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
