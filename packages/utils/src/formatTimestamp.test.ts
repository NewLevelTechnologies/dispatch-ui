import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { formatTimestamp, formatExactTimestamp, RELATIVE_CUTOFF_DAYS } from './formatTimestamp';

// Anchor "now" so the relative band is deterministic. Mid-year so "same
// calendar year" cases are unambiguous.
const NOW = new Date('2026-06-15T12:00:00Z');

const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for null/undefined/invalid', () => {
    expect(formatTimestamp(null)).toBe('');
    expect(formatTimestamp(undefined)).toBe('');
    expect(formatTimestamp('not-a-date')).toBe('');
  });

  it('shows "just now" under a minute', () => {
    expect(formatTimestamp(ago(0))).toBe('just now');
    expect(formatTimestamp(ago(59 * SEC))).toBe('just now');
  });

  it('shows minutes under an hour (no seconds in the band)', () => {
    expect(formatTimestamp(ago(MIN))).toBe('1m ago');
    expect(formatTimestamp(ago(46 * MIN))).toBe('46m ago');
    expect(formatTimestamp(ago(59 * MIN))).toBe('59m ago');
  });

  it('shows hours under a day', () => {
    expect(formatTimestamp(ago(HOUR))).toBe('1h ago');
    expect(formatTimestamp(ago(23 * HOUR))).toBe('23h ago');
  });

  it('shows "yesterday" between 24h and 48h', () => {
    expect(formatTimestamp(ago(24 * HOUR))).toBe('yesterday');
    expect(formatTimestamp(ago(47 * HOUR))).toBe('yesterday');
  });

  it('shows "{n} days ago" from 2 days up to the cutoff', () => {
    expect(formatTimestamp(ago(2 * DAY))).toBe('2 days ago');
    expect(formatTimestamp(ago(6 * DAY))).toBe('6 days ago');
  });

  it('switches to an absolute date at the cutoff (same year drops the year)', () => {
    // 46 days ago — the papercut case — becomes a real date.
    expect(formatTimestamp(ago(46 * DAY))).toBe('Apr 30');
    expect(formatTimestamp(ago(RELATIVE_CUTOFF_DAYS * DAY))).toMatch(/^Jun \d+$/);
  });

  it('includes the year for prior-year dates', () => {
    expect(formatTimestamp('2025-04-14T09:00:00Z')).toBe('Apr 14, 2025');
  });

  it('appends the time when withTime is set on the absolute branch', () => {
    expect(formatTimestamp('2025-04-14T09:00:00Z', { withTime: true })).toMatch(/^Apr 14, 2025, \d/);
  });

  it('renders future timestamps as absolute dates, never "in N"', () => {
    const inThreeDays = new Date(NOW.getTime() + 3 * DAY).toISOString();
    const result = formatTimestamp(inThreeDays);
    expect(result).not.toMatch(/ago|in /);
    expect(result).toMatch(/^Jun \d+$/);
  });
});

describe('formatExactTimestamp', () => {
  it('always returns a full date + time with year', () => {
    expect(formatExactTimestamp('2025-04-14T09:00:00Z')).toMatch(/Apr 14, 2025, \d+:\d{2}/);
  });

  it('returns empty string for invalid input', () => {
    expect(formatExactTimestamp(null)).toBe('');
    expect(formatExactTimestamp('nope')).toBe('');
  });
});
