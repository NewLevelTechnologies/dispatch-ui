import { useQuery } from '@tanstack/react-query';
import { dispatchesApi, filesApi, locationFilesApi } from '../../api/setup';

// Tab-count badges for a site's Dispatches and Files tabs. Shared by Location
// detail and the single-location Customer detail, which inlines those tabs.

/**
 * Dispatch count: `totalElements` off a lean size-1 page of the full history
 * listing (every dispatch, incl. cancelled/no-show). Keyed under the
 * ['location-dispatches'] prefix with the tab's own queries so one
 * invalidation sweeps all.
 */
export function useLocationDispatchCount(serviceLocationId: string | undefined): number | undefined {
  const { data } = useQuery({
    queryKey: ['location-dispatches', serviceLocationId, 'count'] as const,
    queryFn: () => dispatchesApi.listForServiceLocation(serviceLocationId!, { size: 1 }),
    enabled: Boolean(serviceLocationId),
  });
  return data?.totalElements;
}

/**
 * Files count: the sum of the two file sources' anchor-wide counts (job and
 * equipment aggregate + direct site uploads) off lean limit-1 pages. Keyed
 * under the ['location-files', id] prefix so the tab's upload, delete and
 * profile invalidations refresh it too. The aggregate read (work-order-service
 * /files) can be down independently of direct uploads; its failure just drops
 * that side of the sum.
 */
export function useLocationFilesCount(serviceLocationId: string | undefined): number | undefined {
  const { data: direct } = useQuery({
    queryKey: ['location-files', serviceLocationId, 'direct-count'] as const,
    queryFn: () => locationFilesApi.list(serviceLocationId!, { limit: 1 }),
    enabled: Boolean(serviceLocationId),
  });
  const { data: agg } = useQuery({
    queryKey: ['location-files', serviceLocationId, 'agg-count'] as const,
    queryFn: () => filesApi.listForServiceLocation(serviceLocationId!, { limit: 1 }),
    enabled: Boolean(serviceLocationId),
    retry: 1,
  });
  return direct || agg ? (direct?.counts.all ?? 0) + (agg?.counts.all ?? 0) : undefined;
}
