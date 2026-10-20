import { dayKey, formatDayHeading, groupByDay } from './dayGroups';

const NOON_OCT_20 = new Date(2026, 9, 20, 12, 0, 0);
const t = (key: string) => (key === 'mobileSchedule.today' ? 'Today' : key === 'mobileSchedule.tomorrow' ? 'Tomorrow' : key);

describe('dayKey', () => {
  it('derives a local calendar-day key from an ISO instant', () => {
    expect(dayKey('2026-10-20T15:30:00.000Z')).toBe(dayKey(new Date('2026-10-20T15:30:00.000Z')));
  });

  it('pads single-digit months and days', () => {
    expect(dayKey(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
  });
});

describe('formatDayHeading', () => {
  it('names today and tomorrow specially', () => {
    expect(formatDayHeading(dayKey(NOON_OCT_20), t, NOON_OCT_20)).toBe('Today');
    const tomorrow = new Date(2026, 9, 21, 12, 0, 0);
    expect(formatDayHeading(dayKey(tomorrow), t, NOON_OCT_20)).toBe('Tomorrow');
  });

  it('formats a farther-out day as weekday, month, day', () => {
    const nextWeek = new Date(2026, 9, 27, 12, 0, 0); // a Tuesday
    expect(formatDayHeading(dayKey(nextWeek), t, NOON_OCT_20)).toBe('Tue, Oct 27');
  });
});

describe('groupByDay', () => {
  it('partitions items into day groups, preserving order within each day', () => {
    // Built from local Date objects (not hand-written UTC literals) so the
    // round-trip through dayKey stays correct regardless of the machine's
    // timezone running the test.
    const items = [
      { id: 'a', at: new Date(2026, 9, 20, 8, 0, 0).toISOString() },
      { id: 'b', at: new Date(2026, 9, 20, 11, 0, 0).toISOString() },
      { id: 'c', at: new Date(2026, 9, 21, 8, 0, 0).toISOString() },
    ];

    const groups = groupByDay(items, (i) => i.at, t, NOON_OCT_20);

    expect(groups).toHaveLength(2);
    expect(groups[0]!.heading).toBe('Today');
    expect(groups[0]!.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(groups[1]!.heading).toBe('Tomorrow');
    expect(groups[1]!.items.map((i) => i.id)).toEqual(['c']);
  });

  it('returns an empty list for no items', () => {
    expect(groupByDay([], (i: never) => i, t, NOON_OCT_20)).toEqual([]);
  });
});
