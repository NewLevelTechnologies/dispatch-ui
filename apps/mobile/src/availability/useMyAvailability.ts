import { useQuery } from '@tanstack/react-query';
import { availabilityApi } from '../api/setup';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { todayRange } from '../schedule/dateRanges';

/**
 * The signed-in technician's own upcoming time off — everything from today's
 * local midnight onward, open-ended (no `to`): a span with no end in sight
 * (e.g. an extended leave) is a real case `availabilityApi.list` supports,
 * and truncating the window would silently hide it.
 */
export function useMyAvailability() {
  const { data: user, error: userError } = useCurrentUser();
  const { from } = todayRange();

  const query = useQuery({
    queryKey: ['availability', 'mine', user?.id, from],
    queryFn: () => availabilityApi.list({ userId: user!.id, from, size: 100 }),
    enabled: !!user?.id,
  });

  return {
    availability: query.data?.content ?? [],
    isLoading: !user && !userError ? true : query.isLoading,
    error: userError ?? query.error,
    refetch: query.refetch,
  };
}
