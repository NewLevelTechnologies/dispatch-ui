import { useQuery } from '@tanstack/react-query';
import type { ProgressCategory } from '@dispatch/api';
import { quotesApi, workItemStatusesApi, workOrderApi } from '../api/setup';

// Seeded status code, stable across tenant renames — the *name* is the
// tenant's label, the code is the seed's. Mirrors web's
// `apps/web/src/lib/workItemStatusTargets.ts`.
const PENDING_PARTS_CODE = 'PENDING_PARTS';

const OPEN_CATEGORIES: ProgressCategory[] = ['NOT_STARTED', 'AWAITING_SCHEDULE', 'IN_PROGRESS', 'BLOCKED'];
const LIMIT = 5;

/**
 * What's hanging over the tech beyond today's route: jobs of theirs waiting
 * on parts, and quotes they sent that the customer hasn't answered.
 *
 * Work already on today's route is left to the route — seeing the same job
 * twice on one screen reads as a bug, not a reminder.
 */
export function useCarryover(userId: string | undefined, onRouteWorkOrderIds: ReadonlySet<string>) {
  const { data: statuses } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
    staleTime: 30 * 60 * 1000,
  });
  const pendingPartsId = statuses?.find((s) => s.code === PENDING_PARTS_CODE)?.id;

  const awaitingParts = useQuery({
    queryKey: ['work-orders-list', 'my-day', 'awaiting-parts', userId, pendingPartsId],
    queryFn: () =>
      workOrderApi.getAll({
        assignedUserId: userId,
        workItemStatusIds: [pendingPartsId!],
        lifecycleState: 'ACTIVE',
        progressCategory: OPEN_CATEGORIES,
        // Ask for enough that filtering today's route back out still leaves a
        // full list rather than a short one.
        size: LIMIT + onRouteWorkOrderIds.size,
      }),
    enabled: !!userId && !!pendingPartsId,
  });

  const quotes = useQuery({
    queryKey: ['quotes', 'my-day', 'sent', userId],
    queryFn: () =>
      quotesApi.getAll({ status: ['SENT'], createdByUserId: userId, size: LIMIT, sort: 'lastSentAt,desc' }),
    enabled: !!userId,
  });

  return {
    awaitingParts: (awaitingParts.data?.content ?? [])
      .filter((wo) => !onRouteWorkOrderIds.has(wo.id))
      .slice(0, LIMIT),
    // Mobile has no quote screen — a quote is only reachable here through the
    // job it belongs to, so one without a work order would be a row that goes
    // nowhere. Web, which does have a quote page, keeps them.
    quotes: (quotes.data?.content ?? []).filter((q) => !!q.workOrderId),
  };
}
