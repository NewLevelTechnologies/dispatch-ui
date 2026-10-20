// ─────────────────────────────────────────────────────────────────
// tenant.ts — which workspace is this app acting in?
//
// Mirrors apps/web/src/lib/tenant.ts, trimmed for mobile:
//
//  - No `slugFromHost`/subdomain resolution. That exists on web because a
//    workspace can be named by the URL (acme.dispatch.example.net); there is
//    no equivalent concept on a native app with one fixed entry point, so the
//    whole `source: 'host'` / `unknown-workspace` branch is dropped rather
//    than ported unused.
//  - One storage tier, not two. Web splits sessionStorage (per-tab) from
//    localStorage (seeds a fresh tab) because two tabs can sit on two
//    workspaces at once. A phone has exactly one "tab" — there is nothing a
//    second tier would protect against — so this keeps a single persisted
//    choice via AsyncStorage.
//  - Storage reads are async (AsyncStorage has no sync API), so callers
//    that need the stored id must await it — see TenantContext's hydration
//    effect — rather than reading it inline during render as web does.
// ─────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TenantMembership } from '../api/setup';

const STORAGE_KEY = 'dispatch.activeTenantId';

// The resolved tenant for this process. Held in a module variable rather than
// read from storage on every request because the interceptor must see the
// *validated* choice — one confirmed against the membership list — not
// whatever a previous session left behind. Until bootstrap sets it, no header
// is sent and the backend falls back to the legacy claim, which is the
// correct behaviour mid-rollout (see packages/api/src/client.ts).
let activeTenantId: string | null = null;

export function setActiveTenantId(tenantId: string | null): void {
  activeTenantId = tenantId;
}

export function getActiveTenantId(): string | null {
  return activeTenantId;
}

/** The workspace this device last acted in, or null if none was ever chosen. */
export async function storedTenantId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Losing the stored tenant degrades to the picker, which is a working
    // state — never worth failing sign-in over.
    return null;
  }
}

export async function persistTenantId(tenantId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, tenantId);
  } catch {
    // Non-fatal: the app keeps working, it just won't be remembered.
  }
}

/**
 * Forget the stored tenant. Called when the backend says the membership is
 * gone (`NOT_A_MEMBER` / `USER_DISABLED`) so the next load reaches the picker
 * instead of retrying a workspace this person can no longer enter.
 */
export async function clearStoredTenant(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Non-fatal.
  }
}

/** What the app should do on load, given the person's memberships. */
export type TenantResolution =
  | { kind: 'resolved'; membership: TenantMembership; source: 'stored' | 'only' }
  | { kind: 'picker' }
  | { kind: 'none' };

export function resolveActiveTenant(
  memberships: TenantMembership[],
  stored: string | null
): TenantResolution {
  if (memberships.length === 0) return { kind: 'none' };

  // 1. What this device last chose — but only if it is still a workspace
  //    they belong to. A revoked membership falls through rather than
  //    resurrecting a dead choice.
  if (stored) {
    const byStored = memberships.find((m) => m.tenantId === stored);
    if (byStored) return { kind: 'resolved', membership: byStored, source: 'stored' };
  }

  // 2. One workspace is not a choice — never show a picker for it.
  if (memberships.length === 1 && memberships[0]) {
    return { kind: 'resolved', membership: memberships[0], source: 'only' };
  }

  // 3. Genuinely ambiguous. The picker is a fallback, not a daily toll gate:
  //    it appears only when nothing above answered.
  return { kind: 'picker' };
}
