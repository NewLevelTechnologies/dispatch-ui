import { useQuery } from '@tanstack/react-query';
import { userApi } from '../api/setup';
import { useAuth } from '../auth/AuthContext';

/**
 * The backend `User` record for whoever is signed in — specifically its `id`,
 * which is what `Dispatch.assignedUserId` matches against. Cognito's
 * `username`/`email` (from AuthContext) identify the *login*; this is the
 * tenant-scoped person record, so it waits on a tenant the same way any other
 * tenant-scoped read does.
 *
 * Cached generously: a person's own identity changes rarely enough that
 * refetching it on every screen would just be wasted traffic.
 */
export function useCurrentUser() {
  const { status } = useAuth();

  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => userApi.getCurrentUser(),
    enabled: status === 'signedIn',
    staleTime: 10 * 60 * 1000,
  });
}
