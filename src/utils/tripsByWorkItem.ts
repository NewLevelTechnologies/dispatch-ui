import type { DispatchBoardRow } from '../api';

/**
 * Maps each work-item id → the positional trip numbers that address it.
 *
 * The trip NUMBER shown to users is positional — 1-indexed by arrival across the
 * WO's non-cancelled visits — matching the dispatch drawer, Dispatches tab and
 * Files tab. Deliberately NOT the backend `seq` (stable-at-creation, counts
 * cancelled/rescheduled trips, so a churned WO would read "trip 21"). Only trips
 * that explicitly address a work item are attributed; whole-WO (unscoped) trips
 * aren't, so those items read "Not scheduled".
 */
export function tripsByWorkItem(dispatches: DispatchBoardRow[]): Map<string, number[]> {
  const ordered = dispatches
    .filter((d) => d.status !== 'CANCELLED')
    .sort(
      (a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime()
    );
  const tripNumber = new Map<string, number>();
  ordered.forEach((d, i) => tripNumber.set(d.id, i + 1));

  const byWorkItem = new Map<string, number[]>();
  ordered.forEach((d) => {
    const n = tripNumber.get(d.id)!;
    (d.addressedWorkItemIds ?? []).forEach((wiId) => {
      const arr = byWorkItem.get(wiId) ?? [];
      if (!arr.includes(n)) arr.push(n);
      byWorkItem.set(wiId, arr);
    });
  });
  byWorkItem.forEach((arr) => arr.sort((a, b) => a - b));
  return byWorkItem;
}
