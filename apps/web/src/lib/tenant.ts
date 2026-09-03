// ─────────────────────────────────────────────────────────────────
// tenant.ts — which workspace is this tab acting in?
//
// One person, one login, N workspaces. The JWT identifies the person; the
// `X-Tenant-Id` header names the workspace. This module owns the single
// ordered answer to "which one", so there is exactly one place to change when
// per-tenant subdomains land:
//
//     slugFromHost()  ??  storedTenantId()  ??  the picker
//
// Deriving from the host rather than validating against it is deliberate. If
// the URL and the active tenant were two independent inputs they could
// disagree — someone reading "globex" in the address bar while looking at
// ACME's jobs — and that disagreement would be invisible. One input has no
// divergence mode.
//
// The header is untrusted and that is fine: the backend only honours a tenant
// if an enabled membership row exists for (that tenant, this person). Nothing
// here is a security boundary; membership is.
// ─────────────────────────────────────────────────────────────────
// Imported from the package rather than `../api/setup` on purpose: setup.ts
// installs this module's tenant provider, so pointing back at it would read as
// a cycle even though a type-only import is erased.
import type { TenantMembership } from '@dispatch/api';

// Per-tab. This is what lets two tabs sit on two workspaces and each survive
// its own reload — a single shared key would make reloading tab B silently
// adopt tab A's last switch.
const SESSION_KEY = 'dispatch.activeTenantId';

// Last workspace chosen anywhere; seeds a *fresh* tab that has no session
// value yet. Never consulted while the session key is set.
const LOCAL_KEY = 'dispatch.defaultTenantId';

// Storage throws outright in some contexts (privacy mode, embedded webviews,
// browsers set to block site data), so every access is guarded. Losing the
// stored tenant degrades to the picker, which is a working state.
function safeRead(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeWrite(storage: Storage | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Non-fatal: the tab keeps working, it just won't be remembered.
  }
}

function safeRemove(storage: Storage | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Non-fatal.
  }
}

// The resolved tenant for this tab. Held in a module variable rather than read
// from storage on every request because the interceptor must see the *validated*
// choice — one confirmed against the membership list — not whatever a previous
// session left behind. Until bootstrap sets it, no header is sent and the
// backend falls back to the legacy claim, which is the correct behaviour
// mid-rollout.
let activeTenantId: string | null = null;

export function setActiveTenantId(tenantId: string | null): void {
  activeTenantId = tenantId;
}

export function getActiveTenantId(): string | null {
  return activeTenantId;
}

/** The tenant this tab last acted in: session first, then the fresh-tab seed. */
export function storedTenantId(): string | null {
  return (
    safeRead(globalThis.sessionStorage, SESSION_KEY) ??
    safeRead(globalThis.localStorage, LOCAL_KEY)
  );
}

/**
 * Remember a choice in both tiers — this tab now, and as the seed for the next
 * fresh one.
 */
export function persistTenantId(tenantId: string): void {
  safeWrite(globalThis.sessionStorage, SESSION_KEY, tenantId);
  safeWrite(globalThis.localStorage, LOCAL_KEY, tenantId);
}

/**
 * Forget the stored tenant. Called when the backend says the membership is
 * gone (`NOT_A_MEMBER` / `USER_DISABLED`) so the next load reaches the picker
 * instead of retrying a workspace this person can no longer enter.
 */
export function clearStoredTenant(): void {
  safeRemove(globalThis.sessionStorage, SESSION_KEY);
  safeRemove(globalThis.localStorage, LOCAL_KEY);
}

/**
 * The workspace slug named by the hostname, or null on the base domain.
 *
 * Subdomains sit under the *environment* base — `acme.dev.dispatch.example.net`
 * in dev, not `acme.dispatch.example.net` — so the base is a build constant
 * rather than a heuristic on `dev`/`qa` prefixes. With `VITE_TENANT_BASE_DOMAIN`
 * unset (the case until subdomains ship) this always returns null and the app
 * resolves from storage exactly as it does today.
 */
export function slugFromHost(
  hostname: string = globalThis.location?.hostname ?? '',
  baseDomain: string | undefined = import.meta.env.VITE_TENANT_BASE_DOMAIN
): string | null {
  if (!baseDomain || !hostname) return null;
  if (hostname === baseDomain) return null; // bare apex — no workspace named

  const suffix = `.${baseDomain}`;
  if (!hostname.endsWith(suffix)) return null;

  const label = hostname.slice(0, -suffix.length);
  // Only a single leading label is a workspace. Anything deeper is not a shape
  // we issue, and guessing at it would resolve the wrong workspace.
  if (!label || label.includes('.')) return null;
  return label.toLowerCase();
}

/**
 * What the app should do on load, given the person's memberships.
 *
 * `unknown-workspace` only occurs on a tenant subdomain whose slug the person
 * has no membership for. It is distinct from `none` because the remedy differs:
 * one is "you're not in *this* workspace, here are yours", the other is "you're
 * not in any workspace at all".
 */
export type TenantResolution =
  | { kind: 'resolved'; membership: TenantMembership; source: 'host' | 'stored' | 'only' }
  | { kind: 'picker' }
  | { kind: 'none' }
  | { kind: 'unknown-workspace'; slug: string };

export function resolveActiveTenant(
  memberships: TenantMembership[],
  hostname?: string,
  baseDomain?: string
): TenantResolution {
  // 1. The host, when it names one. Authoritative over storage: someone who
  //    followed a link to acme.… means ACME, whatever this tab did last.
  const slug = slugFromHost(hostname, baseDomain);
  if (slug) {
    const bySlug = memberships.find((m) => m.tenantSlug.toLowerCase() === slug);
    return bySlug
      ? { kind: 'resolved', membership: bySlug, source: 'host' }
      : { kind: 'unknown-workspace', slug };
  }

  if (memberships.length === 0) return { kind: 'none' };

  // 2. What this tab (or the last fresh one) chose — but only if it is still a
  //    workspace they belong to. A revoked membership falls through rather than
  //    resurrecting a dead choice.
  const stored = storedTenantId();
  if (stored) {
    const byStored = memberships.find((m) => m.tenantId === stored);
    if (byStored) return { kind: 'resolved', membership: byStored, source: 'stored' };
  }

  // 3. One workspace is not a choice — never show a picker for it.
  if (memberships.length === 1 && memberships[0]) {
    return { kind: 'resolved', membership: memberships[0], source: 'only' };
  }

  // 4. Genuinely ambiguous. The picker is a fallback, not a daily toll gate:
  //    it appears only when nothing above answered.
  return { kind: 'picker' };
}
