import { useQuery } from '@tanstack/react-query';
import { customerApi } from '../api/setup';

/**
 * Access instructions + structured arrival facts (gate code, lockbox,
 * parking, …) + site contact — none of which are on `WorkOrder`'s own
 * (slimmer) `serviceLocation` summary. `enabled` on having an id: a work
 * order without a resolved service location yet shouldn't fire this.
 */
export function useServiceLocationDetail(serviceLocationId: string | undefined) {
  const query = useQuery({
    queryKey: ['service-location', serviceLocationId],
    queryFn: () => customerApi.getServiceLocationById(serviceLocationId!),
    enabled: !!serviceLocationId,
  });

  return {
    serviceLocation: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
