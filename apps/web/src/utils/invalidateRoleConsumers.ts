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
