// ─────────────────────────────────────────────────────────────────────
// The tenant's standard arrival windows.
//
// Shared because two surfaces must agree on them: the composer books from
// this list, and the board snaps drops to it. If they disagreed, a drag
// would create a window the composer couldn't reproduce — and a CSR would be
// quoting a customer "9:37 to 11:37" while every other window in the system
// sits on the 2-hour grid.
//
// Client-side by design. The backend deliberately does NOT validate windows
// against these: dispatches exist with non-standard windows, and the composer
// preserves them via a synthetic "current" option, so server-side validation
// would reject edits to legacy data. Snapping is our rule, not a constraint.
//
// Hardcoded for now — these belong in tenant config, since a shop running
// 4-hour windows or a 7am start has no way to say so today.
// ─────────────────────────────────────────────────────────────────────

import { zonedIso } from './zonedTime';

export interface PresetWindow {
  key: string;
  label: string;
  startHour: number;
  endHour: number;
}

// Every hour of the working day starts a window, so a drop lands on the hour
// it's aimed at. An every-other-hour list made 11 and 1 unreachable — from the
// board AND the drawer, since both book from here.
const FIRST_START_HOUR = 7;
const LAST_START_HOUR = 16;
const WINDOW_HOURS = 2;

function clockLabel(hour: number): { time: string; meridiem: string } {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return { time: `${h12}:00`, meridiem: hour >= 12 ? 'PM' : 'AM' };
}

/** "8:00 – 10:00 AM", or "11:00 AM – 1:00 PM" across noon. */
function windowLabel(startHour: number, endHour: number): string {
  const a = clockLabel(startHour);
  const b = clockLabel(endHour);
  return a.meridiem === b.meridiem
    ? `${a.time} – ${b.time} ${b.meridiem}`
    : `${a.time} ${a.meridiem} – ${b.time} ${b.meridiem}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export const PRESET_WINDOWS: readonly PresetWindow[] = Array.from(
  { length: LAST_START_HOUR - FIRST_START_HOUR + 1 },
  (_, i) => {
    const startHour = FIRST_START_HOUR + i;
    const endHour = startHour + WINDOW_HOURS;
    return {
      key: `${pad2(startHour)}-${pad2(endHour)}`,
      label: windowLabel(startHour, endHour),
      startHour,
      endHour,
    };
  },
);

/**
 * Wall-clock hour on `date` (YYYY-MM-DD) in the TENANT's zone → an ISO
 * instant.
 *
 * The zone is required, not optional. This used to build the instant in the
 * browser's zone while the board read the day back in the tenant's, so the
 * two halves agreed only when those zones happened to match — a window
 * dragged to "8–10a" from a UTC browser landed at 1am for a Phoenix tenant,
 * on the previous day's board.
 */
export function toIsoAt(date: string, hour: number, timeZone: string): string {
  return zonedIso(date, hour, timeZone);
}
