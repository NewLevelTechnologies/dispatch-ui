import { useQuery } from '@tanstack/react-query';
import { dispatchesApi } from '../api/setup';

/**
 * A single dispatch's full record — status, lifecycle, label, notes — via
 * `dispatchesApi.getById(id)`. Unlike the list endpoint (`getAll`, which
 * Today/Schedule moved off of — see useMyBoardDispatches.ts), a single-record
 * `getById` read IS trusted for board-managed dispatches: confirmed against
 * web's own DispatchDetailDrawer, which uses exactly this call and notes "the
 * board row lacks lifecycle/label — fetch the by-id read for those."
 *
 * This type has no customer/address fields at all (see workOrderApi's
 * WorkOrder for those) — screens combine this with `useWorkOrderContact`.
 */
export function useDispatchDetail(id: string) {
  const query = useQuery({
    queryKey: ['dispatch', id],
    queryFn: () => dispatchesApi.getById(id),
  });

  return {
    dispatch: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
