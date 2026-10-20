import { workItemStatusTone } from './workItemStatusTone';
import type { ProgressCategory } from '@dispatch/api';

describe('workItemStatusTone', () => {
  it.each<[ProgressCategory, string]>([
    ['NOT_STARTED', 'info'],
    ['AWAITING_SCHEDULE', 'info'],
    ['IN_PROGRESS', 'warning'],
    ['BLOCKED', 'danger'],
    ['COMPLETED', 'success'],
    ['CANCELLED', 'neutral'],
  ])('maps %s to %s', (category, tone) => {
    expect(workItemStatusTone(category)).toBe(tone);
  });
});
