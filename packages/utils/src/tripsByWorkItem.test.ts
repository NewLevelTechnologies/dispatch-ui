import { describe, it, expect } from 'vitest';
import { dispatchCoversWorkItem, tripsByWorkItem } from './tripsByWorkItem';
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
    const map = tripsByWorkItem(
      [
        dispatch('a', '2026-05-02T09:00:00Z', 'SCHEDULED', ['wi-1']),
        dispatch('b', '2026-05-01T09:00:00Z', 'COMPLETED', ['wi-1', 'wi-2']),
        dispatch('c', '2026-05-03T09:00:00Z', 'CANCELLED', ['wi-3']),
      ],
      ['wi-1', 'wi-2', 'wi-3']
    );
    // Ordered by arrival (b before a); cancelled 'c' excluded → positions b=1, a=2.
    expect(map.get('wi-1')).toEqual([1, 2]);
    expect(map.get('wi-2')).toEqual([1]);
    expect(map.has('wi-3')).toBe(false);
  });

  it('attributes an unscoped trip to every work item', () => {
    const map = tripsByWorkItem(
      [
        dispatch('a', '2026-05-01T09:00:00Z', 'SCHEDULED', []),
        dispatch('b', '2026-05-02T09:00:00Z', 'SCHEDULED', ['wi-2']),
      ],
      ['wi-1', 'wi-2']
    );
    expect(map.get('wi-1')).toEqual([1]);
    expect(map.get('wi-2')).toEqual([1, 2]);
  });

  it('keeps a no-show in the numbering but attributes nothing to it', () => {
    const map = tripsByWorkItem(
      [
        dispatch('a', '2026-05-01T09:00:00Z', 'NO_SHOW', ['wi-1']),
        dispatch('b', '2026-05-02T09:00:00Z', 'SCHEDULED', ['wi-1']),
      ],
      ['wi-1']
    );
    expect(map.get('wi-1')).toEqual([2]);
  });

  it('returns an empty map when there are no dispatches', () => {
    expect(tripsByWorkItem([], ['wi-1']).size).toBe(0);
  });
});

describe('dispatchCoversWorkItem', () => {
  it('covers listed items, and every item when the visit lists none', () => {
    expect(dispatchCoversWorkItem({ status: 'SCHEDULED', addressedWorkItemIds: ['wi-1'] }, 'wi-1')).toBe(true);
    expect(dispatchCoversWorkItem({ status: 'SCHEDULED', addressedWorkItemIds: ['wi-1'] }, 'wi-2')).toBe(false);
    expect(dispatchCoversWorkItem({ status: 'EN_ROUTE', addressedWorkItemIds: [] }, 'wi-2')).toBe(true);
    expect(dispatchCoversWorkItem({ status: 'COMPLETED' }, 'wi-2')).toBe(true);
  });

  it('never covers from a cancelled or no-show visit', () => {
    expect(dispatchCoversWorkItem({ status: 'CANCELLED', addressedWorkItemIds: [] }, 'wi-1')).toBe(false);
    expect(dispatchCoversWorkItem({ status: 'NO_SHOW', addressedWorkItemIds: ['wi-1'] }, 'wi-1')).toBe(false);
  });
});
