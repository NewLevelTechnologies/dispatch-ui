import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { dispatchesApi, userApi, type Dispatch } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Badge } from './catalyst/badge';

interface Props {
  workOrderId: string;
}

const ACTIVE_WINDOW_HOURS = 24;
const TERMINAL_STATUSES: ReadonlySet<string> = new Set(['COMPLETED', 'CANCELLED']);

const STATUS_COLORS: Record<string, 'sky' | 'amber' | 'lime' | 'zinc'> = {
  SCHEDULED: 'sky',
  IN_PROGRESS: 'amber',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
};

function formatEta(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Pinned widget at the top of the WO activity rail. Renders compact cards for
 * dispatches that are scheduled or in-progress within the next ±24h window.
 * Returns null entirely when there's nothing to show — the rail starts with
 * the activity stream in that case.
 */
export default function ActiveDispatchesWidget({ workOrderId }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const heading = t('workOrders.activity.activeDispatches', {
    entities: getName('dispatch', true),
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches', { workOrderId }],
    queryFn: () => dispatchesApi.getAll({ workOrderId }),
    enabled: !!workOrderId,
  });

  // Anchor "now" at memo eval + recompute when dispatches change. React Query
  // refetches on tab focus, which re-runs this memo, so the window stays current
  // for normal CSR sessions. Suppressing the purity lint deliberately — exact-second
  // freshness isn't meaningful for a ±24h rolling window.
  const active = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- intentional: see comment above
    const now = Date.now();
    const windowStart = now - ACTIVE_WINDOW_HOURS * 3600 * 1000;
    const windowEnd = now + ACTIVE_WINDOW_HOURS * 3600 * 1000;
    return dispatches
      .filter((d) => {
        const ts = new Date(d.scheduledDate).getTime();
        return ts >= windowStart && ts <= windowEnd && !TERMINAL_STATUSES.has(d.status);
      })
      .sort(
        (a, b) =>
          new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()
      );
  }, [dispatches]);

  if (active.length === 0) {
    return null;
  }

  return (
    <section aria-label={heading}>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {heading}
      </h3>
      <div className="flex flex-col gap-2">
        {active.map((d) => (
          <DispatchCard key={d.id} dispatch={d} />
        ))}
      </div>
    </section>
  );
}

function DispatchCard({ dispatch }: { dispatch: Dispatch }) {
  const { data: user } = useQuery({
    queryKey: ['users', dispatch.assignedUserId],
    queryFn: () => userApi.getById(dispatch.assignedUserId),
    enabled: !!dispatch.assignedUserId,
  });

  const techName = user ? `${user.firstName} ${user.lastName}`.trim() : '—';

  return (
    <div className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-950 dark:text-white">{techName}</span>
        <Badge color={STATUS_COLORS[dispatch.status] || 'zinc'}>{dispatch.status}</Badge>
      </div>
      <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {formatEta(dispatch.scheduledDate)}
      </div>
    </div>
  );
}
