import type { WorkflowTransition, WorkItemResponse, WorkItemStatus } from '../api/setup';

// Seeded status codes the Work Items tab acts on. Codes are stable across
// tenant renames (the name is the tenant's label, the code is the seed's).
export const PENDING_PARTS_CODE = 'PENDING_PARTS';
export const PARTS_ARRIVED_CODE = 'PARTS_ARRIVED';
export const COMPLETE_CODE = 'COMPLETE';

/**
 * Statuses the item may move to next. Unenforced workflows (or an item with no
 * current status) allow any other active status; enforced ones only the
 * statuses a defined transition reaches from the current one.
 */
export function allowedTargetStatuses(
  workItem: Pick<WorkItemResponse, 'statusId'>,
  statuses: WorkItemStatus[],
  transitions: WorkflowTransition[],
  enforceWorkflow: boolean,
): WorkItemStatus[] {
  const active = statuses.filter((s) => s.isActive);
  if (!enforceWorkflow || !workItem.statusId) {
    return active.filter((s) => s.id !== workItem.statusId);
  }
  const allowedIds = new Set(
    transitions.filter((tx) => tx.fromStatusId === workItem.statusId).map((tx) => tx.toStatusId),
  );
  return active.filter((s) => allowedIds.has(s.id));
}

/** The "Mark complete" target: the seeded COMPLETE status, else any allowed
 *  COMPLETED-category status. Null when the workflow doesn't allow one. */
export function completeTarget(allowed: WorkItemStatus[]): WorkItemStatus | null {
  return (
    allowed.find((s) => s.code === COMPLETE_CODE) ??
    allowed.find((s) => s.statusCategory === 'COMPLETED') ??
    null
  );
}

/** The "Parts arrived" target, when the workflow allows it. */
export function partsArrivedTarget(allowed: WorkItemStatus[]): WorkItemStatus | null {
  return allowed.find((s) => s.code === PARTS_ARRIVED_CODE) ?? null;
}
