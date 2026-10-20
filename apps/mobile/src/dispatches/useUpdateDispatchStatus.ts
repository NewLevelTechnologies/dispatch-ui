import { useMutation, useQueryClient } from '@tanstack/react-query';
import { dispatchesApi } from '../api/setup';
import type { DispatchStatus } from '@dispatch/api';

/**
 * A tech-initiated status change (Mark en route / Mark arrived / Complete),
 * via the same `dispatchesApi.update(id, { status })` web's drawer uses.
 * Invalidates this dispatch's own detail query plus every board-day query —
 * the dispatch board has no per-dispatch cache entry (it's a day-grid read),
 * so an un-prefixed invalidate is the only way Today/Schedule notice the
 * change without the tech manually pulling to refresh.
 */
export function useUpdateDispatchStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: DispatchStatus) => dispatchesApi.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch', id] });
      queryClient.invalidateQueries({ queryKey: ['board'] });
    },
  });
}
