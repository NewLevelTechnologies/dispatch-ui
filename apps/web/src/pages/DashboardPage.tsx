import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { PlusIcon } from '@heroicons/react/16/solid';
import { dispatchRegionApi } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useCurrentUser, useHasCapability } from '../hooks/useCurrentUser';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import AppLayout from '../components/AppLayout';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { zonedDate } from '../lib/boardTime';
import { NeedsAttentionCard } from '../features/home/NeedsAttentionCard';
import { TodayKpis } from '../features/home/TodayKpis';
import { TodayBoardCard } from '../features/home/TodayBoardCard';
import { ActivityCard } from '../features/home/ActivityCard';
import { useHomeBoard, useHomeBoardSummary } from '../features/home/useHomeBoard';
import { greetingPart } from '../features/home/opsSelectors';

/**
 * Home — the office's landing page. Operations (today) reads in a deliberate
 * order: what needs me → how is today going → detail. Every number is a
 * server-side read; each card loads and fails on its own.
 */
export default function DashboardPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: user } = useCurrentUser();
  const canCreateWorkOrder = useHasCapability('CREATE_WORK_ORDERS');

  // "Today" is the tenant's day, not the browser's — the same rule the board
  // follows, so the dashboard and the board agree on what today is.
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);

  // Scope narrows scheduling reads only (board, board summary, unscheduled,
  // release). Invoices, agreements and POs carry no region, so those numbers
  // are always whole-company. In the URL so a scoped view can be shared.
  const regionId = searchParams.get('region');
  const regionIds = useMemo(() => (regionId ? [regionId] : undefined), [regionId]);
  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });
  const setRegion = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('region', id);
    else next.delete('region');
    setSearchParams(next);
  };

  const board = useHomeBoard(today, regionIds);
  const summary = useHomeBoardSummary(regionIds);

  const part = greetingPart(new Date());
  const title = user?.firstName
    ? t(`dashboard.greeting.${part}Named`, { name: user.firstName })
    : t(`dashboard.greeting.${part}`);
  const dateLabel = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <AppLayout>
      <PageHead
        title={title}
        sub={t('dashboard.sub', { date: dateLabel })}
        actions={
          <>
            {regions.length > 1 && (
              <FilterChipListbox
                label={regionId ? t('dashboard.scope.label') : t('dashboard.scope.labelAll')}
                ariaLabel={t('dashboard.scope.label')}
                value={regionId}
                displayValue={regions.find((r) => r.id === regionId)?.name ?? null}
                resetLabel={t('dashboard.scope.all')}
                onChange={setRegion}
                onClear={() => setRegion(null)}
              >
                {regions.map((r) => (
                  <ChipListboxOption key={r.id} value={r.id}>
                    {r.name}
                  </ChipListboxOption>
                ))}
              </FilterChipListbox>
            )}
            {canCreateWorkOrder && (
              <Button color="accent" size="xs" href="/work-orders/new">
                <PlusIcon data-slot="icon" />
                {t('dashboard.newWorkOrder', { entity: getName('work_order') })}
              </Button>
            )}
          </>
        }
      />

      <div className="home-view">
        <NeedsAttentionCard
          board={board.data}
          boardLoading={board.isLoading}
          boardError={board.isError}
          today={today}
          regionIds={regionIds}
        />
        <TodayKpis board={board.data} boardError={board.isError} summary={summary.data} />
        <div className="home-2col">
          <TodayBoardCard
            board={board.data}
            isLoading={board.isLoading}
            error={board.isError}
            onRetry={() => void queryClient.invalidateQueries({ queryKey: ['dispatch-board', 'home'] })}
          />
          <ActivityCard />
        </div>
      </div>
    </AppLayout>
  );
}
