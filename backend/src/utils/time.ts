export function formatUtcHourKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hour = String(date.getUTCHours()).padStart(2, '0');
  return `${year}${month}${day}${hour}`;
}

export function startOfNextUtcHour(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours() + 1,
      0,
      0,
      0,
    ),
  );
}

export function secondsUntil(date: Date, from: Date = new Date()): number {
  return Math.max(1, Math.ceil((date.getTime() - from.getTime()) / 1000));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
