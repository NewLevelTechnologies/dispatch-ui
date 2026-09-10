import { describe, it, expect } from 'vitest';
import {
  zonedHour,
  zonedDate,
  formatHour,
  formatWindow,
  buildAxis,
  axisPct,
  findClashes,
  formatAge,
  compareRailOrder,
} from './boardTime';

describe('zonedHour', () => {
  // The whole point of the helper: the same instant lands in a different
  // column depending on the tenant's zone, and the browser's zone is never
  // the right answer.
  it('derives hour-of-day in the given zone, not the browser', () => {
    const iso = '2026-03-15T16:30:00Z';
    expect(zonedHour(iso, 'UTC')).toBe(16.5);
    expect(zonedHour(iso, 'America/Phoenix')).toBe(9.5);
    expect(zonedHour(iso, 'America/New_York')).toBe(12.5);
  });

  it('handles a zone that observes DST', () => {
    // Phoenix does not shift; New York does. Same instant, July.
    const iso = '2026-07-15T16:00:00Z';
    expect(zonedHour(iso, 'America/Phoenix')).toBe(9);
    expect(zonedHour(iso, 'America/New_York')).toBe(12);
  });

  // hourCycle h23: midnight must be 0, not 24, or a block lands off the axis.
  it('renders midnight as hour 0', () => {
    expect(zonedHour('2026-03-15T00:00:00Z', 'UTC')).toBe(0);
  });

  it('returns null for an unparseable instant', () => {
    expect(zonedHour('not-a-date', 'UTC')).toBeNull();
  });

  // An invalid zone must degrade, not blank the board.
  it('falls back to the browser rather than throwing on a bad zone', () => {
    expect(zonedHour('2026-03-15T16:30:00Z', 'Not/AZone')).not.toBeNull();
  });
});

describe('zonedDate', () => {
  it('gives the tenant-local calendar date', () => {
    // 03:00 UTC is still the previous day in Phoenix.
    expect(zonedDate('2026-03-16T03:00:00Z', 'UTC')).toBe('2026-03-16');
    expect(zonedDate('2026-03-16T03:00:00Z', 'America/Phoenix')).toBe('2026-03-15');
  });

  it('returns null for an unparseable instant', () => {
    expect(zonedDate('nope', 'UTC')).toBeNull();
  });
});

describe('formatHour', () => {
  it('formats compactly, with minutes only when non-zero', () => {
    expect(formatHour(6)).toBe('6a');
    expect(formatHour(12)).toBe('12p');
    expect(formatHour(14.5)).toBe('2:30p');
    expect(formatHour(0)).toBe('12a');
    expect(formatHour(20)).toBe('8p');
  });

  it('formats a window', () => {
    expect(formatWindow(8, 10)).toBe('8a–10a');
    expect(formatWindow(14, 16)).toBe('2p–4p');
  });
});

describe('buildAxis', () => {
  it('uses the working day when everything fits inside it', () => {
    const axis = buildAxis(6, 20, [{ start: 8, end: 10 }]);
    expect(axis.start).toBe(6);
    expect(axis.end).toBe(20);
    expect(axis.span).toBe(14);
    expect(axis.hours).toHaveLength(14);
    expect(axis.hours[0]).toBe(6);
  });

  // An overnight emergency must not be clipped off the edge of the board.
  it('widens to contain a window outside the working day', () => {
    const axis = buildAxis(6, 20, [{ start: 4.5, end: 6 }, { start: 19, end: 22.25 }]);
    expect(axis.start).toBe(4);
    expect(axis.end).toBe(23);
  });

  it('never narrows below the working day', () => {
    const axis = buildAxis(6, 20, [{ start: 10, end: 11 }]);
    expect(axis.start).toBe(6);
    expect(axis.end).toBe(20);
  });

  it('survives an empty board', () => {
    const axis = buildAxis(6, 20, []);
    expect(axis.span).toBe(14);
  });
});

describe('axisPct', () => {
  it('maps hours onto the axis as percentages', () => {
    const axis = buildAxis(6, 20, []);
    expect(axisPct(6, axis)).toBe(0);
    expect(axisPct(20, axis)).toBe(100);
    expect(axisPct(13, axis)).toBeCloseTo(50);
  });
});

