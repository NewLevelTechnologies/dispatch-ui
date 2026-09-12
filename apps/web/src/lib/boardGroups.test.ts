import { describe, it, expect } from 'vitest';
import { buildGroups, foldEmptyRows } from './boardGroups';

const tech = (id: string, primaryRegionId: string | null, regionIds = [primaryRegionId]) => ({
  id,
  name: id,
  regionIds: regionIds.filter((r): r is string => !!r),
  primaryRegionId,
});

const REGIONS = [
  { id: 'r1', name: 'Phoenix' },
  { id: 'r2', name: 'East Valley' },
];

const count = () => ({ stops: 0, held: 0 });

describe('buildGroups', () => {
  it('returns one unlabelled bucket when grouping is off', () => {
    const groups = buildGroups([tech('a', 'r1'), tech('b', 'r2')], {
      grouped: false,
      regions: REGIONS,
      summarize: count,
      orphanLabel: 'No region',
    });

    expect(groups).toHaveLength(1);
    // A lone group header never renders, and null is how the renderer knows.
    expect(groups[0].label).toBeNull();
    expect(groups[0].techs).toHaveLength(2);
  });

  it('follows the tenant’s own region order', () => {
    const groups = buildGroups([tech('b', 'r2'), tech('a', 'r1')], {
      grouped: true,
      regions: REGIONS,
      summarize: count,
      orphanLabel: 'No region',
    });
    expect(groups.map((g) => g.label)).toEqual(['Phoenix', 'East Valley']);
  });

  // Rendering someone twice would let a double-book hide in plain sight.
  it('renders a multi-region tech exactly once, in their primary', () => {
    const groups = buildGroups([tech('a', 'r1', ['r1', 'r2'])], {
      grouped: true,
      regions: REGIONS,
      summarize: count,
      orphanLabel: 'No region',
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Phoenix');
  });

  it('drops a region nobody is primary in', () => {
    const groups = buildGroups([tech('a', 'r1')], {
      grouped: true,
      regions: REGIONS,
      summarize: count,
      orphanLabel: 'No region',
    });
    expect(groups.map((g) => g.label)).toEqual(['Phoenix']);
  });

  it('gives a tech with no region a row of their own', () => {
    const groups = buildGroups([tech('a', 'r1'), tech('b', null, [])], {
      grouped: true,
      regions: REGIONS,
      summarize: count,
      orphanLabel: 'No region',
    });
    expect(groups.map((g) => g.label)).toEqual(['Phoenix', 'No region']);
  });

  // Never drop a person off the board: a primary region the tenant no longer
  // lists matches no group, and without this test it also matched no orphan
  // check — so the technician simply vanished.
  it('keeps a tech whose primary region is no longer in the registry', () => {
    const groups = buildGroups([tech('a', 'r1'), tech('gone', 'r-archived')], {
      grouped: true,
      regions: REGIONS,
      summarize: count,
      orphanLabel: 'No region',
    });

    expect(groups.map((g) => g.label)).toEqual(['Phoenix', 'No region']);
    expect(groups[1].techs.map((t) => t.id)).toEqual(['gone']);
  });

  it('summarizes each group with the caller’s own arithmetic', () => {
    const groups = buildGroups([tech('a', 'r1'), tech('b', 'r1')], {
      grouped: true,
      regions: REGIONS,
      summarize: (list) => ({ stops: list.length * 2, held: list.length }),
      orphanLabel: 'No region',
    });
    expect(groups[0]).toMatchObject({ stops: 4, held: 2 });
  });
});

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
