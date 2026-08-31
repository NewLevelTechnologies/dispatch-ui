import { describe, it, expect } from 'vitest';
import { workItemLabel } from './workItemLabel';

describe('workItemLabel', () => {
  it('formats a single-digit sequence with zero padding', () => {
    expect(workItemLabel('WI', 1)).toBe('WI-01');
  });

  it('formats a double-digit sequence without extra padding', () => {
    expect(workItemLabel('WI', 12)).toBe('WI-12');
  });

  it('uses the tenant abbreviation, not a hardcoded prefix', () => {
    expect(workItemLabel('JOB', 3)).toBe('JOB-03');
  });

  it('handles sequence numbers above 99', () => {
    expect(workItemLabel('WI', 100)).toBe('WI-100');
  });
});
