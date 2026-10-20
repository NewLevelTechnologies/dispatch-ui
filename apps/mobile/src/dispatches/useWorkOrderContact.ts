import { useQuery } from '@tanstack/react-query';
import { workOrderApi } from '../api/setup';

/**
 * The customer/site-contact/address details a dispatch needs for its Call
 * and Directions actions — none of which exist on `Dispatch` (`getById`) or
 * `BoardDispatch` (the board read) beyond a raw city/state. The full street
 * address and site contact phone only ship on `WorkOrder` (`workOrderApi.
 * getById`), per web's own WorkOrderOverview.tsx: `location?.siteContactPhone
 * || customer?.phone`.
 */
export function useWorkOrderContact(workOrderId: string) {
  const query = useQuery({
    queryKey: ['work-order-contact', workOrderId],
    queryFn: () => workOrderApi.getById(workOrderId),
  });

  const workOrder = query.data;
  const location = workOrder?.serviceLocation;
  const customer = workOrder?.customer;

  return {
    workOrderNumber: workOrder?.workOrderNumber ?? null,
    summary: workOrder?.summary ?? null,
    locationName: location?.locationName ?? null,
    address: location?.address ?? null,
    contactName: location?.siteContactName ?? customer?.name ?? null,
    contactPhone: location?.siteContactPhone || customer?.phone || null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
