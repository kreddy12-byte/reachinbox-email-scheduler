import {
  getSlackConnectUrl,
  type SlackStatus,
} from '../../services/slack.service';

interface SlackIntegrationProps {
  status: SlackStatus | null;
  loading: boolean;
  message: string | null;
  disconnecting: boolean;
  onDisconnect: () => void;
}

export function SlackIntegration({
  status,
  loading,
  message,
  disconnecting,
  onDisconnect,
}: SlackIntegrationProps) {
  return (
    <section className="rounded-[var(--ri-radius)] border border-[var(--ri-border)] bg-[var(--ri-surface)] p-5 shadow-[var(--ri-shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--ri-ink)]">
            Slack
          </h2>
          <p className="mt-1 text-sm text-[var(--ri-muted)]">
            Notify your workspace when a sender hits the hourly sending limit.
          </p>
        </div>
        {status?.connected ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            ✓ Connected
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
            Disconnected
          </span>
        )}
      </div>

      {message ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-[var(--ri-ink)]">
          {message}
        </p>
      ) : null}

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-[var(--ri-muted)]">Loading Slack status…</p>
        ) : status?.connected ? (
          <div className="space-y-2 text-sm text-[var(--ri-muted)]">
            {status.teamName ? <p>Workspace: {status.teamName}</p> : null}
            {status.teamId ? <p>Workspace ID: {status.teamId}</p> : null}
            {status.channelId ? (
              <p>Channel: {status.channelId}</p>
            ) : (
              <p className="text-amber-700">
                No channel configured. Set SLACK_CHANNEL_ID in the backend
                environment.
              </p>
            )}
            <button
              type="button"
              disabled={disconnecting}
              onClick={onDisconnect}
              className="mt-2 rounded-xl border border-[var(--ri-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ri-ink)] hover:bg-slate-50 disabled:opacity-60"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-[var(--ri-muted)]">
              Connect Slack so rate-limit alerts are delivered to your
              configured channel.
            </p>
            <a
              href={getSlackConnectUrl()}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--ri-ink)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Connect Slack
            </a>
          </div>
        )}
      </div>
    </section>
  );
}
