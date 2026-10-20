import { formatArrivalTime } from './formatArrivalTime';

describe('formatArrivalTime', () => {
  it('formats a timestamp as a 12-hour time of day', () => {
    // Pinned to UTC so the assertion doesn't depend on the machine's local
    // timezone shifting the hour.
    expect(formatArrivalTime('2026-10-20T08:00:00.000Z')).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });

  it('returns a placeholder for null, undefined, or unparseable input', () => {
    expect(formatArrivalTime(null)).toBe('—');
    expect(formatArrivalTime(undefined)).toBe('—');
    expect(formatArrivalTime('not-a-date')).toBe('—');
  });
});
