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
import { useNavigate } from 'react-router-dom';
import { apiClient, userApi, type TenantMembership } from '../api/setup';
import { SwitchingOverlay } from '../components/workspace/WorkspaceStates';
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

// Long enough to read the destination name, short enough not to feel like a
// stall. Applies even when the remount is instant.
const SWITCH_HOLD_MS = 450;

// Person-scoped, not tenant-scoped: the answer is the same whichever workspace
// is active, so a switch must not evict it.
const MEMBERSHIPS_KEY = ['me', 'tenants'] as const;

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * For anything that genuinely requires a workspace — the gate, and any page
 * logic branching on tenancy. Throws rather than silently acting on no tenant.
 */
export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used inside <TenantProvider>');
  return ctx;
}

/**
 * For chrome that merely *displays* the workspace and already has to handle
 * "not resolved yet" anyway — the sidebar brand block being the case in point.
 * Returns null outside a provider instead of taking the app down, so rendering
 * a page in isolation does not require the whole tenancy stack.
 */
export function useOptionalTenant(): TenantContextValue | null {
  return useContext(TenantContext);
}

export function TenantProvider({ children }: { children: ReactNode }) {
  // Reads auth itself rather than taking a prop: this provider sits above App,
  // because App's own tenant-scoped queries have to wait on the active
  // workspace this context resolves.
  const { authStatus } = useAuthenticator((context) => [context.authStatus]);
  const isAuthenticated = authStatus === 'authenticated';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // Only the explicit choice is state. The active membership is derived from it
  // plus the resolver, so there is no effect writing state back into render —
  // and no window where the two disagree.
  const [chosenTenantId, setChosenTenantId] = useState<string | null>(null);
  const [revokedFrom, setRevokedFrom] = useState<TenantMembership | null>(null);
  const [switchingTo, setSwitchingTo] = useState<TenantMembership | null>(null);

  const {
    data: memberships,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: MEMBERSHIPS_KEY,
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
      setSwitchingTo(membership);
      setChosenTenantId(membership.tenantId);
      setRevokedFrom(null);

      // Drop every cached list, detail and count — they all belong to the
      // workspace being left, and dropping them is what makes a switch safe
      // without a reload.
      //
      // But NOT the membership list. That query is person-scoped:
      // /users/me/tenants returns the same answer whichever workspace is
      // active. `queryClient.clear()` took it out too, which left the app
      // briefly with no memberships, so the resolver returned null and the
      // interceptor published no tenant at all — and any request whose auth
      // interceptor was mid-await picked up that null and went out with no
      // X-Tenant-Id, earning a 400 TENANT_REQUIRED. Intermittent by nature,
      // since it is a race with this query refetching.
      queryClient.removeQueries({
        predicate: (query) =>
          !(query.queryKey[0] === MEMBERSHIPS_KEY[0] && query.queryKey[1] === MEMBERSHIPS_KEY[1]),
      });

      // Leave the current page. Entity ids do not carry across workspaces, so
      // staying on a detail route would ask the new workspace for a record it
      // has never heard of.
      navigate('/');
    },
    [queryClient, navigate]
  );

  // Hold the transition a minimum beat even when the remount is instant, so it
  // reads as a switch rather than a flicker.
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
    return resolveActiveTenant(list);
  }, [isAuthenticated, isLoading, error, memberships, revokedFrom, chosenTenantId, list]);

  const activeMembership = resolution?.kind === 'resolved' ? resolution.membership : null;

  // An explicit choice is known before the membership list has confirmed it, so
  // publish that rather than nothing while the two are catching up. The auth
  // interceptor attaches the tenant header after an await, so a momentarily
  // null holder is enough to send a header-less request.
  const publishedTenantId = revokedFrom ? null : (activeMembership?.tenantId ?? chosenTenantId);

  // Written during render, deliberately. This is a module variable, not React
  // state, and the write is idempotent — but it has to land before children
  // render, because a child's query fires on ITS effect and child effects run
  // before the parent's. Doing this in an effect here would let the first
  // request of a session go out with no tenant.
  setActiveTenantId(publishedTenantId);

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

  return (
    <TenantContext.Provider value={value}>
      {children}
      {/* Rendered by the provider, not the switcher, so any caller that changes
          workspace gets the transition — including recovery from a revoked
          membership. */}
      {switchingTo && <SwitchingOverlay companyName={switchingTo.companyName} />}
    </TenantContext.Provider>
  );
}
