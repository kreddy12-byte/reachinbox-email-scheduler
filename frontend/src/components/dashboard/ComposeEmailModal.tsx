import { useEffect, useId, useState, type FormEvent } from 'react';
import {
  scheduleEmails,
  type ScheduleEmailItem,
} from '../../services/email.service';
import { listSenders, type Sender } from '../../services/sender.service';
import type { CsvParseResult } from '../../utils/csv';
import {
  defaultStartLocalValue,
  formatSenderLabel,
} from '../../utils/format';
import { LeadUploader } from './LeadUploader';

interface ComposeEmailModalProps {
  open: boolean;
  onClose: () => void;
  onScheduled: (count: number) => void;
}

interface FormErrors {
  senderId?: string;
  subject?: string;
  body?: string;
  leads?: string;
  startAt?: string;
  delayMs?: string;
  hourlyLimit?: string;
  form?: string;
}

const BATCH_SIZE = 50;

export function ComposeEmailModal({
  open,
  onClose,
  onScheduled,
}: ComposeEmailModalProps) {
  const titleId = useId();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [sendersLoading, setSendersLoading] = useState(false);
  const [senderId, setSenderId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [leads, setLeads] = useState<CsvParseResult | null>(null);
  const [startAt, setStartAt] = useState(defaultStartLocalValue());
  const [delaySeconds, setDelaySeconds] = useState('2');
  const [hourlyLimit, setHourlyLimit] = useState('200');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    async function loadSenders() {
      setSendersLoading(true);
      try {
        const list = await listSenders();
        if (cancelled) return;
        setSenders(list);
        setSenderId((current) => current || list[0]?.id || '');
      } catch {
        if (!cancelled) {
          setErrors((prev) => ({
            ...prev,
            form: 'Failed to load senders. Please try again.',
          }));
        }
      } finally {
        if (!cancelled) setSendersLoading(false);
      }
    }

    void loadSenders();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submitting) {
        onClose();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, submitting]);

  function resetForm() {
    setSubject('');
    setBody('');
    setLeads(null);
    setStartAt(defaultStartLocalValue());
    setDelaySeconds('2');
    setHourlyLimit('200');
    setErrors({});
    setProgress(null);
    setSenderId(senders[0]?.id || '');
  }

  function validate(): FormErrors {
    const next: FormErrors = {};

    if (!senderId) next.senderId = 'Sender is required.';
    if (!subject.trim()) next.subject = 'Subject is required.';
    if (!body.trim()) next.body = 'Body is required.';
    if (!leads || leads.emails.length === 0) {
      next.leads = 'Upload a CSV with at least one valid email address.';
    }
    if (!startAt) {
      next.startAt = 'Start date/time is required.';
    } else {
      const start = new Date(startAt);
      if (Number.isNaN(start.getTime())) {
        next.startAt = 'Enter a valid start date/time.';
      } else if (start.getTime() <= Date.now()) {
        next.startAt = 'Start time must be in the future.';
      }
    }

    const delayNum = Number(delaySeconds);
    if (
      delaySeconds.trim() === '' ||
      !Number.isFinite(delayNum) ||
      delayNum < 0 ||
      !Number.isInteger(delayNum)
    ) {
      next.delayMs = 'Delay must be a non-negative integer (seconds).';
    }

    const limitNum = Number(hourlyLimit);
    if (
      hourlyLimit.trim() === '' ||
      !Number.isFinite(limitNum) ||
      limitNum <= 0 ||
      !Number.isInteger(limitNum)
    ) {
      next.hourlyLimit = 'Hourly limit must be a positive integer.';
    }

    if (senders.length === 0) {
      next.form =
        'No senders configured. A default sender is created on first use — refresh and try again.';
    }

    return next;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const delayMs = Number(delaySeconds) * 1000;
    const limit = Number(hourlyLimit);
    const startMs = new Date(startAt).getTime();
    const recipients = leads!.emails;

    const items: ScheduleEmailItem[] = recipients.map((recipient, index) => ({
      senderId,
      recipient,
      subject: subject.trim(),
      body,
      scheduledAt: new Date(startMs + index * delayMs).toISOString(),
      sendDelayMs: delayMs,
      hourlyLimit: limit,
    }));

    // Ensure first scheduledAt remains in the future even if form sat open.
    if (new Date(items[0].scheduledAt).getTime() <= Date.now()) {
      const bump = Date.now() + 5_000;
      for (let i = 0; i < items.length; i += 1) {
        items[i] = {
          ...items[i],
          scheduledAt: new Date(bump + i * delayMs).toISOString(),
        };
      }
    }

    setSubmitting(true);
    setProgress({ done: 0, total: items.length });

    let scheduledCount = 0;
    const failures: string[] = [];

    try {
      for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
        const batch = items.slice(offset, offset + BATCH_SIZE);
        try {
          const result = await scheduleEmails(batch);
          scheduledCount += result.length;
        } catch (error) {
          failures.push(
            error instanceof Error ? error.message : 'Batch scheduling failed',
          );
        }
        setProgress({
          done: Math.min(offset + batch.length, items.length),
          total: items.length,
        });
      }

      if (scheduledCount === 0) {
        setErrors({
          form:
            failures[0] ??
            'Scheduling failed. Please check your inputs and try again.',
        });
        return;
      }

      if (failures.length > 0) {
        onScheduled(scheduledCount);
        setErrors({
          form: `Scheduled ${scheduledCount} of ${items.length} emails. Some batches failed: ${failures[0]}`,
        });
        return;
      }

      resetForm();
      onScheduled(scheduledCount);
      onClose();
    } finally {
      setSubmitting(false);
      setProgress(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--ri-border)] bg-[var(--ri-surface)] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--ri-border)] px-5 py-4">
          <h2 id={titleId} className="text-lg font-bold text-[var(--ri-ink)]">
            Compose New Email
          </h2>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-[var(--ri-muted)] hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close compose dialog"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <div>
              <label
                htmlFor="compose-sender"
                className="mb-1.5 block text-sm font-semibold text-[var(--ri-ink)]"
              >
                Sender
              </label>
              <select
                id="compose-sender"
                value={senderId}
                disabled={sendersLoading || senders.length === 0}
                onChange={(event) => setSenderId(event.target.value)}
                className="w-full rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ri-primary)] focus:ring-2"
              >
                {senders.length === 0 ? (
                  <option value="">No senders available</option>
                ) : (
                  senders.map((sender) => (
                    <option key={sender.id} value={sender.id}>
                      {formatSenderLabel(sender)}
                    </option>
                  ))
                )}
              </select>
              {errors.senderId ? (
                <p className="mt-1 text-xs text-rose-700">{errors.senderId}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="compose-subject"
                className="mb-1.5 block text-sm font-semibold text-[var(--ri-ink)]"
              >
                Subject
              </label>
              <input
                id="compose-subject"
                type="text"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                className="w-full rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ri-primary)] focus:ring-2"
              />
              {errors.subject ? (
                <p className="mt-1 text-xs text-rose-700">{errors.subject}</p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="compose-body"
                className="mb-1.5 block text-sm font-semibold text-[var(--ri-ink)]"
              >
                Email Body
              </label>
              <textarea
                id="compose-body"
                rows={6}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="w-full resize-y rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ri-primary)] focus:ring-2"
                placeholder="Write your outreach message…"
              />
              {errors.body ? (
                <p className="mt-1 text-xs text-rose-700">{errors.body}</p>
              ) : null}
            </div>

            <LeadUploader
              value={leads}
              onChange={setLeads}
              error={errors.leads}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-1">
                <label
                  htmlFor="compose-start"
                  className="mb-1.5 block text-sm font-semibold text-[var(--ri-ink)]"
                >
                  Start date/time
                </label>
                <input
                  id="compose-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  className="w-full rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ri-primary)] focus:ring-2"
                />
                {errors.startAt ? (
                  <p className="mt-1 text-xs text-rose-700">{errors.startAt}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="compose-delay"
                  className="mb-1.5 block text-sm font-semibold text-[var(--ri-ink)]"
                >
                  Delay (seconds)
                </label>
                <input
                  id="compose-delay"
                  type="number"
                  min={0}
                  step={1}
                  value={delaySeconds}
                  onChange={(event) => setDelaySeconds(event.target.value)}
                  className="w-full rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ri-primary)] focus:ring-2"
                />
                {errors.delayMs ? (
                  <p className="mt-1 text-xs text-rose-700">{errors.delayMs}</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="compose-limit"
                  className="mb-1.5 block text-sm font-semibold text-[var(--ri-ink)]"
                >
                  Hourly limit
                </label>
                <input
                  id="compose-limit"
                  type="number"
                  min={1}
                  step={1}
                  value={hourlyLimit}
                  onChange={(event) => setHourlyLimit(event.target.value)}
                  className="w-full rounded-xl border border-[var(--ri-border)] bg-white px-3 py-2.5 text-sm outline-none ring-[var(--ri-primary)] focus:ring-2"
                />
                {errors.hourlyLimit ? (
                  <p className="mt-1 text-xs text-rose-700">
                    {errors.hourlyLimit}
                  </p>
                ) : null}
              </div>
            </div>

            {leads && leads.emails.length > 0 ? (
              <div className="rounded-xl border border-teal-100 bg-teal-50/70 px-4 py-3 text-sm text-teal-950">
                <p className="font-semibold">Scheduling summary</p>
                <ul className="mt-2 space-y-1 text-[var(--ri-ink)]">
                  <li>
                    {leads.emails.length} lead
                    {leads.emails.length === 1 ? '' : 's'}
                  </li>
                  <li>
                    Starting at{' '}
                    {startAt
                      ? new Date(startAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : '—'}
                  </li>
                  <li>
                    {delaySeconds || '0'} second
                    {Number(delaySeconds) === 1 ? '' : 's'} delay
                  </li>
                  <li>{hourlyLimit || '—'} emails/hour</li>
                </ul>
              </div>
            ) : null}

            {progress ? (
              <p className="text-sm text-[var(--ri-muted)]">
                Scheduling… {progress.done} / {progress.total}
              </p>
            ) : null}

            {errors.form ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
                {errors.form}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--ri-border)] px-5 py-4">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="rounded-xl border border-[var(--ri-border)] px-4 py-2.5 text-sm font-semibold text-[var(--ri-ink)] hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || sendersLoading}
              className="rounded-xl bg-[var(--ri-primary)] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[var(--ri-primary-hover)] disabled:opacity-60"
            >
              {submitting ? 'Scheduling…' : 'Schedule Emails'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
