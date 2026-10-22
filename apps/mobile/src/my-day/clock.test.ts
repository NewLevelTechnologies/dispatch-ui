import { clock, formatHour, zonedHour } from './clock';

const NY = 'America/New_York';

describe('formatHour', () => {
  it.each([
    [8, '8a'],
    [0, '12a'],
    [12, '12p'],
    [13, '1p'],
    [23, '11p'],
  ])('%s reads %s on the hour', (hour, expected) => {
    expect(formatHour(hour)).toBe(expected);
  });

  it('shows minutes only when there are any', () => {
    expect(formatHour(10.7)).toBe('10:42a');
    expect(formatHour(13.5)).toBe('1:30p');
    expect(formatHour(9.0)).toBe('9a');
  });

  it('pads a single-digit minute', () => {
    expect(formatHour(9 + 5 / 60)).toBe('9:05a');
  });
});

describe('zonedHour', () => {
  it('reads the instant in the tenant’s zone, not the device’s', () => {
    // 14:00Z is 10am in New York (EDT, UTC-4).
    expect(zonedHour('2026-10-21T14:00:00Z', NY)).toBeCloseTo(10, 5);
    expect(zonedHour('2026-10-21T14:00:00Z', 'UTC')).toBeCloseTo(14, 5);
  });

  it('is null for an unparseable instant', () => {
    expect(zonedHour('not-a-date', NY)).toBeNull();
  });

  it('falls back to the device clock rather than blanking on a bad zone', () => {
    expect(zonedHour('2026-10-21T14:00:00Z', 'Not/AZone')).not.toBeNull();
  });
});

describe('clock', () => {
  it('formats an instant in the tenant’s zone', () => {
    expect(clock('2026-10-21T14:00:00Z', NY)).toBe('10a');
    expect(clock('2026-10-21T16:00:00Z', NY)).toBe('12p');
  });

  it('says nothing when there is no time', () => {
    expect(clock(null, NY)).toBeNull();
    expect(clock(undefined, NY)).toBeNull();
  });
});
