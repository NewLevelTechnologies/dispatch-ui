// ─────────────────────────────────────────────────────────────────────
// Can this person be assigned work?
//
// The fact is ASSIGNABILITY, not board visibility. The same flag gates the
// dispatch board, the composer's tech picker, and the work-order dispatch
// drawer — so a reader who is told only about the board would reasonably
// assume switching it off merely hides someone from a view while a CSR could
// still assign them from the work order. It doesn't.
//
// Two fields answer it, and they answer different halves: `performsFieldWork`
// is the RESOLVED truth (the server owns the precedence) and `dispatchable`
// says whether a per-user override produced it. The resolved answer alone is
// no use to an admin who thinks it's wrong — they need the cause to know
// where to go and change it.
//
// Structure, not prose: this returns the pieces and the caller renders them,
// so the surface line can carry the tenant's glossary term for "dispatch".
// ─────────────────────────────────────────────────────────────────────
import type { User } from '../api/setup';

/** A run of reason text. `strong` marks the parts a reader scans for — the
 *  role being inherited from, or the override that beat it. */
export interface ReasonPart {
  text: string;
  strong?: boolean;
}

export interface AssignmentSummary {
  /** The effective answer. Drives the pill. */
  assignable: boolean;
  /**
   * Whether to show an override tag, and how loudly.
   *
   * `null` while INHERIT: the overwhelming majority of users are inheriting,
   * and for them the override should read as though the field doesn't exist.
   * `'warning'` only when NEVER contradicts a role that would otherwise
   * qualify — that is how a technician silently vanishes from the board with
   * nobody able to explain why, so it gets volume.
   */
  override: 'neutral' | 'warning' | null;
  reason: ReasonPart[];
}

// NOTE: there is deliberately no "assignable but has no regions" warning.
// Regions NARROW, they do not exclude: scheduling-service applies a region
// condition only when a filter is actually set (`findBoardTechs`' regionsSet
// flag), so a tech with no assignments still appears on the unfiltered board.
// They drop out only for a dispatcher who has narrowed to a specific region —
// which is what narrowing means, not a misconfiguration. Warning about it
// would push admins to assign regions in single-region tenants that have no
// use for them.

export function summarizeAssignment(
  user: Pick<User, 'dispatchable' | 'performsFieldWork' | 'roles'>,
): AssignmentSummary {
  const granting = (user.roles ?? []).filter((r) => r.performsFieldWork);
  const rolesQualify = granting.length > 0;
  const roleNames = granting.map((r) => r.name).join(', ');
  const override = user.dispatchable ?? 'INHERIT';

  // The resolved answer is the server's to give. Fall back to the roles only
  // when it hasn't been sent, so the two can't disagree on screen.
  const assignable = user.performsFieldWork ?? rolesQualify;

  // The pill already says assignable-or-not, and the badge already says an
  // override is in play. So the reason line carries ONLY what neither can:
  // why. Restating "set to always for this user" would spend a line repeating
  // two things already on screen — and "for this user" is dead words on the
  // user's own page.
  if (override === 'ALWAYS' || override === 'NEVER') {
    const contradicts = override === 'NEVER' && rolesQualify;
    return {
      assignable,
      // Loud only when NEVER overrides a role that would otherwise qualify —
      // that's how a technician silently vanishes with nobody able to explain
      // why. Everywhere else an override is quiet chrome.
      override: contradicts ? 'warning' : 'neutral',
      reason: contradicts
        ? [{ text: 'Overrides the ' }, { text: roleNames, strong: true }, { text: ' role' }]
        : rolesQualify
          ? [
              { text: 'The ' },
              { text: roleNames, strong: true },
              // Worth saying quietly: the override is doing nothing, so
              // removing a role won't behave the way an admin expects.
              { text: ' role already qualifies' },
            ]
          : [{ text: 'No role here performs field work' }],
    };
  }

  // INHERIT — say nothing about the override at all.
  if (rolesQualify) {
    return {
      assignable,
      override: null,
      reason: [{ text: 'From the ' }, { text: roleNames, strong: true }, { text: ' role' }],
    };
  }


  // Nested role objects don't always carry the flag. When the resolved answer
  // says assignable but no visible role explains it, stay vague rather than
  // printing a cause that contradicts the pill beside it.
  return {
    assignable,
    override: null,
    reason: assignable
      ? [{ text: 'From their roles' }]
      : [{ text: 'No role here performs field work' }],
  };
}
