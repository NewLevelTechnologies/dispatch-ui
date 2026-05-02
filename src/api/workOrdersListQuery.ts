import workOrderApi from './workOrderApi';

interface QueryArgs {
  customerId?: string;
  serviceLocationId?: string;
  pageSize?: number;
}

/**
 * Shared React Query options for the embedded work-orders list. Exported so consumers
 * (e.g. detail pages that need a count badge) can reuse the same key+queryFn and share
 * the cache with the rendered list — one request, two readers.
 *
 * Pass exactly one of `customerId` / `serviceLocationId` — whichever scope the page
 * is on. Service location is the more specific filter and implies the customer, so
 * pages on a service location should NOT pass customerId (some backends would treat
 * the pair as OR or ignore the location filter).
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
        customerId: customerId || undefined,
        serviceLocationId: serviceLocationId || undefined,
        size: pageSize,
        sort: 'scheduledDate,desc' as const,
      }),
    enabled: Boolean(customerId) || Boolean(serviceLocationId),
  };
}
