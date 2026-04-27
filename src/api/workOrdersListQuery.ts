import workOrderApi from './workOrderApi';

interface QueryArgs {
  customerId: string;
  serviceLocationId?: string;
  pageSize?: number;
}

/**
 * Shared React Query options for the embedded work-orders list. Exported so consumers
 * (e.g. detail pages that need a count badge) can reuse the same key+queryFn and share
 * the cache with the rendered list — one request, two readers.
 */
export function workOrdersListQueryOptions({
  customerId,
  serviceLocationId,
  pageSize = 25,
}: QueryArgs) {
  return {
    queryKey: ['work-orders-list', { customerId, serviceLocationId, pageSize }] as const,
    queryFn: () =>
      workOrderApi.getAll({
        customerId,
        serviceLocationId,
        size: pageSize,
        sort: 'scheduledDate,desc' as const,
      }),
    enabled: !!customerId,
  };
}
