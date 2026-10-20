import { describe, it, expect } from 'vitest';
import {
  canReleaseDayBefore,
  defaultReleaseHour,
  hourFromTimeValue,
  isLateSend,
  releasePicks,
  releaseTimeProblem,
  scheduledFor,
  timeValueFromHour,
} from './scheduledRelease';

// Phoenix: UTC-7 all year, so the arithmetic below is fixed.
const TZ = 'America/Phoenix';
const at = (iso: string) => new Date(iso);

describe('canReleaseDayBefore', () => {
  it('is only for a future day', () => {
    const now = at('2026-05-15T16:00:00Z');
    expect(canReleaseDayBefore('2026-05-16', now, TZ)).toBe(true);
    expect(canReleaseDayBefore('2026-05-15', now, TZ)).toBe(false);
  });
});

describe('releaseTimeProblem', () => {
  it('accepts any minute on a future day — the 15-minute step is only a spinner', () => {
    const now = at('2026-05-15T17:00:00Z');
    expect(releaseTimeProblem(7 + 10 / 60, '2026-05-16', false, now, TZ)).toBeNull();
    expect(releaseTimeProblem(0.5, '2026-05-16', false, now, TZ)).toBeNull();
  });

  it('refuses a time already passed on today, and now itself', () => {
    // 9:07a Phoenix
    const now = at('2026-05-15T16:07:00Z');
    expect(releaseTimeProblem(9, '2026-05-15', false, now, TZ)).toBe('past');
    expect(releaseTimeProblem(9 + 7 / 60, '2026-05-15', false, now, TZ)).toBe('past');
    expect(releaseTimeProblem(9 + 8 / 60, '2026-05-15', false, now, TZ)).toBeNull();
  });

  it('starts the evening before at 5p', () => {
    const now = at('2026-05-15T15:00:00Z');
    expect(releaseTimeProblem(16.5, '2026-05-16', true, now, TZ)).toBe('beforeEvening');
    expect(releaseTimeProblem(17, '2026-05-16', true, now, TZ)).toBeNull();
  });

  it('refuses a passed time on the evening before when that evening is tonight', () => {
    // 8:10p Phoenix on the 15th
    const now = at('2026-05-16T03:10:00Z');
    expect(releaseTimeProblem(19, '2026-05-16', true, now, TZ)).toBe('past');
    expect(releaseTimeProblem(21, '2026-05-16', true, now, TZ)).toBeNull();
  });
});

describe('releasePicks', () => {
  it('centres the morning picks on the usual start', () => {
    expect(releasePicks('2026-05-16', false, at('2026-05-15T17:00:00Z'), TZ)).toEqual([
      6, 6.5, 7, 7.5, 8,
    ]);
  });

  it('switches to round evening hours the evening before', () => {
    expect(releasePicks('2026-05-16', true, at('2026-05-15T15:00:00Z'), TZ)).toEqual([17, 19, 21]);
  });

  it('drops the picks that have passed', () => {
    // 7:05a Phoenix
    expect(releasePicks('2026-05-15', false, at('2026-05-15T14:05:00Z'), TZ)).toEqual([7.5, 8]);
  });
});

describe('defaultReleaseHour', () => {
  it('opens on the usual start while it is still a pick', () => {
    expect(defaultReleaseHour('2026-05-16', false, at('2026-05-15T17:00:00Z'), TZ)).toBe(7);
  });

  it('falls to the first pick left once the usual start has passed', () => {
    // 7:05a Phoenix
    expect(defaultReleaseHour('2026-05-15', false, at('2026-05-15T14:05:00Z'), TZ)).toBe(7.5);
  });

  it('offers the next quarter-hour once every pick has passed', () => {
    // 9:07a Phoenix
    expect(defaultReleaseHour('2026-05-15', false, at('2026-05-15T16:07:00Z'), TZ)).toBe(9.25);
  });

  it('has nothing on a past day', () => {
    expect(defaultReleaseHour('2026-05-14', false, at('2026-05-15T16:00:00Z'), TZ)).toBeNull();
  });
});

describe('time field values', () => {
  it('round-trips a whole-minute time', () => {
    expect(hourFromTimeValue('07:10')).toBeCloseTo(7 + 10 / 60);
    expect(timeValueFromHour(7 + 10 / 60)).toBe('07:10');
    expect(hourFromTimeValue('')).toBeNull();
  });
});

describe('scheduledFor', () => {
  it('reads the hour in the board zone', () => {
    expect(scheduledFor({ releaseAt: '2026-05-15T14:00:00Z' }, '2026-05-15', TZ)).toEqual({
      hour: 7,
      dayBefore: false,
    });
  });

  it('marks a release on the evening before', () => {
    expect(scheduledFor({ releaseAt: '2026-05-15T04:00:00Z' }, '2026-05-15', TZ)).toEqual({
      hour: 21,
      dayBefore: true,
    });
  });
});

describe('isLateSend', () => {
  const releaseAt = '2026-05-15T14:00:00Z';

  it('is quiet for a send on time', () => {
    expect(isLateSend({ releaseAt, sentAt: '2026-05-15T14:01:00Z' })).toBe(false);
    expect(isLateSend({ releaseAt, sentAt: null })).toBe(false);
  });

  it('flags a send well after its time', () => {
    expect(isLateSend({ releaseAt, sentAt: '2026-05-15T17:32:00Z' })).toBe(true);
  });
});
