import type { DispatchStatus } from '@dispatch/api';

/**
 * When each tech-initiated action is offered. Mirrors web's
 * DispatchDetailDrawer exactly (`statusMutation`'s `advance` targets and
 * `canComplete`) — same two cases per action: "the expected next step" and
 * "skip ahead because the tech forgot the step before it" (e.g. marking
 * Arrived straight from Scheduled is allowed there, not just from En route).
 */
export function canMarkEnRoute(status: DispatchStatus): boolean {
  return status === 'SCHEDULED';
}

export function canMarkArrived(status: DispatchStatus): boolean {
  return status === 'SCHEDULED' || status === 'EN_ROUTE';
}

export function canComplete(status: DispatchStatus): boolean {
  return status === 'SCHEDULED' || status === 'EN_ROUTE' || status === 'IN_PROGRESS';
}
