import { describe, it, expect } from 'vitest';
import {
  aimedHour,
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
    expect(snapToPreset(2).key).toBe('07-09');
    expect(snapToPreset(23).key).toBe('16-18');
  });

  // The old every-other-hour list skipped 11 and 1: a drop there always
  // landed an hour off, from the board and the drawer alike.
  it('lands on the odd hours too', () => {
    expect(snapToPreset(11).key).toBe('11-13');
    expect(snapToPreset(13).key).toBe('13-15');
    expect(snapToPreset(15).key).toBe('15-17');
  });
});

describe('aimedHour', () => {
  // A 2-hour block (200px here) grabbed in its middle, left edge lined up on
  // 11a: the pointer is over noon. Snapping on the pointer booked 12–2.
  it('aims a block by its left edge, not the pointer', () => {
    const pointerX = 100 + 6 * 100; // noon
    const hour = aimedHour(pointerX, lane, axis, 100);
    expect(hour).toBe(11);
    expect(snapToPreset(hour).key).toBe('11-13');
  });

  it('rounds the left edge to the nearest start', () => {
    expect(snapToPreset(aimedHour(100 + 5.6 * 100 + 40, lane, axis, 40)).key).toBe('12-14');
    expect(snapToPreset(aimedHour(100 + 5.4 * 100 + 40, lane, axis, 40)).key).toBe('11-13');
  });

  // A rail card has no edge on the axis: the hour column under the pointer
  // is the hour it means — anywhere over 1p is 1–3, even at 1:50.
  it('aims a rail card by the hour column under the pointer', () => {
    expect(aimedHour(100 + 7.1 * 100, lane, axis)).toBe(13);
    expect(aimedHour(100 + 7.9 * 100, lane, axis)).toBe(13);
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
    expect(r).toMatchObject({ ok: false, reason: 'time-off' });
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
  it('is a 2-hour window starting on every hour, 7a to 4p', () => {
    expect(PRESET_WINDOWS.map((w) => w.startHour)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    for (const w of PRESET_WINDOWS) {
      expect(w.endHour - w.startHour).toBe(2);
    }
  });

  it('labels a window once, or on both sides across noon', () => {
    const label = (key: string) => PRESET_WINDOWS.find((w) => w.key === key)?.label;
    expect(label('08-10')).toBe('8:00 – 10:00 AM');
    expect(label('10-12')).toBe('10:00 AM – 12:00 PM');
    expect(label('11-13')).toBe('11:00 AM – 1:00 PM');
    expect(label('12-14')).toBe('12:00 – 2:00 PM');
  });
});

describe('resolveDrop against a part-day absence', () => {
  const axis = { start: 6, end: 20 };

  // The window is what would be promised, so that is what must be free —
  // a drop at 12:20 snaps to 12–2p, which hits a 1–3p absence.
  it('rejects on the SNAPPED window and reports both times', () => {
    expect(resolveDrop(12.3, [{ start: 13, end: 15 }], axis)).toEqual({
      ok: false,
      reason: 'time-off',
      window: { startHour: 12, endHour: 14 },
      off: { start: 13, end: 15 },
    });
  });

  it('checks a moved block at its own length', () => {
    // A 3-hour visit snapped to 10 runs to 1p and grazes a 12:30 absence;
    // the 2-hour preset alone would not.
    expect(resolveDrop(10, [{ start: 12.5, end: 14 }], axis).ok).toBe(true);
    expect(resolveDrop(10, [{ start: 12.5, end: 14 }], axis, undefined, 3).ok).toBe(false);
  });
});

