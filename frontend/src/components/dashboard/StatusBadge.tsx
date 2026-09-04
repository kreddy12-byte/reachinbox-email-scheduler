import type { EmailStatus } from '../../services/email.service';

const STYLES: Record<EmailStatus, string> = {
  SCHEDULED: 'bg-sky-50 text-sky-800 ring-sky-200',
  PROCESSING: 'bg-amber-50 text-amber-800 ring-amber-200',
  SENT: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  FAILED: 'bg-rose-50 text-rose-800 ring-rose-200',
};

export function StatusBadge({ status }: { status: EmailStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STYLES[status]}`}
    >
      {status}
    </span>
  );
}
