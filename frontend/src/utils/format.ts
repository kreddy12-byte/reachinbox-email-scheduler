export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function formatSenderLabel(sender: {
  email: string;
  displayName?: string | null;
}): string {
  if (sender.displayName?.trim()) {
    return `${sender.displayName} <${sender.email}>`;
  }
  return sender.email;
}

/** Local datetime-local input value roughly 2 minutes ahead. */
export function defaultStartLocalValue(minutesAhead = 2): string {
  const date = new Date(Date.now() + minutesAhead * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function localInputToIso(localValue: string): string {
  const date = new Date(localValue);
  return date.toISOString();
}
