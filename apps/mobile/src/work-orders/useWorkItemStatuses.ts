import { useQuery } from '@tanstack/react-query';
import { workItemStatusesApi } from '../api/setup';

/**
 * The tenant's configured work-item statuses (`statusId` on a `WorkItemResponse`
 * points at one of these — it's not embedded per-item). One fetch for the whole
 * list, not one per work item; a tenant's statuses rarely change, hence the
 * long staleTime.
 */
export function useWorkItemStatuses() {
  const query = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
    staleTime: 30 * 60 * 1000,
  });

  const statuses = query.data ?? [];
  const byId = new Map(statuses.map((s) => [s.id, s]));

  return {
    statuses,
    labelFor: (statusId: string | null): string | null => (statusId ? (byId.get(statusId)?.name ?? null) : null),
    isLoading: query.isLoading,
    error: query.error,
  };
}
