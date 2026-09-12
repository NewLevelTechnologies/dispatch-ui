// The tenant's IANA zone, for anything that converts between a wall-clock
// time someone typed and an instant on the wire.
//
// Scheduling is a tenant-local business: an arrival window of "8–10a" means
// 8am where the truck is going, never 8am where the browser happens to be
// sitting. The board gets this zone on its own read; every other surface that
// writes a window — the composer on a work order or a location — needs it
// from here.
//
// Falls back to the browser's zone only before the first response lands,
// which is the same thing the board does.
import { useQuery } from '@tanstack/react-query';
import { tenantSettingsApi } from '../api/setup';

export function useTenantTimeZone(): string {
  // Same key every other consumer uses, so this is nearly always a cache hit
  // rather than another request.
  const { data } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });

  return data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
