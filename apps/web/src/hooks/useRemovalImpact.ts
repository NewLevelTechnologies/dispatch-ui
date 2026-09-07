import { useQuery, useQueryClient } from '@tanstack/react-query';
import { userApi, type RemovalImpact } from '../api/setup';

// What a removal will do to someone's sign-in, asked before the click.
//
// The answer depends on state in OTHER tenants, which changes with no event in
// this one — so it cannot ride along on a list payload without going stale in
// the worst possible way: a confirm dialog confidently promising that a sign-in
// is or isn't about to die. Hence a point-in-time read, prefetched when a row's
// action menu opens so the dialog usually paints against a warm cache.
//
// ADVISORY. A failure means *unknown*, never "no": the copy degrades to the
// conditional wording and the removal proceeds. A courtesy lookup must never be
// what stops an admin offboarding someone, and the real guards are enforced
// server-side anyway.

const KEY = 'removal-impact';

export function removalImpactKey(userId: string) {
  return [KEY, userId] as const;
}

/**
 * Read the impact for one user. `enabled: false` until a dialog actually needs
 * it, so opening a menu doesn't fire this twice.
 *
 * `isSettled` is what the caller gates its confirm button on — true once we
 * either know the answer or know we can't get it. Distinguishing "not asked
 * yet" from "asked and failed" is the whole point: the first should wait, the
 * second must not.
 */
export function useRemovalImpact(userId: string | undefined, enabled: boolean) {
  const query = useQuery({
    queryKey: removalImpactKey(userId ?? ''),
    queryFn: () => userApi.getRemovalImpact(userId!),
    enabled: enabled && !!userId,
    // Cross-tenant state we can't observe changing, so never serve this from a
    // previous dialog's answer.
    staleTime: 0,
    gcTime: 60_000,
    // No retry. The confirm button waits on this, and a backoff ladder would
    // make an admin sit in front of a disabled button for information we are
    // happy to proceed without. A blip degrades to conditional copy instantly,
    // which is the whole point of treating it as advisory.
    retry: false,
  });

  return {
    impact: query.data,
    // Settled = we have an answer, or we have exhausted getting one.
    isSettled: query.isSuccess || query.isError,
    isUnknown: query.isError,
  };
}

/**
 * Warm the cache when a row's action menu opens. Fire-and-forget: a failed
 * prefetch is silent, and the dialog's own query will surface the error state.
 */
export function usePrefetchRemovalImpact() {
  const queryClient = useQueryClient();
  return (userId: string) => {
    void queryClient.prefetchQuery({
      queryKey: removalImpactKey(userId),
      queryFn: () => userApi.getRemovalImpact(userId),
      staleTime: 10_000,
    });
  };
}

export type { RemovalImpact };
