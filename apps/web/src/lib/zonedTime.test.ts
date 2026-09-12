import { describe, it, expect } from 'vitest';
import { zonedDateOf, zonedHourOf, zonedIso } from './zonedTime';

// Phoenix never observes DST (UTC-7 year round); New York does. Between them
// they cover the fixed-offset case and the transition case.
const PHOENIX = 'America/Phoenix';
const NEW_YORK = 'America/New_York';
const UTC = 'UTC';

describe('zonedIso', () => {
  it('builds an instant from a wall-clock hour in a fixed-offset zone', () => {
    // 8am Phoenix is 15:00Z, all year.
    expect(zonedIso('2026-03-18', 8, PHOENIX)).toBe('2026-03-18T15:00:00.000Z');
    expect(zonedIso('2026-11-18', 8, PHOENIX)).toBe('2026-11-18T15:00:00.000Z');
  });

  it('handles fractional hours', () => {
    expect(zonedIso('2026-03-18', 9.5, PHOENIX)).toBe('2026-03-18T16:30:00.000Z');
  });

  // The exclusive end of a day, which is how the board bounds a date range.
  it('treats hour 24 as the start of the next day', () => {
    expect(zonedIso('2026-03-18', 24, PHOENIX)).toBe('2026-03-19T07:00:00.000Z');
  });

  it('is a no-op in UTC', () => {
    expect(zonedIso('2026-03-18', 8, UTC)).toBe('2026-03-18T08:00:00.000Z');
  });

  // A zone that observes DST: the same wall-clock hour is a different instant
  // in winter and in summer.
  it('tracks a zone across its own DST change', () => {
    expect(zonedIso('2026-01-15', 8, NEW_YORK)).toBe('2026-01-15T13:00:00.000Z'); // EST, -5
    expect(zonedIso('2026-07-15', 8, NEW_YORK)).toBe('2026-07-15T12:00:00.000Z'); // EDT, -4
  });

  // The case a single-pass offset lookup gets wrong: the offset measured at
  // UTC-midnight of this date is EST, but 10am local is already EDT.
  it('is correct after a spring-forward transition on the same day', () => {
    // 2026-03-08 is the US spring-forward date; 10am local is EDT (-4).
    expect(zonedIso('2026-03-08', 10, NEW_YORK)).toBe('2026-03-08T14:00:00.000Z');
  });

  it('is correct on a fall-back day', () => {
    // 2026-11-01 falls back at 2am; 10am local is EST (-5).
    expect(zonedIso('2026-11-01', 10, NEW_YORK)).toBe('2026-11-01T15:00:00.000Z');
  });
});

describe('zonedHourOf', () => {
  it('reads an instant back as the tenant’s wall-clock hour', () => {
    expect(zonedHourOf('2026-03-18T15:00:00Z', PHOENIX)).toBe(8);
    expect(zonedHourOf('2026-03-18T16:30:00Z', PHOENIX)).toBe(9.5);
  });

  it('round-trips with zonedIso', () => {
    for (const zone of [PHOENIX, NEW_YORK, UTC]) {
      for (const date of ['2026-01-15', '2026-03-08', '2026-07-15', '2026-11-01']) {
        expect(zonedHourOf(zonedIso(date, 14, zone), zone)).toBe(14);
      }
    }
  });

  it('returns null for an unparseable instant', () => {
    expect(zonedHourOf('garbage', PHOENIX)).toBeNull();
  });
});

describe('zonedDateOf', () => {
  // The whole point: this instant is the 19th in UTC but still the 18th for
  // the tenant, and the board buckets it onto the 18th's row.
  it('gives the tenant’s calendar date, not the browser’s', () => {
    expect(zonedDateOf('2026-03-19T02:00:00Z', PHOENIX)).toBe('2026-03-18');
    expect(zonedDateOf('2026-03-19T02:00:00Z', UTC)).toBe('2026-03-19');
  });

  it('round-trips with zonedIso', () => {
    expect(zonedDateOf(zonedIso('2026-03-18', 8, PHOENIX), PHOENIX)).toBe('2026-03-18');
    expect(zonedDateOf(zonedIso('2026-03-18', 0, PHOENIX), PHOENIX)).toBe('2026-03-18');
  });
});
