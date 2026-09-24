// ─────────────────────────────────────────────────────────────────────
// What a drop MEANS. Kept out of the drag wiring on purpose: every rule
// worth getting right lives here as a pure function, so it can be tested
// without a pointer — jsdom implements no drag at all.
//
// The drag glue's whole job is to turn a gesture into `resolveDrop(...)`
// and act on the answer.
// ─────────────────────────────────────────────────────────────────────
import { PRESET_WINDOWS, type PresetWindow } from './arrivalWindows';

export interface OffSpan {
  start: number;
  end: number;
}

export type DropResolution =
  | { ok: true; window: PresetWindow }
  | { ok: false; reason: 'outside-day' }
  | {
      ok: false;
      reason: 'time-off';
      /** The window that was checked, and the absence it hit. */
      window: { startHour: number; endHour: number };
      off: OffSpan;
    };

/** Fractional hour under the pointer, from its x within the lane. */
export function hourAtPointer(
  clientX: number,
  lane: { left: number; width: number },
  axis: { start: number; span: number },
): number {
  if (lane.width <= 0) return axis.start;
  const ratio = (clientX - lane.left) / lane.width;
  return axis.start + ratio * axis.span;
}

/**
 * Nearest preset arrival window to a dropped hour, chosen by START time.
 *
 * Snapping is a CLIENT rule, not a server constraint — the backend
 * deliberately doesn't validate windows against the presets, because
 * dispatches exist in the wild with non-standard windows and the composer
 * preserves them. But the board must only create windows the composer could
 * have created: dropping at 9:37 and quoting a customer "9:37 to 11:37" is
 * not something anyone would do on purpose.
 */
export function snapToPreset(
  hour: number,
  presets: readonly PresetWindow[] = PRESET_WINDOWS,
): PresetWindow {
  return presets.reduce((best, p) =>
    Math.abs(p.startHour - hour) < Math.abs(best.startHour - hour) ? p : best,
  );
}

/** Two intervals share time. Touching edges don't count — a job starting
 *  exactly when an absence ends is fine. */
export function overlaps(a: OffSpan, b: OffSpan): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Whether a drop is allowed, and what window it lands in.
 *
 * Time off is rejected CLIENT-side by design: the server accepts a dispatch
 * inside an absence, the same way it accepts a double-book. That is
 * deliberate — "warn and allow" for overlap, and a hard server block on time
 * off is a product decision nobody has made. So this is the rule, and it has
 * to be enforced where the gesture happens.
 *
 * Overlap with EXISTING WORK is deliberately not rejected. Dispatchers
 * double-book on purpose more often than anyone expects, and a hard block
 * makes them lie to the system; the timeline splits a clashing pair
 * geometrically instead so it can never hide.
 */
export function resolveDrop(
  hour: number,
  timeOff: readonly OffSpan[],
  axis: { start: number; end: number },
  presets: readonly PresetWindow[] = PRESET_WINDOWS,
  /** A moved block keeps its length (see `movedWindow`), so a 3-hour visit
   *  is checked as 3 hours, not as the 2-hour preset it snapped from. */
  durationHours?: number,
): DropResolution {
  const window = snapToPreset(hour, presets);

  // A preset that snapped outside the rendered day is not a placement anyone
  // asked for — better to refuse than to silently book 6am.
  if (window.startHour < axis.start || window.endHour > axis.end) {
    return { ok: false, reason: 'outside-day' };
  }

  const span = {
    start: window.startHour,
    end: durationHours != null ? window.startHour + durationHours : window.endHour,
  };
  const hit = timeOff.find((off) => overlaps(span, off));
  if (hit) {
    return {
      ok: false,
      reason: 'time-off',
      window: { startHour: span.start, endHour: span.end },
      off: { start: hit.start, end: hit.end },
    };
  }

  return { ok: true, window };
}

/** Preserve a moved block's duration rather than snapping its length to a
 *  preset: a 3-hour window someone deliberately widened stays 3 hours when it
 *  moves rows. Only the START snaps. */
export function movedWindow(
  hour: number,
  durationHours: number,
  presets: readonly PresetWindow[] = PRESET_WINDOWS,
): { startHour: number; endHour: number } {
  const start = snapToPreset(hour, presets).startHour;
  return { startHour: start, endHour: start + durationHours };
}
