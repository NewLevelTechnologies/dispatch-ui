import { describe, it, expect } from 'vitest';
import { tripsByWorkItem } from './tripsByWorkItem';
import type { DispatchBoardRow } from '@dispatch/api';

const dispatch = (
  id: string,
  arrivalWindowStart: string,
  status: string,
  addressedWorkItemIds: string[]
): DispatchBoardRow =>
  ({ id, arrivalWindowStart, status, addressedWorkItemIds }) as unknown as DispatchBoardRow;

describe('tripsByWorkItem', () => {
  it('maps work items to positional trip numbers by arrival, skipping cancelled trips', () => {
    const map = tripsByWorkItem([
      dispatch('a', '2026-05-02T09:00:00Z', 'SCHEDULED', ['wi-1']),
      dispatch('b', '2026-05-01T09:00:00Z', 'COMPLETED', ['wi-1', 'wi-2']),
      dispatch('c', '2026-05-03T09:00:00Z', 'CANCELLED', ['wi-3']),
    ]);
    // Ordered by arrival (b before a); cancelled 'c' excluded → positions b=1, a=2.
    expect(map.get('wi-1')).toEqual([1, 2]);
    expect(map.get('wi-2')).toEqual([1]);
    expect(map.has('wi-3')).toBe(false);
  });

  it('returns an empty map when there are no dispatches', () => {
    expect(tripsByWorkItem([]).size).toBe(0);
  });
});
