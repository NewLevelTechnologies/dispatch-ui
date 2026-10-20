const TIME_OF_DAY = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "8:00 AM" for an arrival-window timestamp. Returns '—' for anything unparseable. */
export function formatArrivalTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return TIME_OF_DAY.format(date);
}
