import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { activityApi } from '../api';
import { Button } from './catalyst/button';

interface Props {
  workOrderId: string;
  drawerOpen: boolean;
  onOpen: () => void;
}

const STORAGE_KEY_PREFIX = 'wo-activity-last-seen:';

function readLastSeen(workOrderId: string): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY_PREFIX + workOrderId);
  } catch {
    return null;
  }
}

function writeLastSeen(workOrderId: string, iso: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY_PREFIX + workOrderId, iso);
  } catch {
    // localStorage unavailable (privacy mode); silently fall back to no-dot.
  }
}

/**
 * Single page-level entry point to the activity drawer (§5d). Renders an
 * "Activity" button with a small unread dot when the latest event on this
 * WO is newer than the last time the user opened the drawer. No count —
 * total counts grow forever and stop meaning anything; a dot is "is there
 * something new since I last looked," which is the actual question.
 */
export default function ActivityButton({ workOrderId, drawerOpen, onOpen }: Props) {
  const { t } = useTranslation();
  const [lastSeen, setLastSeen] = useState<string | null>(() => readLastSeen(workOrderId));

  // Tiny query — just the freshest event's timestamp. Independent cache key
  // from the drawer's infinite query so the badge stays live even when the
  // drawer hasn't been opened in this session. Refetches on tab focus per
  // React Query defaults, which keeps the dot honest for long-lived sessions.
  const { data } = useQuery({
    queryKey: ['work-order-activity-latest', workOrderId],
    queryFn: () => activityApi.list(workOrderId, { limit: 1 }),
    enabled: !!workOrderId,
  });

  const latestTimestamp = data?.content[0]?.timestamp ?? null;

  // Event-driven mark-seen: writing in the click handler avoids the cascading-
  // render trap that "set state in an effect" would create. Using `now` when
  // no events exist is fine because future events strictly satisfy
  // `event.timestamp > now`.
  const handleOpen = () => {
    const next = latestTimestamp ?? new Date().toISOString();
    if (next !== lastSeen) {
      writeLastSeen(workOrderId, next);
      setLastSeen(next);
    }
    onOpen();
  };

  // While the drawer is open the user is looking at the content; suppress the
  // dot so it doesn't flash for events that just arrived.
  const hasUnread =
    !drawerOpen &&
    !!latestTimestamp &&
    (!lastSeen || latestTimestamp > lastSeen);

  return (
    <Button
      outline
      size="xs"
      onClick={handleOpen}
      aria-label={t('workOrders.activity.heading')}
    >
      <span className="relative inline-flex items-center">
        {t('workOrders.activity.heading')}
        {hasUnread && (
          <span
            aria-hidden="true"
            className="absolute -right-2 -top-1 size-2 rounded-full bg-blue-500 ring-2 ring-white dark:ring-zinc-900"
          />
        )}
      </span>
    </Button>
  );
}
