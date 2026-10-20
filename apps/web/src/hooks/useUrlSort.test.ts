import { describe, it, expect } from 'vitest';
import { sortRows } from './useUrlSort';

type Row = { name: string; qty?: number | null; at?: string | null };

const rows: Row[] = [
  { name: 'PO-10', qty: 5, at: '2026-03-01' },
  { name: 'po-9', qty: null, at: null },
  { name: 'PO-2', qty: 20, at: '2026-01-15' },
];
const accessors = {
  name: (r: Row) => r.name,
  qty: (r: Row) => r.qty,
  at: (r: Row) => r.at,
};

describe('sortRows', () => {
  it('compares strings case-insensitively with numeric collation', () => {
    expect(sortRows(rows, { key: 'name', dir: 'asc' }, accessors).map((r) => r.name)).toEqual(['PO-2', 'po-9', 'PO-10']);
    expect(sortRows(rows, { key: 'name', dir: 'desc' }, accessors).map((r) => r.name)).toEqual(['PO-10', 'po-9', 'PO-2']);
  });

  it('keeps empty values last in both directions', () => {
    expect(sortRows(rows, { key: 'qty', dir: 'asc' }, accessors).map((r) => r.qty)).toEqual([5, 20, null]);
    expect(sortRows(rows, { key: 'qty', dir: 'desc' }, accessors).map((r) => r.qty)).toEqual([20, 5, null]);
    expect(sortRows(rows, { key: 'at', dir: 'desc' }, accessors).map((r) => r.at)).toEqual(['2026-03-01', '2026-01-15', null]);
  });

  it('leaves the order alone for a key with no accessor, without mutating the input', () => {
    const out = sortRows(rows, { key: 'server', dir: 'asc' }, accessors);
    expect(out).toEqual(rows);
    expect(out).not.toBe(rows);
  });
});
