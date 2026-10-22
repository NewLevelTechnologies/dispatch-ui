import { useCurrentUser } from '../hooks/useCurrentUser';
import { workOrderAccess, type WorkOrderAccess } from './workOrderAccess';

/**
 * `workOrderAccess` bound to whoever is signed in. The user query is cached
 * for ten minutes and shared with every other caller, so gating a screen on
 * this costs nothing beyond the first fetch.
 *
 * While that fetch is in flight `user` is undefined and every flag reads
 * false — controls stay hidden until the answer is known rather than
 * flickering in and then out.
 */
export function useWorkOrderAccess(assignedUserId?: string | null): WorkOrderAccess {
  const { data: user } = useCurrentUser();
  return workOrderAccess(user, assignedUserId);
}
