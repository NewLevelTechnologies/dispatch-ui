import { todayRange, upcomingRange } from './dateRanges';

// Noon, so a timezone shift in either direction during the test still lands
// on the same calendar day.
const NOON_OCT_20 = new Date(2026, 9, 20, 12, 0, 0);

describe('todayRange', () => {
  it('spans local midnight through the next local midnight', () => {
    const { from, to } = todayRange(NOON_OCT_20);
    expect(new Date(from)).toEqual(new Date(2026, 9, 20, 0, 0, 0, 0));
    expect(new Date(to)).toEqual(new Date(2026, 9, 21, 0, 0, 0, 0));
  });
});

describe('upcomingRange', () => {
  it('spans local midnight through N days out', () => {
    const { from, to } = upcomingRange(7, NOON_OCT_20);
    expect(new Date(from)).toEqual(new Date(2026, 9, 20, 0, 0, 0, 0));
    expect(new Date(to)).toEqual(new Date(2026, 9, 27, 0, 0, 0, 0));
  });

  it('rolls over a month boundary correctly', () => {
    const lateMonth = new Date(2026, 9, 28, 12, 0, 0);
    const { to } = upcomingRange(7, lateMonth);
    expect(new Date(to)).toEqual(new Date(2026, 10, 4, 0, 0, 0, 0));
  });
});
