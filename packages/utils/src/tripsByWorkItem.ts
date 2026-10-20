import type { DispatchBoardRow } from '@dispatch/api';

/**
 * Whether a visit covers a work item — the backend's rule for when an item is
 * Scheduled. A covering visit is live (not cancelled, not a no-show) and
 * either lists the item or lists no items at all: an unscoped visit covers the
 * whole work order.
 */
export function dispatchCoversWorkItem(
  d: Pick<DispatchBoardRow, 'status' | 'addressedWorkItemIds'>,
  workItemId: string
): boolean {
  if (d.status === 'CANCELLED' || d.status === 'NO_SHOW') return false;
  const ids = d.addressedWorkItemIds ?? [];
  return ids.length === 0 || ids.includes(workItemId);
}

/**
 * Maps each work-item id → the positional trip numbers of the visits that
 * cover it (see `dispatchCoversWorkItem`). `workItemIds` is the WO's items, so
 * unscoped visits can be attributed to every one of them.
 *
 * The trip NUMBER shown to users is positional — 1-indexed by arrival across the
 * WO's non-cancelled visits — matching the dispatch drawer, Dispatches tab and
 * Files tab. Deliberately NOT the backend `seq` (stable-at-creation, counts
 * cancelled/rescheduled trips, so a churned WO would read "trip 21"). A no-show
 * keeps its number but covers nothing.
 */
export function tripsByWorkItem(
  dispatches: DispatchBoardRow[],
  workItemIds: string[]
): Map<string, number[]> {
  const ordered = dispatches
    .filter((d) => d.status !== 'CANCELLED')
    .sort(
      (a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime()
    );

  const byWorkItem = new Map<string, number[]>();
  ordered.forEach((d, i) => {
    const n = i + 1;
    workItemIds.forEach((wiId) => {
      if (!dispatchCoversWorkItem(d, wiId)) return;
      const arr = byWorkItem.get(wiId) ?? [];
      if (!arr.includes(n)) arr.push(n);
      byWorkItem.set(wiId, arr);
    });
  });
  return byWorkItem;
}
