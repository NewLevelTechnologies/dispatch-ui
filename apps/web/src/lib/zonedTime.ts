// ─────────────────────────────────────────────────────────────────────
// Wall-clock time in the TENANT's zone ↔ instants.
//
// The board reads in the tenant's zone — the axis, the day boundary and the
// now-line all resolve through the `timeZone` the server sends, because a
// dispatcher in Phoenix must not see a UTC-bounded day. Writes have to use
// the same zone or the two halves disagree: a window dragged to "8–10a" from
// a browser running UTC was previously written as 08:00Z, which for a Phoenix
// tenant is 1am — the *previous* day's board.
//
// That only ever matched when the browser's zone happened to equal the
// tenant's, which is why it survived: a single-metro shop never sees it, and
// a travelling dispatcher or a remote CSR sees every window land wrong.
//
// There is no native "wall time in zone X → instant" in JavaScript, so this
// measures the zone's offset and corrects for it.
// ─────────────────────────────────────────────────────────────────────

/** Cached per zone — constructing these is the expensive part, and the board
 *  converts on every drag. */
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    FORMATTERS.set(timeZone, formatter);
  }
  return formatter;
}

/** What `instant` reads as on a clock in `timeZone`, as epoch milliseconds of
 *  the equivalent UTC wall time. The gap between this and the instant itself
 *  IS the zone's offset at that moment. */
function wallClockMs(instant: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(instant));
  const at: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') at[part.type] = Number(part.value);
  }
  // `hour12: false` yields 24 for midnight in some engines; 24:00 of a day is
  // 00:00 of the same day for this purpose, since Date.UTC normalizes it.
  return Date.UTC(at.year, at.month - 1, at.day, at.hour, at.minute, at.second);
}

/**
 * A calendar date and a wall-clock hour in `timeZone` → the ISO instant.
 *
 * Two passes, because the offset itself depends on the instant: the first
 * guess uses the offset at UTC-midnight of that date, the second re-measures
 * at the corrected instant. That second pass is what makes a DST boundary
 * come out right — on a spring-forward morning the offset before and after
 * the transition differ by an hour, and a single pass would be wrong for
 * every time after it.
 *
 * `hour` is fractional (9.5 = 9:30) to match the board's axis, and may be 24
 * to mean the exclusive end of the day.
 */
export function zonedIso(date: string, hour: number, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const h = Math.floor(hour);
  const min = Math.round((hour - h) * 60);
  const wanted = Date.UTC(y, m - 1, d, h, min, 0, 0);

  let instant = wanted - (wallClockMs(wanted, timeZone) - wanted);
  // Re-measure at the corrected instant; if the offset changed between the
  // two (a DST boundary sits between them), correct once more.
  const drift = wallClockMs(instant, timeZone) - wanted;
  if (drift !== 0) instant -= drift;

  return new Date(instant).toISOString();
}

/** The wall-clock hour an instant reads as in `timeZone`, fractional. The
 *  inverse of `zonedIso`, and what a window has to be read back through so
 *  editing one does not shift it. */
export function zonedHourOf(instant: string, timeZone: string): number | null {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return null;
  const wall = new Date(wallClockMs(ms, timeZone));
  return wall.getUTCHours() + wall.getUTCMinutes() / 60;
}

/** The calendar date an instant falls on in `timeZone`. */
export function zonedDateOf(instant: string, timeZone: string): string | null {
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return null;
  return new Date(wallClockMs(ms, timeZone)).toISOString().slice(0, 10);
}
