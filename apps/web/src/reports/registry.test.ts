import { describe, it, expect } from 'vitest';
import { reports, findReport } from './registry';

describe('reports registry', () => {
  it('exposes a non-empty catalog', () => {
    expect(reports.length).toBeGreaterThan(0);
  });

  it('every entry has the required shape', () => {
    for (const r of reports) {
      expect(typeof r.slug).toBe('string');
      expect(r.slug.length).toBeGreaterThan(0);
      expect(typeof r.title).toBe('string');
      expect(typeof r.description).toBe('string');
      expect(r.Component).toBeDefined();
    }
  });
});

describe('findReport()', () => {
  it('resolves a known slug', () => {
    const def = findReport('filter-pull-list');
    expect(def).toBeDefined();
    expect(def?.slug).toBe('filter-pull-list');
  });

  it('returns undefined for an unknown slug', () => {
    expect(findReport('not-a-real-report')).toBeUndefined();
  });

  it('returns undefined when slug is missing', () => {
    expect(findReport(undefined)).toBeUndefined();
  });
});
