import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  agreementApi,
  approvalsApi,
  dispatchBoardApi,
  financialDashboardApi,
  purchaseOrderApi,
  workOrderApi,
  type DispatchBoard,
} from '../../api/setup';
import { useHasCapability } from '../../hooks/useCurrentUser';

export interface AttentionCounts {
  canDispatch: boolean;
  canApprove: boolean;
  canInvoices: boolean;
  /** What a release would send (new + changed + removed), from the day board. */
  pending: DispatchBoard['pendingRelease'] | undefined;
  approvals: number;
  unscheduled: number;
  overdue: { count: number; amount: number };
  unbilled: number;
  visits: { count: number; withinDays: number };
  poLate: number;
  /** Sum of every count the user can see — the Operations tab's badge. */
  total: number;
  anyLoading: boolean;
  anyError: boolean;
  retry: () => void;
}

/**
 * Every "Needs attention" count, each from the service that owns it. A count
 * the user lacks the capability for is never fetched and never counted, so
 * the tab badge and the card always agree.
 */
export function useAttention(
  board: { data: DispatchBoard | undefined; isLoading: boolean; isError: boolean },
  regionIds: string[] | undefined,
): AttentionCounts {
  const queryClient = useQueryClient();
  const canDispatch = useHasCapability('EDIT_DISPATCHES');
  const canApprove = useHasCapability('APPROVE_WORK_ITEM_TRANSITIONS');
  const canInvoices = useHasCapability('VIEW_ALL_INVOICES');

  // Same key and fetcher as the sidebar bell, so this is a cache hit.
  const approvals = useQuery({
    queryKey: ['approvals', 'bell-summary'],
    queryFn: () => approvalsApi.getBellSummary(),
    enabled: canApprove,
  });
  const unscheduled = useQuery({
    queryKey: ['dispatch-board', 'home-unscheduled', regionIds],
    queryFn: () => dispatchBoardApi.getUnscheduled({ regionIds, size: 1 }).then((p) => p.totalElements),
    enabled: canDispatch,
  });
  const financial = useQuery({
    queryKey: ['financial-dashboard', 'attention'],
    queryFn: () => financialDashboardApi.getAttention(),
    enabled: canInvoices,
  });
  // Same query as the list the row opens (`?status=COMPLETED&unbilled=true`),
  // so the count and the list always agree.
  const unbilled = useQuery({
    queryKey: ['work-orders', 'unbilled-count'],
    queryFn: () => workOrderApi.getAll({ unbilled: true, size: 1 }).then((p) => p.totalElements),
    enabled: canInvoices,
  });
  const agreements = useQuery({
    queryKey: ['agreements', 'overview'],
    queryFn: () => agreementApi.getOverview(),
  });
  const poLate = useQuery({
    queryKey: ['purchase-orders', 'overdue-count'],
    queryFn: () => purchaseOrderApi.summary({ overdue: true }).then((s) => s.openCount),
  });

  const pending = board.data?.pendingRelease;
  const counts = {
    unreleased: canDispatch ? (pending?.total ?? 0) : 0,
    approvals: canApprove ? (approvals.data?.pendingForMe ?? 0) : 0,
    unscheduled: canDispatch ? (unscheduled.data ?? 0) : 0,
    overdue: canInvoices ? (financial.data?.overdue ?? { count: 0, amount: 0 }) : { count: 0, amount: 0 },
    unbilled: canInvoices ? (unbilled.data ?? 0) : 0,
    visits: agreements.data?.visitsDueSoonUnscheduled ?? { count: 0, withinDays: 7 },
    poLate: poLate.data ?? 0,
  };

  const sources = [
    { enabled: canDispatch, loading: board.isLoading, error: board.isError },
    { enabled: canApprove, loading: approvals.isLoading, error: approvals.isError },
    { enabled: canDispatch, loading: unscheduled.isLoading, error: unscheduled.isError },
    { enabled: canInvoices, loading: financial.isLoading, error: financial.isError },
    { enabled: canInvoices, loading: unbilled.isLoading, error: unbilled.isError },
    { enabled: true, loading: agreements.isLoading, error: agreements.isError },
    { enabled: true, loading: poLate.isLoading, error: poLate.isError },
  ].filter((s) => s.enabled);

  return {
    canDispatch,
    canApprove,
    canInvoices,
    pending,
    approvals: counts.approvals,
    unscheduled: counts.unscheduled,
    overdue: counts.overdue,
    unbilled: counts.unbilled,
    visits: counts.visits,
    poLate: counts.poLate,
    total:
      counts.unreleased +
      counts.approvals +
      counts.unscheduled +
      counts.overdue.count +
      counts.unbilled +
      counts.visits.count +
      counts.poLate,
    anyLoading: sources.some((s) => s.loading),
    anyError: sources.some((s) => s.error),
    retry: () => {
      void approvals.refetch();
      void unscheduled.refetch();
      void financial.refetch();
      void unbilled.refetch();
      void agreements.refetch();
      void poLate.refetch();
      void queryClient.invalidateQueries({ queryKey: ['dispatch-board', 'home'] });
    },
  };
}
