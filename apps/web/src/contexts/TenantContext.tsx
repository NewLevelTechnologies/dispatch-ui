/* eslint-disable react-refresh/only-export-components -- provider + its hook live together, matching GlossaryContext. */
// ─────────────────────────────────────────────────────────────────
// TenantContext — which workspace this tab is acting in, and the states
// around not having one.
//
// The active workspace is chrome, not content: it lives in the sidebar brand
// block and never becomes a field, a setting, or a filter. This context is the
// only place it is decided, so there is exactly one answer to "which tenant"
// for the whole app.
// ─────────────────────────────────────────────────────────────────
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { apiClient, userApi, type TenantMembership } from '../api/setup';
import {
  clearStoredTenant,
  persistTenantId,
  resolveActiveTenant,
  setActiveTenantId,
  type TenantResolution,
} from '../lib/tenant';

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

const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  // Reads auth itself rather than taking a prop: this provider sits above App,
  // because App's own tenant-scoped queries have to wait on the active
  // workspace this context resolves.
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const isAuthenticated = authStatus === 'authenticated';
  const queryClient = useQueryClient();
  // Only the explicit choice is state. The active membership is derived from it
  // plus the resolver, so there is no effect writing state back into render —
  // and no window where the two disagree.
  const [chosenTenantId, setChosenTenantId] = useState<string | null>(null);
  const [revokedFrom, setRevokedFrom] = useState<TenantMembership | null>(null);

  const {
    data: memberships,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['me', 'tenants'],
    queryFn: () => userApi.listMyTenants(),
    enabled: isAuthenticated,
    // An empty list is a legitimate answer, not a transient failure, so there is
    // nothing here worth retrying into.
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const list = useMemo(() => memberships ?? [], [memberships]);

  const selectTenant = useCallback((membership: TenantMembership) => {
    setChosenTenantId(membership.tenantId);
    setRevokedFrom(null);
  }, []);

  const switchTenant = useCallback(
    (membership: TenantMembership) => {
      setChosenTenantId(membership.tenantId);
      setRevokedFrom(null);
      // Not optional: every cached list, detail and count belongs to the
      // workspace being left. Dropping the cache is what makes a switch safe
      // without a reload.
      queryClient.clear();
    },
    [queryClient]
  );

  // An explicit choice wins over the resolver — re-resolving mid-session would
  // fight a switch the person just made.
  const resolution = useMemo<TenantResolution | null>(() => {
    if (!isAuthenticated || isLoading || error || !memberships) return null;
    if (revokedFrom) return null;
    if (chosenTenantId) {
      const chosen = list.find((m) => m.tenantId === chosenTenantId);
      if (chosen) return { kind: 'resolved', membership: chosen, source: 'stored' };
    }
    return resolveActiveTenant(list);
  }, [isAuthenticated, isLoading, error, memberships, revokedFrom, chosenTenantId, list]);

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
    if (activeMembership) persistTenantId(activeMembership.tenantId);
  }, [activeMembership]);

  // Membership revoked mid-session. Latching matters: the 403 fires on every
  // request in flight, so this must not stack up.
  useEffect(() => {
    apiClient.setTenantRevokedHandler(() => {
      setRevokedFrom((prev) => prev ?? activeMembership);
      clearStoredTenant();
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

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}
