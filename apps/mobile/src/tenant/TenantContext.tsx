// ─────────────────────────────────────────────────────────────────
// TenantContext — which workspace this app is acting in, and the states
// around not having one.
//
// Port of apps/web/src/contexts/TenantContext.tsx — see tenant.ts for what's
// deliberately different on mobile (one storage tier, async hydration, no
// host/slug resolution).
// ─────────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, userApi, type TenantMembership } from '../api/setup';
import { useAuth } from '../auth/AuthContext';
import { SwitchingOverlay } from './SwitchingOverlay';
import {
  clearStoredTenant,
  persistTenantId,
  resolveActiveTenant,
  setActiveTenantId,
  storedTenantId,
  type TenantResolution,
} from './tenant';

interface TenantContextValue {
  memberships: TenantMembership[];
  activeMembership: TenantMembership | null;
  resolution: TenantResolution | null;
  isLoading: boolean;
  error: unknown;
  /** The workspace whose access ended mid-session, if that has happened. */
  revokedFrom: TenantMembership | null;
  /** Initial selection — nothing is cached yet, so no cache to clear. */
  selectTenant: (membership: TenantMembership) => void;
  /** Change workspace from inside a live session. Clears every cached list. */
  switchTenant: (membership: TenantMembership) => void;
  /** Re-ask which workspaces this person belongs to. */
  refresh: () => void;
}

// Long enough to read the destination name, short enough not to feel like a
// stall. Applies even when the remount is instant.
const SWITCH_HOLD_MS = 450;

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * For anything that genuinely requires a workspace — the gate, and any screen
 * logic branching on tenancy. Throws rather than silently acting on no tenant.
 */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const isAuthenticated = status === 'signedIn';
  const queryClient = useQueryClient();

  // Only the explicit choice is state. The active membership is derived from
  // it plus the resolver, so there is no effect writing state back into
  // render — and no window where the two disagree.
  const [chosenTenantId, setChosenTenantId] = useState<string | null>(null);
  const [revokedFrom, setRevokedFrom] = useState<TenantMembership | null>(null);
  const [switchingTo, setSwitchingTo] = useState<TenantMembership | null>(null);

  // AsyncStorage has no synchronous API — unlike web, which reads
  // sessionStorage/localStorage inline during render — so the device's last
  // choice has to be hydrated into state before resolution can use it.
  const [storedId, setStoredId] = useState<string | null>(null);
  const [storedIdLoaded, setStoredIdLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = await storedTenantId();
      if (!cancelled) {
        setStoredId(id);
        setStoredIdLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const {
    data: memberships,
    isLoading: queryLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['me', 'tenants'],
    queryFn: () => userApi.listMyTenants(),
    enabled: isAuthenticated,
    // An empty list is a legitimate answer, not a transient failure, so there
    // is nothing here worth retrying into.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const list = useMemo(() => memberships ?? [], [memberships]);
  const isLoading = queryLoading || !storedIdLoaded;

  const selectTenant = useCallback((membership: TenantMembership) => {
    setChosenTenantId(membership.tenantId);
    setRevokedFrom(null);
  }, []);

  const switchTenant = useCallback(
    (membership: TenantMembership) => {
      setSwitchingTo(membership);
      setChosenTenantId(membership.tenantId);
      setRevokedFrom(null);
      // Not optional: every cached list, detail and count belongs to the
      // workspace being left. Dropping the cache is what makes a switch safe
      // without a reload.
      queryClient.clear();
    },
    [queryClient]
  );

  // Hold the transition a minimum beat even when the remount is instant, so
  // it reads as a switch rather than a flicker.
  useEffect(() => {
    if (!switchingTo) return;
    const id = setTimeout(() => setSwitchingTo(null), SWITCH_HOLD_MS);
    return () => clearTimeout(id);
  }, [switchingTo]);

  // An explicit choice wins over the resolver — re-resolving mid-session would
  // fight a switch the person just made.
  const resolution = useMemo<TenantResolution | null>(() => {
    if (!isAuthenticated || isLoading || error || !memberships) return null;
    if (revokedFrom) return null;
    if (chosenTenantId) {
      const chosen = list.find((m) => m.tenantId === chosenTenantId);
      if (chosen) return { kind: 'resolved', membership: chosen, source: 'stored' };
    }
    return resolveActiveTenant(list, storedId);
  }, [isAuthenticated, isLoading, error, memberships, revokedFrom, chosenTenantId, list, storedId]);

  const activeMembership = resolution?.kind === 'resolved' ? resolution.membership : null;

  // Written during render, deliberately. This is a module variable, not React
  // state, and the write is idempotent — but it has to land before children
  // render, because a child's query fires on ITS effect and child effects run
  // before the parent's. Doing this in an effect here would let the first
  // request of a session go out with no tenant.
  setActiveTenantId(activeMembership?.tenantId ?? null);

  // Storage, by contrast, only matters for the *next* load, so it is safely an
  // effect rather than another render-phase side effect.
  useEffect(() => {
    if (activeMembership) void persistTenantId(activeMembership.tenantId);
  }, [activeMembership]);

  // Membership revoked mid-session. Latching matters: the 403 fires on every
  // request in flight, so this must not stack up.
  useEffect(() => {
    apiClient.setTenantRevokedHandler(() => {
      setRevokedFrom((prev) => prev ?? activeMembership);
      void clearStoredTenant();
    });
  }, [activeMembership]);

  const value = useMemo<TenantContextValue>(
    () => ({
      memberships: list,
      activeMembership,
      resolution,
      isLoading,
      error,
      revokedFrom,
      selectTenant,
      switchTenant,
      refresh: () => void refetch(),
    }),
    [
      list,
      activeMembership,
      resolution,
      isLoading,
      error,
      revokedFrom,
      selectTenant,
      switchTenant,
      refetch,
    ]
  );

  return (
    <TenantContext.Provider value={value}>
      {children}
      {/* Rendered by the provider, not the switcher, so any caller that
          changes workspace gets the transition — including recovery from a
          revoked membership. */}
      {switchingTo && <SwitchingOverlay companyName={switchingTo.companyName} />}
    </TenantContext.Provider>
  );
}
