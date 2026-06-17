import type { QueryClient } from '@tanstack/react-query';
import { extractApiError, isConflict, showInfo } from './toast';

// The customer endpoints now return 409 Conflict on a genuine concurrent-edit
// collision (e.g. two CSRs saving the same record) instead of a 500. Treat it
// as soft, not a hard error: refetch the record so the freshest values are on
// screen, then nudge the user to re-save. With the single-PUT save pattern
// (identity + billing address in one request) this is rare.
//
// Returns true when it consumed a 409 (the caller should `return` from its
// onError); false otherwise, so the caller falls through to its normal error
// toast.
export function handleConcurrentEdit(
  err: unknown,
  queryClient: QueryClient,
  // Prefix key to refetch. Partial matching means ['customers'] refreshes both
  // the list and any mounted ['customers', id, ...] detail query.
  queryKey: unknown[],
): boolean {
  if (!isConflict(err)) return false;
  queryClient.invalidateQueries({ queryKey });
  showInfo(
    'Refreshed — saved by someone else',
    extractApiError(err) ??
      'Another change landed first. We pulled in the latest values — review and save again.',
  );
  return true;
}
