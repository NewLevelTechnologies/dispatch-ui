// ─────────────────────────────────────────────────────────────────────
// Dispatch board time math — everything in the TENANT's timezone.
//
// The server resolves `?date=YYYY-MM-DD` into an instant range in the
// tenant's zone, but it returns instants. Placing a block on a 6a–8p axis
// needs hour-of-day, and computing that from the browser's zone puts every
// block in the wrong column for anyone working outside the tenant's zone —
// a dispatcher in Phoenix looking at a UTC-derived board is wrong twice a
// day, which is exactly what the handoff's timezone prerequisite is about.
//
// So: hours are derived through Intl with an explicit `timeZone`. Callers
// pass the tenant's zone from tenant settings.
// ─────────────────────────────────────────────────────────────────────

// hourCycle h23 (not hour12:false, which yields "24" for midnight in some
// implementations and would place a block off the end of the axis).
function zonedParts(iso: string, timeZone: string): { hour: number; minute: number } | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(at);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    return { hour, minute };
  } catch {
    // An invalid zone string must not blank the board — fall back to the
    // browser and let the caller keep rendering.
    return { hour: at.getHours(), minute: at.getMinutes() };
  }
}

/** Fractional hour-of-day (13.5 = 1:30pm) in `timeZone`. Null if unparseable. */
export function zonedHour(iso: string, timeZone: string): number | null {
  const p = zonedParts(iso, timeZone);
  return p ? p.hour + p.minute / 60 : null;
}

/** Calendar date (YYYY-MM-DD) of an instant in `timeZone`. */
export function zonedDate(iso: string | Date, timeZone: string): string | null {
  const at = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(at.getTime())) return null;
  try {
    // en-CA renders ISO-ordered YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at);
  } catch {
    const m = String(at.getMonth() + 1).padStart(2, '0');
    const d = String(at.getDate()).padStart(2, '0');
    return `${at.getFullYear()}-${m}-${d}`;
  }
}

/** Compact axis label: 6a, 12p, 2:30p. Minutes only when non-zero. */
export function formatHour(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  const suffix = h >= 12 && h < 24 ? 'p' : 'a';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${suffix}`;
}

/** "8–10a" style window label for a block's meta line. */
export function formatWindow(startHour: number, endHour: number): string {
  return `${formatHour(startHour)}–${formatHour(endHour)}`;
}

export interface BoardAxis {
  start: number;
  end: number;
  span: number;
  hours: number[];
}

/** The axis the board draws. Widened, never narrowed, to contain a window
 *  that falls outside the tenant's nominal working day — an early-morning
 *  emergency must not be clipped off the left edge. */
export function buildAxis(
  dayStart: number,
  dayEnd: number,
  windows: { start: number; end: number }[],
): BoardAxis {
  let start = dayStart;
  let end = dayEnd;
  for (const w of windows) {
    if (Number.isFinite(w.start)) start = Math.min(start, Math.floor(w.start));
    if (Number.isFinite(w.end)) end = Math.max(end, Math.ceil(w.end));
  }
  const span = Math.max(1, end - start);
  return {
    start,
    end,
    span,
    hours: Array.from({ length: span }, (_, i) => start + i),
  };
}

/** Percent offset of an hour along the axis. */
export function axisPct(hour: number, axis: BoardAxis): number {
  return ((hour - axis.start) / axis.span) * 100;
}

/** Blocks that share lane pixels. Overlap is allowed — dispatchers
 *  double-book deliberately — but it must never be hidden, so the caller
 *  splits a clashing pair vertically rather than stacking by z-order.
 *  Returns the ids that clash with at least one earlier block. */
export function findClashes(
  windows: { id: string; start: number; end: number }[],
): Set<string> {
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  const clashing = new Set<string>();
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    // Touching edges (prev.end === cur.start) is back-to-back, not a clash.
    if (cur.start < prev.end) {
      clashing.add(prev.id);
      clashing.add(cur.id);
    }
  }
  return clashing;
}

/** Compact age for a rail card: how long a work order has been waiting.
 *  The rail sorts on priority then age, so this is the tiebreak made visible.
 *  Coarsens as it grows — minutes matter for a same-day emergency, days do
 *  not need an hour count. */
export function formatAge(iso: string, now: Date = new Date()): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const mins = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (mins < 0) return null; // Clock skew — say nothing rather than "-3m".
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
