import type { User, WorkOrderSummary } from '../api/setup';
import { isAssignedOnly, useCurrentUser } from './useCurrentUser';

/**
 * What the current user may do with work orders — mirrors the backend's
 * capability rules (see dispatch-api handoff FE_HANDOFF_work_order_access.md)
 * so controls the server would refuse are never offered.
 *
 * - canEdit: EDIT_ALL_WORK_ORDERS, or EDIT_ASSIGNED_WORK_ORDERS on a work order
 *   the user holds a dispatch on. An assigned-only viewer can only see their
 *   own jobs, so seeing it is proof of assignment; otherwise `assignedUsers`
 *   decides.
 * - canEditAll: archive / unarchive / delete.
 * - canViewAll: the callback picker lists other people's jobs.
 * - Adding a note needs only view access, so there's no flag for it.
 */
export interface WorkOrderAccess {
  canCreate: boolean;
  canEdit: boolean;
  canEditAll: boolean;
  canCancel: boolean;
  canViewAll: boolean;
}

export function workOrderAccess(
  user: Pick<User, 'id' | 'capabilities'> | undefined,
  workOrder?: Pick<WorkOrderSummary, 'assignedUsers'> | null,
): WorkOrderAccess {
  const caps = user?.capabilities ?? [];
  const canEditAll = caps.includes('EDIT_ALL_WORK_ORDERS');
  const assigned =
    isAssignedOnly(user) || !!workOrder?.assignedUsers?.some((u) => u.userId === user?.id);
  return {
    canCreate: caps.includes('CREATE_WORK_ORDERS'),
    canEdit: canEditAll || (caps.includes('EDIT_ASSIGNED_WORK_ORDERS') && assigned),
    canEditAll,
    canCancel: caps.includes('CANCEL_WORK_ORDERS'),
    canViewAll: caps.includes('VIEW_ALL_WORK_ORDERS'),
  };
}

export function useWorkOrderAccess(
  workOrder?: Pick<WorkOrderSummary, 'assignedUsers'> | null,
): WorkOrderAccess {
  const { data: user } = useCurrentUser();
  return workOrderAccess(user, workOrder);
}
