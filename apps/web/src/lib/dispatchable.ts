// ─────────────────────────────────────────────────────────────────────
// Why a user is (or isn't) on the dispatch board.
//
// Two fields answer it and they answer different halves:
// `performsFieldWork` is the RESOLVED truth (the server owns the
// precedence), and `dispatchable` says whether a per-user override is what
// produced it. The resolved answer alone is not enough for an admin who
// thinks it's wrong — they need the cause to know where to go and change it.
//
// Lives outside the page component so the page file exports only components.
// ─────────────────────────────────────────────────────────────────────
import type { User } from '../api/setup';

export function dispatchableReason(
  user: Pick<User, 'dispatchable' | 'performsFieldWork' | 'roles'>,
): string {
  if (user.dispatchable === 'ALWAYS') return 'Set to Always for this user';
  if (user.dispatchable === 'NEVER') return 'Set to Never for this user';

  // Under INHERIT the cause is the roles, so name the ones responsible — but
  // only the ones we can actually see. Nested role objects don't always carry
  // the flag, and claiming "no role performs field work" while the resolved
  // answer says otherwise would be worse than staying vague about the cause.
  const granting = (user.roles ?? []).filter((r) => r.performsFieldWork);
  if (granting.length > 0) return `From ${granting.map((r) => r.name).join(', ')}`;
  if (user.performsFieldWork) return 'From their roles';
  return 'No role here performs field work';
}
