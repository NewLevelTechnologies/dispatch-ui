import { describe, it, expect } from 'vitest';
import {
  canMoveTo,
  defaultPick,
  formatMoveDay,
  moveTargets,
  nextBusinessDay,
  preservedWindow,
} from './boardMove';

describe('nextBusinessDay', () => {
  it('is the next day midweek', () => {
    expect(nextBusinessDay('2026-03-18')).toBe('2026-03-19'); // Wed → Thu
  });

  // Bumping Friday work to Saturday is almost never the intent.
  it('skips the weekend from Friday, Saturday and Sunday', () => {
    expect(nextBusinessDay('2026-03-20')).toBe('2026-03-23');
    expect(nextBusinessDay('2026-03-21')).toBe('2026-03-23');
    expect(nextBusinessDay('2026-03-22')).toBe('2026-03-23');
  });

  it('crosses a month and a DST change by calendar day', () => {
    expect(nextBusinessDay('2026-03-06')).toBe('2026-03-09'); // US DST starts Mar 8
    expect(nextBusinessDay('2026-10-30')).toBe('2026-11-02');
  });
});

describe('moveTargets', () => {
  const TODAY = '2026-03-16';

  it('drops Tomorrow when it is the next business day', () => {
    expect(moveTargets('2026-03-18', TODAY)).toEqual({ nextBusiness: '2026-03-19', tomorrow: null });
  });

  it('keeps Tomorrow on a Friday, where it is a Saturday', () => {
    expect(moveTargets('2026-03-20', TODAY)).toEqual({
      nextBusiness: '2026-03-23',
      tomorrow: '2026-03-21',
    });
  });

  // A visit left on last week's board: a one-click bump would still be past.
  it('drops a quick target that would land in the past', () => {
    expect(moveTargets('2026-03-10', TODAY)).toEqual({ nextBusiness: null, tomorrow: null });
  });
});

describe('canMoveTo', () => {
  const TODAY = '2026-03-16';

  // Looking at next Tuesday and pulling work in.
  it('allows an EARLIER day, as long as it is not past', () => {
    expect(canMoveTo('2026-03-24', '2026-03-23', TODAY)).toBe(true);
    expect(canMoveTo('2026-03-24', TODAY, TODAY)).toBe(true);
  });

  it('refuses the past, the same day, and garbage', () => {
    expect(canMoveTo('2026-03-24', '2026-03-15', TODAY)).toBe(false);
    expect(canMoveTo('2026-03-24', '2026-03-24', TODAY)).toBe(false);
    expect(canMoveTo('2026-03-24', '', TODAY)).toBe(false);
  });
});

describe('defaultPick', () => {
  it('opens on the next day', () => {
    expect(defaultPick('2026-03-24', '2026-03-16')).toBe('2026-03-25');
  });

  it('opens on today for a visit left on a past board', () => {
    expect(defaultPick('2026-03-10', '2026-03-16')).toBe('2026-03-16');
  });
});

describe('formatMoveDay', () => {
  // Parsed as UTC, so no browser zone can shift the label a day.
  it('always names the weekday', () => {
    expect(formatMoveDay('2026-03-21')).toBe('Sat, Mar 21');
  });
});

describe('preservedWindow', () => {
  const at = (start: string, end: string) => ({
    arrivalWindowStart: start,
    arrivalWindowEnd: end,
  });

  it('keeps a preset window exactly', () => {
    expect(preservedWindow(at('2026-03-20T09:00:00Z', '2026-03-20T11:00:00Z'), 'UTC')).toEqual({
      startHour: 9,
      endHour: 11,
    });
  });

  it('reads the window in the TENANT zone', () => {
    // 16:00Z is 9am in Phoenix.
    expect(
      preservedWindow(at('2026-03-20T16:00:00Z', '2026-03-20T18:00:00Z'), 'America/Phoenix'),
    ).toEqual({ startHour: 9, endHour: 11 });
  });

  it('snaps a window that is no longer a preset', () => {
    expect(preservedWindow(at('2026-03-20T09:30:00Z', '2026-03-20T11:30:00Z'), 'UTC')).toEqual({
      startHour: 9,
      endHour: 11,
    });
  });

  it('refuses a window it cannot place rather than guessing', () => {
    expect(preservedWindow(at('nope', '2026-03-20T11:00:00Z'), 'UTC')).toBeNull();
    expect(preservedWindow(at('2026-03-20T11:00:00Z', '2026-03-20T09:00:00Z'), 'UTC')).toBeNull();
  });
});
