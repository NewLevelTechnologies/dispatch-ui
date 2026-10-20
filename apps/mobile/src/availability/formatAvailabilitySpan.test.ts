import { formatAvailabilitySpan } from './formatAvailabilitySpan';

describe('formatAvailabilitySpan', () => {
  it('formats a single-day all-day span as one date', () => {
    expect(
      formatAvailabilitySpan({
        allDay: true,
        startsAt: new Date(2026, 9, 20, 0, 0, 0).toISOString(),
        endsAt: new Date(2026, 9, 20, 23, 59, 59).toISOString(),
      })
    ).toBe('Oct 20');
  });

  it('formats a multi-day all-day span as a date range', () => {
    expect(
      formatAvailabilitySpan({
        allDay: true,
        startsAt: new Date(2026, 9, 20, 0, 0, 0).toISOString(),
        endsAt: new Date(2026, 9, 24, 23, 59, 59).toISOString(),
      })
    ).toBe('Oct 20 – Oct 24');
  });

  it('formats a same-day partial span with a time range', () => {
    expect(
      formatAvailabilitySpan({
        allDay: false,
        startsAt: new Date(2026, 9, 20, 8, 0, 0).toISOString(),
        endsAt: new Date(2026, 9, 20, 12, 0, 0).toISOString(),
      })
    ).toBe('Oct 20, 8:00 AM – 12:00 PM');
  });

  it('formats a partial span that crosses midnight with full start and end', () => {
    expect(
      formatAvailabilitySpan({
        allDay: false,
        startsAt: new Date(2026, 9, 20, 22, 0, 0).toISOString(),
        endsAt: new Date(2026, 9, 21, 2, 0, 0).toISOString(),
      })
    ).toBe('Oct 20, 10:00 PM – Oct 21, 2:00 AM');
  });
});
