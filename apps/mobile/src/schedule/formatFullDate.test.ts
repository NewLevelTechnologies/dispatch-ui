import { formatFullDate } from './formatFullDate';

describe('formatFullDate', () => {
  it('formats as weekday, month, day', () => {
    expect(formatFullDate(new Date(2026, 9, 20, 12, 0, 0))).toBe('Tuesday, Oct 20');
  });
});
