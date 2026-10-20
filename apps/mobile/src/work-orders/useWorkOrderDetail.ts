import { useQuery } from '@tanstack/react-query';
import { workOrderApi } from '../api/setup';

/**
 * The full work order — customer/location summary, priority, and every
 * work item (the detail read widens `workItems` to the full
 * `WorkItemResponse[]` shape; the list endpoint caps it at 5). No separate
 * fetch for work items: they ride along on this one.
 */
export function useWorkOrderDetail(id: string) {
  const query = useQuery({
    queryKey: ['work-orders', id],
    queryFn: () => workOrderApi.getById(id),
  });

  return {
    workOrder: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
