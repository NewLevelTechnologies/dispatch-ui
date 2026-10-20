import { statusTone } from './statusTone';
import type { DispatchStatus } from '@dispatch/api';

describe('statusTone', () => {
  it.each<[DispatchStatus, string]>([
    ['SCHEDULED', 'info'],
    ['EN_ROUTE', 'accent'],
    ['IN_PROGRESS', 'warning'],
    ['COMPLETED', 'success'],
    ['NO_SHOW', 'danger'],
    ['CANCELLED', 'neutral'],
  ])('maps %s to %s', (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});
