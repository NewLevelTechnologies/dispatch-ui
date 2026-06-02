// Shared scheduled-date range presets for list toolbars (global Work Orders
// list + the location-detail Jobs tab). Pure helpers — no React. Resolves a
// preset id to inclusive `from`/`to` ISO day strings (yyyy-mm-dd) that map to
// the backend's scheduledDateFrom / scheduledDateTo params.

export type DatePreset =
  | ''
  | 'today'
  | 'yesterday'
  | 'thisWeek'
  | 'last7'
  | 'thisMonth'
  | 'last30'
  | 'custom';

export const DATE_PRESETS: { id: DatePreset; labelKey: string }[] = [
  { id: '', labelKey: 'workOrders.dates.any' },
  { id: 'today', labelKey: 'workOrders.dates.today' },
  { id: 'yesterday', labelKey: 'workOrders.dates.yesterday' },
  { id: 'thisWeek', labelKey: 'workOrders.dates.thisWeek' },
  { id: 'last7', labelKey: 'workOrders.dates.last7' },
  { id: 'thisMonth', labelKey: 'workOrders.dates.thisMonth' },
  { id: 'last30', labelKey: 'workOrders.dates.last30' },
  { id: 'custom', labelKey: 'workOrders.dates.custom' },
];

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function rangeForPreset(
  preset: Exclude<DatePreset, '' | 'custom'>,
  today = new Date(),
): { from: string; to: string } {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;

  switch (preset) {
    case 'today':
      return { from: isoDay(t), to: isoDay(t) };
    case 'yesterday': {
      const y = new Date(t.getTime() - dayMs);
      return { from: isoDay(y), to: isoDay(y) };
    }
    case 'thisWeek': {
      const dow = t.getDay(); // 0 = Sunday
      const start = new Date(t.getTime() - dow * dayMs);
      const end = new Date(start.getTime() + 6 * dayMs);
      return { from: isoDay(start), to: isoDay(end) };
    }
    case 'last7': {
      const start = new Date(t.getTime() - 6 * dayMs);
      return { from: isoDay(start), to: isoDay(t) };
    }
    case 'thisMonth': {
      const start = new Date(t.getFullYear(), t.getMonth(), 1);
      const end = new Date(t.getFullYear(), t.getMonth() + 1, 0);
      return { from: isoDay(start), to: isoDay(end) };
    }
    case 'last30': {
      const start = new Date(t.getTime() - 29 * dayMs);
      return { from: isoDay(start), to: isoDay(t) };
    }
  }
}