describe('findClashes', () => {
  it('finds nothing when windows are sequential', () => {
    expect(
      findClashes([
        { id: 'a', start: 8, end: 10 },
        { id: 'b', start: 11, end: 13 },
      ]).size
    ).toBe(0);
  });

  // Back-to-back is a normal route, not a double-book.
  it('does not treat touching edges as a clash', () => {
    expect(
      findClashes([
        { id: 'a', start: 8, end: 10 },
        { id: 'b', start: 10, end: 12 },
      ]).size
    ).toBe(0);
  });

  it('flags both sides of an overlap', () => {
    const clashes = findClashes([
      { id: 'a', start: 8, end: 11 },
      { id: 'b', start: 10, end: 12 },
    ]);
    expect(clashes.has('a')).toBe(true);
    expect(clashes.has('b')).toBe(true);
  });

  it('flags an overlap given out of order', () => {
    const clashes = findClashes([
      { id: 'late', start: 10, end: 12 },
      { id: 'early', start: 8, end: 11 },
    ]);
    expect(clashes.size).toBe(2);
  });

  it('flags a triple-book', () => {
    const clashes = findClashes([
      { id: 'a', start: 8, end: 12 },
      { id: 'b', start: 9, end: 13 },
      { id: 'c', start: 10, end: 14 },
    ]);
    expect(clashes.size).toBe(3);
  });
});

describe('formatAge', () => {
  const now = new Date('2026-03-15T12:00:00Z');

  it('coarsens as the wait grows', () => {
    expect(formatAge('2026-03-15T11:19:00Z', now)).toBe('41m');
    expect(formatAge('2026-03-15T10:00:00Z', now)).toBe('2h');
    expect(formatAge('2026-03-14T12:00:00Z', now)).toBe('1d');
    expect(formatAge('2026-03-11T12:00:00Z', now)).toBe('4d');
  });

  it('reports sub-minute work as 0m rather than blank', () => {
    expect(formatAge('2026-03-15T11:59:40Z', now)).toBe('0m');
  });

  // Clock skew between server and browser shouldn't print "-3m".
  it('says nothing for a future timestamp', () => {
    expect(formatAge('2026-03-15T12:05:00Z', now)).toBeNull();
  });

  it('says nothing for an unparseable timestamp', () => {
    expect(formatAge('nope', now)).toBeNull();
  });
});

describe('compareRailOrder', () => {
  const wo = (priority: string, createdAt: string) => ({ priority, createdAt });

  // The server sorts priority alphabetically (it's a string column), which
  // gives HIGH, LOW, NORMAL, URGENT — LOW second and URGENT last.
  it('orders by severity, not alphabetically', () => {
    const sorted = [
      wo('LOW', '2026-03-01T00:00:00Z'),
      wo('URGENT', '2026-03-01T00:00:00Z'),
      wo('NORMAL', '2026-03-01T00:00:00Z'),
      wo('HIGH', '2026-03-01T00:00:00Z'),
    ]
      .sort(compareRailOrder)
      .map((w) => w.priority);

    expect(sorted).toEqual(['URGENT', 'HIGH', 'NORMAL', 'LOW']);
  });

  it('breaks ties on age, oldest first', () => {
    const sorted = [
      wo('HIGH', '2026-03-05T00:00:00Z'),
      wo('HIGH', '2026-03-01T00:00:00Z'),
    ]
      .sort(compareRailOrder)
      .map((w) => w.createdAt);

    expect(sorted[0]).toBe('2026-03-01T00:00:00Z');
  });

  // Severity always beats age: a fresh URGENT outranks an old LOW.
  it('never lets age outrank severity', () => {
    const sorted = [
      wo('LOW', '2020-01-01T00:00:00Z'),
      wo('URGENT', '2026-03-15T00:00:00Z'),
    ].sort(compareRailOrder);

    expect(sorted[0].priority).toBe('URGENT');
  });

  it('sinks an unknown priority rather than dropping it', () => {
    const sorted = [
      wo('MYSTERY', '2020-01-01T00:00:00Z'),
      wo('LOW', '2026-03-15T00:00:00Z'),
    ].sort(compareRailOrder);

    expect(sorted.map((w) => w.priority)).toEqual(['LOW', 'MYSTERY']);
  });
});
