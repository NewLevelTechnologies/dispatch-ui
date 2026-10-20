import type { QueryClient } from '@tanstack/react-query';

// Every cache key whose payload embeds role data — so a change to a role's
// name, color (`accentId`), capabilities, or existence must trigger a
// refetch here too. Otherwise stale user / role / capabilities responses
// keep rendering the old role state until a hard refresh.
//
// Touched by: role create/update/delete/clone/restore-defaults flows on
// the list, detail, and form pages. Centralized so adding another consumer
// later is a single-file change.
/**
 * Every cache that depends on WHO IS ON THE DISPATCH BOARD.
 *
 * Board membership is `enabled && roles.any { performsFieldWork }`, narrowed
 * by region — so it moves when a user's `dispatchable` override changes, when
 * their roles change, when they are enabled or disabled, when their regions
 * change, and when a ROLE's own field-work flag is toggled. None of those
 * live anywhere near the board, which is exactly why this is one function:
 * the next surface that shifts membership should be a one-line change here,
 * not a bug report about a stale board.
 *
 * The prefix covers both board reads — the grid (`['dispatch-board', date,
 * scope]`) and the unscheduled rail (`['dispatch-board', 'unscheduled', …]`).
 */
export function invalidateDispatchBoard(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['dispatch-board'] });
}

/**
 * Every cache that shows a dispatch, or anything derived from one.
 *
 * Writing a dispatch reaches further than the board: the work order's visit
 * list, its progress (scheduling a visit moves a work item out of
 * awaiting-schedule), its activity feed, the work-order list's scheduled
 * column, and the location's on-site tech summary. The board used to
 * invalidate only its own read, so scheduling from the board left a stale
 * work-order page behind it.
 *
 * One function so the next surface that writes a dispatch inherits the whole
 * set instead of rediscovering it one bug at a time. Pass `workOrderId` to
 * scope the activity feed; omit it when a drag could have touched any.
 */
export function invalidateDispatchConsumers(qc: QueryClient, workOrderId?: string) {
  qc.invalidateQueries({ queryKey: ['dispatch-board'] });
  qc.invalidateQueries({ queryKey: ['dispatches'] });
  qc.invalidateQueries({ queryKey: ['dispatch'] });
  qc.invalidateQueries({
    queryKey: workOrderId ? ['work-order-activity', workOrderId] : ['work-order-activity'],
  });
  // On-site tech summary on the location page.
  qc.invalidateQueries({ queryKey: ['location-tech'] });
  qc.invalidateQueries({ queryKey: ['work-orders-list'] });
  qc.invalidateQueries({ queryKey: ['work-orders'] });
}

export function invalidateRoleConsumers(qc: QueryClient, roleId?: string) {
  qc.invalidateQueries({ queryKey: ['roles'] });
  if (roleId) {
    qc.invalidateQueries({ queryKey: ['roles', roleId] });
  }
  // Users embed `roles: Role[]` (with accentId) on their payload — both the
  // list (UsersPage) and the single-user detail (UserDetailPage).
  qc.invalidateQueries({ queryKey: ['users'] });
  // Current user feeds the sidebar/account chips with their own role list.
  qc.invalidateQueries({ queryKey: ['currentUser'] });
  // A role carries `performsFieldWork`, so toggling that flag adds or removes
  // every holder from the board at once.
  invalidateDispatchBoard(qc);
}
