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

export const PRESET_WINDOWS: readonly PresetWindow[] = [
  { key: '08-10', label: '8:00 – 10:00 AM', startHour: 8, endHour: 10 },
  { key: '09-11', label: '9:00 – 11:00 AM', startHour: 9, endHour: 11 },
  { key: '10-12', label: '10:00 AM – 12:00 PM', startHour: 10, endHour: 12 },
  { key: '12-14', label: '12:00 – 2:00 PM', startHour: 12, endHour: 14 },
  { key: '14-16', label: '2:00 – 4:00 PM', startHour: 14, endHour: 16 },
  { key: '16-18', label: '4:00 – 6:00 PM', startHour: 16, endHour: 18 },
] as const;

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
