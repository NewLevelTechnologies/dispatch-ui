import { upcomingDateKeys } from './upcomingDateKeys';

describe('upcomingDateKeys', () => {
  it('starts with today and runs the given number of days', () => {
    expect(upcomingDateKeys(3, new Date(2026, 9, 20, 12, 0, 0))).toEqual([
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
    ]);
  });

  it('rolls over a month boundary correctly', () => {
    expect(upcomingDateKeys(3, new Date(2026, 9, 30, 12, 0, 0))).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});
