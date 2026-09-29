import { describe, it, expect } from 'vitest';
import {
  canReleaseDayBefore,
  defaultSlot,
  isLateSend,
  releaseSlots,
  scheduledFor,
} from './scheduledRelease';

// Phoenix: UTC-7 all year, so the arithmetic below is fixed.
const TZ = 'America/Phoenix';
const at = (iso: string) => new Date(iso);

describe('releaseSlots', () => {
  it('offers the whole morning of a future day, in 15-minute steps', () => {
    const slots = releaseSlots('2026-05-16', false, at('2026-05-15T17:00:00Z'), TZ);
    expect(slots[0]).toBe(4);
    expect(slots[1]).toBe(4.25);
    expect(slots.at(-1)).toBe(23.75);
  });

  it('offers nothing before now on today', () => {
    // 9:07a Phoenix
    const slots = releaseSlots('2026-05-15', false, at('2026-05-15T16:07:00Z'), TZ);
    expect(slots[0]).toBe(9.25);
  });

  it('never offers the current quarter itself', () => {
    // 9:00a exactly
    expect(releaseSlots('2026-05-15', false, at('2026-05-15T16:00:00Z'), TZ)[0]).toBe(9.25);
  });

  it('offers the evening before from 5p', () => {
    const slots = releaseSlots('2026-05-16', true, at('2026-05-15T15:00:00Z'), TZ);
    expect(slots[0]).toBe(17);
    expect(slots.at(-1)).toBe(23.75);
  });

  it('floors the evening before at now when that evening is tonight', () => {
    // 8:10p Phoenix on the 15th
    const slots = releaseSlots('2026-05-16', true, at('2026-05-16T03:10:00Z'), TZ);
    expect(slots[0]).toBe(20.25);
  });

  it('offers nothing on a past day', () => {
    expect(releaseSlots('2026-05-14', false, at('2026-05-15T16:00:00Z'), TZ)).toEqual([]);
  });
});

describe('canReleaseDayBefore', () => {
  it('is only for a future day', () => {
    const now = at('2026-05-15T16:00:00Z');
    expect(canReleaseDayBefore('2026-05-16', now, TZ)).toBe(true);
    expect(canReleaseDayBefore('2026-05-15', now, TZ)).toBe(false);
  });
});

describe('defaultSlot', () => {
  it('picks the usual start when it is still on offer', () => {
    expect(defaultSlot([6, 7, 8])).toBe(7);
  });

  it('falls to the next slot once the usual start has passed', () => {
    expect(defaultSlot([9.25, 9.5])).toBe(9.25);
    expect(defaultSlot([])).toBeNull();
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
