/**
 * Compact clock times in the tenant's zone — "8a", "10:42a", "12p".
 *
 * A port of web's `zonedHour`/`formatHour` (`apps/web/src/lib/boardTime.ts`),
 * which is what the My day design's time labels are built from. Mobile's
 * existing `formatArrivalTime` renders "8:00 AM" instead: fine for a list row,
 * too wide for the focus card's 26pt window line.
 *
 * Times come back as instants and have to be read in the tenant's zone, not
 * the phone's — a tech on the road can be in a different one, and the day the
 * server resolved is the tenant's.
 */

/** Fractional hour-of-day (13.5 = 1:30pm) in `timeZone`. Null if unparseable. */
export function zonedHour(iso: string, timeZone: string): number | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return hour + minute / 60;
  } catch {
    // An invalid zone must not blank the screen — fall back to the device's
    // own clock and keep rendering, same as web.
    return at.getHours() + at.getMinutes() / 60;
  }
}

/** 8 → "8a", 13.7 → "1:42p", 12 → "12p". Minutes are dropped when zero. */
export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const suffix = h >= 12 && h < 24 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
}

/** A clock time in the tenant's zone: "8a", "10:42a". Null when there's no time. */
export function clock(iso: string | null | undefined, timeZone: string): string | null {
  if (!iso) return null;
  const h = zonedHour(iso, timeZone);
  return h == null ? null : formatHour(h);
}
