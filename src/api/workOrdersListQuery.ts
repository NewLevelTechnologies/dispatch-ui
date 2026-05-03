import workOrderApi from './workOrderApi';

interface QueryArgs {
  customerId?: string;
  serviceLocationId?: string;
  equipmentId?: string;
  pageSize?: number;
}

/**
 * Shared React Query options for the embedded work-orders list. Exported so consumers
 * (e.g. detail pages that need a count badge) can reuse the same key+queryFn and share
 * the cache with the rendered list — one request, two readers.
 *
 * Pass exactly one of `customerId` / `serviceLocationId` / `equipmentId` — whichever
 * scope the page is on. The narrower filter wins:
 *   - Service location implies its customer
 *   - Equipment implies its service location and customer
 * Sending multiple risks the backend ANDing or ORing in unexpected ways.
 */
export function workOrdersListQueryOptions({
  customerId,
  serviceLocationId,
  equipmentId,
  pageSize = 25,
}: QueryArgs) {
  return {
    queryKey: [
      'work-orders-list',
      { customerId, serviceLocationId, equipmentId, pageSize },
    ] as const,
    queryFn: () =>
      workOrderApi.getAll({
        customerId: customerId || undefined,
        serviceLocationId: serviceLocationId || undefined,
        equipmentId: equipmentId || undefined,
        size: pageSize,
        sort: 'scheduledDate,desc' as const,
      }),
    enabled: Boolean(customerId) || Boolean(serviceLocationId) || Boolean(equipmentId),
  };
}
