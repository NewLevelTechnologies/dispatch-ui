import { describe, it, expect } from 'vitest';
import { foldEmptyRows } from './boardRows';

describe('foldEmptyRows', () => {
  const rows = [
    { id: 'busy', stops: 3, absent: false },
    { id: 'idle', stops: 0, absent: false },
    { id: 'out', stops: 0, absent: true },
  ];
  const stopsOf = (r: (typeof rows)[number]) => r.stops;
  const absentOf = (r: (typeof rows)[number]) => r.absent;

  it('counts what the fold would hide even while it is off', () => {
    const { shown, foldable } = foldEmptyRows(rows, false, stopsOf, absentOf);
    expect(shown).toHaveLength(3);
    // Which is what decides whether the toggle is offered at all.
    expect(foldable).toBe(1);
  });

  // A technician who is out is never folded: their row IS the information
  // that someone is away, which is exactly what the dispatcher came to see.
  it('folds the idle technician but never the absent one', () => {
    const { shown } = foldEmptyRows(rows, true, stopsOf, absentOf);
    expect(shown.map((r) => r.id)).toEqual(['busy', 'out']);
  });
});
