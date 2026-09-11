import { describe, it, expect } from 'vitest';
import {
  hourAtPointer,
  snapToPreset,
  overlaps,
  resolveDrop,
  movedWindow,
} from './boardDrop';
import { PRESET_WINDOWS } from './arrivalWindows';

const axis = { start: 6, end: 20, span: 14 };
const lane = { left: 100, width: 1400 }; // 100px per axis hour

describe('hourAtPointer', () => {
  it('maps x within the lane to an hour on the axis', () => {
    expect(hourAtPointer(100, lane, axis)).toBe(6);
    expect(hourAtPointer(1500, lane, axis)).toBe(20);
    expect(hourAtPointer(800, lane, axis)).toBe(13);
  });

  // A zero-width lane means the grid hasn't laid out yet; anything divided by
  // it is NaN, which would place a block nowhere.
  it('degrades to the axis start rather than NaN on a zero-width lane', () => {
    expect(hourAtPointer(500, { left: 0, width: 0 }, axis)).toBe(6);
  });
});

describe('snapToPreset', () => {
  // Dropping at 9:37 must not book "9:37–11:37". Every other window in the
  // system sits on the 2-hour grid and a CSR quotes these to customers.
  it('snaps to the nearest preset by start time', () => {
    expect(snapToPreset(9.6).key).toBe('10-12');
    expect(snapToPreset(9.4).key).toBe('09-11');
    expect(snapToPreset(8.05).key).toBe('08-10');
  });

  it('clamps to the first and last preset outside their range', () => {
    expect(snapToPreset(2).key).toBe('08-10');
    expect(snapToPreset(23).key).toBe('16-18');
  });

  // Presets aren't evenly spaced — there's a gap between 10–12 and 12–2.
  it('handles the gap in the preset list', () => {
    expect(snapToPreset(11).key).toBe('10-12');
    expect(snapToPreset(11.6).key).toBe('12-14');
  });
});

describe('overlaps', () => {
  it('detects a shared interval', () => {
    expect(overlaps({ start: 8, end: 10 }, { start: 9, end: 11 })).toBe(true);
  });

  // A job starting exactly when an absence ends is fine.
  it('does not treat touching edges as overlap', () => {
    expect(overlaps({ start: 8, end: 10 }, { start: 10, end: 12 })).toBe(false);
    expect(overlaps({ start: 10, end: 12 }, { start: 8, end: 10 })).toBe(false);
  });

  it('detects full containment either way round', () => {
    expect(overlaps({ start: 8, end: 18 }, { start: 10, end: 12 })).toBe(true);
    expect(overlaps({ start: 10, end: 12 }, { start: 8, end: 18 })).toBe(true);
  });
});

describe('resolveDrop', () => {
  it('accepts a drop on a clear lane and returns the snapped window', () => {
    const r = resolveDrop(9.6, [], axis);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.window.key).toBe('10-12');
  });

  // The server accepts a dispatch inside an absence — this rule is the
  // client's, so it has to hold where the gesture happens.
  it('rejects a drop that overlaps time off', () => {
    const r = resolveDrop(9.6, [{ start: 8, end: 12 }], axis);
    expect(r).toEqual({ ok: false, reason: 'time-off' });
  });

  // Partial absence is the whole reason time off carries a span: a tech out
  // all morning is still bookable in the afternoon.
  it('allows an afternoon drop for a tech who is out all morning', () => {
    const morningOff = [{ start: 8, end: 12 }];
    expect(resolveDrop(14, morningOff, axis).ok).toBe(true);
    expect(resolveDrop(9, morningOff, axis).ok).toBe(false);
  });

  it('rejects only the absence that clashes, across several', () => {
    const twoAbsences = [
      { start: 9, end: 10 },
      { start: 15, end: 19 },
    ];
    expect(resolveDrop(12, twoAbsences, axis).ok).toBe(true);
    expect(resolveDrop(16, twoAbsences, axis).ok).toBe(false);
  });

  // Overlap with existing WORK is deliberately allowed — dispatchers
  // double-book on purpose, and a hard block makes them lie to the system.
  it('says nothing about existing work; only time off blocks a drop', () => {
    expect(resolveDrop(10, [], axis).ok).toBe(true);
  });

  it('refuses a window that snapped outside the rendered day', () => {
    const narrow = { start: 12, end: 14 };
    expect(resolveDrop(8, [], narrow)).toEqual({ ok: false, reason: 'outside-day' });
  });
});

describe('movedWindow', () => {
  // A 3-hour window someone deliberately widened stays 3 hours when it moves
  // rows — only the START snaps.
  it('preserves duration and snaps only the start', () => {
    expect(movedWindow(9.6, 3)).toEqual({ startHour: 10, endHour: 13 });
  });

  it('keeps a standard 2-hour window standard', () => {
    expect(movedWindow(14.2, 2)).toEqual({ startHour: 14, endHour: 16 });
  });

  it('preserves a sub-hour duration', () => {
    expect(movedWindow(12.1, 1.5)).toEqual({ startHour: 12, endHour: 13.5 });
  });
});

describe('preset list', () => {
  // The composer books from this same list. If they ever diverge, a drag
  // creates windows the composer cannot reproduce.
  it('is 2-hour windows across the working day', () => {
    expect(PRESET_WINDOWS).toHaveLength(6);
    for (const w of PRESET_WINDOWS) {
      expect(w.endHour - w.startHour).toBe(2);
    }
  });
});
