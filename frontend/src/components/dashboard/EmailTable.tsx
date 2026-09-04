import { formatDateTime, formatSenderLabel } from '../../utils/format';
import type { EmailStatus } from '../../services/email.service';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';
import { StatusBadge } from './StatusBadge';

export interface EmailTableRow {
  id: string;
  recipient: string;
  subject: string;
  time: string | null;
  status: EmailStatus;
  senderLabel: string;
}

interface EmailTableProps {
  mode: 'scheduled' | 'sent';
  rows: EmailTableRow[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onCompose?: () => void;
}

export function EmailTable({
  mode,
  rows,
  loading,
  error,
  onRetry,
  onCompose,
}: EmailTableProps) {
  const timeLabel = mode === 'scheduled' ? 'Scheduled Time' : 'Sent Time';

  if (loading) {
    return (
      <div className="overflow-hidden rounded-[var(--ri-radius)] border border-[var(--ri-border)] bg-[var(--ri-surface)] shadow-[var(--ri-shadow)]">
        <LoadingState />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--ri-radius)] border border-rose-200 bg-rose-50 px-5 py-8 text-center">
        <p className="text-sm font-medium text-rose-800">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-xl border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50"
        >
          Retry
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="overflow-hidden rounded-[var(--ri-radius)] border border-[var(--ri-border)] bg-[var(--ri-surface)] shadow-[var(--ri-shadow)]">
        {mode === 'scheduled' ? (
          <EmptyState
            title="No scheduled emails yet"
            description="Compose a campaign, upload leads from CSV, and schedule outreach to see them here."
            actionLabel="+ Compose New Email"
            onAction={onCompose}
          />
        ) : (
          <EmptyState
            title="No sent emails yet"
            description="Once scheduled emails are delivered (or fail), they will appear in this list."
          />
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[var(--ri-radius)] border border-[var(--ri-border)] bg-[var(--ri-surface)] shadow-[var(--ri-shadow)]">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--ri-muted)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Recipient</th>
              <th className="px-4 py-3 font-semibold">Subject</th>
              <th className="px-4 py-3 font-semibold">{timeLabel}</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Sender</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-t border-[var(--ri-border)] hover:bg-slate-50/70"
              >
                <td className="px-4 py-3 font-medium text-[var(--ri-ink)]">
                  {row.recipient}
                </td>
                <td className="max-w-[280px] truncate px-4 py-3 text-[var(--ri-ink)]">
                  {row.subject}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[var(--ri-muted)]">
                  {formatDateTime(row.time)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={row.status} />
                </td>
                <td className="max-w-[220px] truncate px-4 py-3 text-[var(--ri-muted)]">
                  {row.senderLabel}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function toScheduledRows(
  emails: Array<{
    id: string;
    recipient: string;
    subject: string;
    scheduledAt: string;
    status: EmailStatus;
    sender: { email: string; displayName: string | null };
  }>,
): EmailTableRow[] {
  return emails.map((email) => ({
    id: email.id,
    recipient: email.recipient,
    subject: email.subject,
    time: email.scheduledAt,
    status: email.status,
    senderLabel: formatSenderLabel(email.sender),
  }));
}

export function toSentRows(
  emails: Array<{
    id: string;
    recipient: string;
    subject: string;
    sentAt: string | null;
    status: EmailStatus;
    sender: { email: string; displayName: string | null };
  }>,
): EmailTableRow[] {
  return emails.map((email) => ({
    id: email.id,
    recipient: email.recipient,
    subject: email.subject,
    time: email.sentAt,
    status: email.status,
    senderLabel: formatSenderLabel(email.sender),
  }));
}
