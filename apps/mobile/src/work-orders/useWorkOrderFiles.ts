import { useQuery } from '@tanstack/react-query';
import { workOrderFilesApi } from '../api/setup';
import type { WorkOrderFile } from '@dispatch/api';

/**
 * Every photo on the work order, one fetch — not one call per work item
 * (`list` takes a `workItemId` filter, but calling it per item would be an
 * N+1 fetch for a work order with several items). Callers group by
 * `workItemId` themselves — see groupFilesByWorkItem.ts.
 *
 * Photo-only for this pass: viewing existing photos needs nothing beyond
 * this; capturing a new one needs a presigned-upload flow and a camera/
 * image-picker dependency neither of which exist yet — deliberately a
 * follow-up, not bundled in here.
 */
export function useWorkOrderPhotos(workOrderId: string) {
  const query = useQuery({
    queryKey: ['work-order-files', workOrderId, 'PHOTO'],
    // 100 is the API's documented max — a work order with more photos than
    // that needs real pagination, which this first pass doesn't attempt.
    queryFn: () => workOrderFilesApi.list(workOrderId, { kind: 'PHOTO', limit: 100 }),
  });

  const photos: WorkOrderFile[] = query.data?.content ?? [];

  return {
    photos,
    isLoading: query.isLoading,
    error: query.error,
  };
}
