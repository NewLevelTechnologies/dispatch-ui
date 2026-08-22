import type { QueryClient } from '@tanstack/react-query';

// Every cache key whose payload embeds role data — so a change to a role's
// name, color (`accentId`), capabilities, or existence must trigger a
// refetch here too. Otherwise stale user / role / capabilities responses
// keep rendering the old role state until a hard refresh.
//
// Touched by: role create/update/delete/clone/restore-defaults flows on
// the list, detail, and form pages. Centralized so adding another consumer
// later is a single-file change.
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
}
