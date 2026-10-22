import type { User } from '@dispatch/api';

/**
 * True for field roles that should only ever see their own work — the
 * Technician template: VIEW_ASSIGNED_WORK_ORDERS without VIEW_ALL_WORK_ORDERS.
 * Ported from web's `useCurrentUser.ts`, where it also drives the post-login
 * landing and the work order list's scope; here it only feeds the assignment
 * test below.
 */
export function isAssignedOnly(user: Pick<User, 'capabilities'> | undefined): boolean {
  const caps = user?.capabilities ?? [];
  return caps.includes('VIEW_ASSIGNED_WORK_ORDERS') && !caps.includes('VIEW_ALL_WORK_ORDERS');
}

/**
 * What the signed-in user may do, by the tenant's own role configuration —
 * a port of web's `workOrderAccess` (`apps/web/src/hooks/useWorkOrderAccess.ts`),
 * which mirrors the backend's capability rules so the app never offers a
 * control the server would refuse.
 *
 * Only `canEdit` is modelled for now: it's the one rule mobile has a surface
 * for (the dispatch status actions). Web's other flags — canEditAll, canCancel,
 * canViewAll — gate archive/delete/cancel and the callback picker, none of
 * which exist here or are planned to.
 *
 * Capabilities are raw strings, not an enum, on both sides — the backend
 * defines them and a tenant admin assigns them per role.
 */
export interface WorkOrderAccess {
  /**
   * EDIT_ALL_WORK_ORDERS, or EDIT_ASSIGNED_WORK_ORDERS on work the user holds
   * this dispatch for.
   */
  canEdit: boolean;
}

export function workOrderAccess(
  user: Pick<User, 'id' | 'capabilities'> | undefined,
  /** The dispatch's own assignee. Mobile has it directly; web has to look through the work order's `assignedUsers`. */
  assignedUserId?: string | null,
): WorkOrderAccess {
  const caps = user?.capabilities ?? [];
  // An assigned-only viewer can only ever be shown their own jobs, so having
  // the record in hand is itself proof of assignment — same shortcut web takes.
  const assigned = isAssignedOnly(user) || (!!assignedUserId && assignedUserId === user?.id);
  return {
    canEdit: caps.includes('EDIT_ALL_WORK_ORDERS') || (caps.includes('EDIT_ASSIGNED_WORK_ORDERS') && assigned),
  };
}
