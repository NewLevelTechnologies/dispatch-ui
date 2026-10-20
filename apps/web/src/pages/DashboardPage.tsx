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
import { ChipListboxOption, ChipListboxSection, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { zonedDate } from '../lib/boardTime';
import { NeedsAttentionCard } from '../features/home/NeedsAttentionCard';
import { TodayKpis } from '../features/home/TodayKpis';
import { TodayBoardCard } from '../features/home/TodayBoardCard';
import { ActivityCard } from '../features/home/ActivityCard';
import { useHomeBoard, useHomeBoardSummary } from '../features/home/useHomeBoard';
import { useAttention } from '../features/home/useAttention';
import { RevenueView } from '../features/home/RevenueView';
import { useUrlTab } from '../hooks/useUrlTab';
import { ViewTabs } from '../components/ui/Tabs';
import { greetingPart } from '../features/home/opsSelectors';
import {
  currentMonthId,
  isCurrentPeriod,
  parsePeriod,
  periodGroups,
  periodName,
  resolvePeriod,
} from '../features/home/period';

const VIEWS = ['ops', 'rev'] as const;
type View = (typeof VIEWS)[number];

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

  // Scope narrows every read that has a region: scheduling (board, summary,
  // unscheduled, release), invoices and quotes (through their service
  // location), agreements, tech productivity and activity. Approvals are the
  // user's own and POs carry no location, so those stay whole-company. In the
  // URL so a scoped view can be shared, and it holds across both tabs.
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
  const attention = useAttention(board, regionIds);

  // Revenue is invoice money, so the tab follows the invoice capability; the
  // backend doesn't gate these reads, so this is the only line.
  const canRevenue = useHasCapability('VIEW_ALL_INVOICES');
  const [urlView, setView] = useUrlTab(VIEWS, 'ops', 'view');
  const view = canRevenue ? urlView : 'ops';

  // The Revenue tab's period. In the URL so it survives tab switches and can
  // be shared; the current month drops the param, matching the backend's
  // default. Operations ignores it.
  const period = resolvePeriod(searchParams.get('period'), today);
  const periodIsCurrent = isCurrentPeriod(period, today);
  const setPeriod = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id && id !== currentMonthId(today)) next.set('period', id);
    else next.delete('period');
    setSearchParams(next);
  };

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
  // The sub line is the active tab's data scope, not marketing copy.
  const sub =
    view === 'rev'
      ? periodIsCurrent
        ? t('dashboard.subToDate', { period: periodName(period), toDate: t(`dashboard.period.toDate.${period.kind}`) })
        : periodName(period)
      : t('dashboard.sub', { date: dateLabel });

  return (
    <AppLayout>
      <PageHead
        title={title}
        sub={sub}
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
            {view === 'rev' && (
              <FilterChipListbox
                label={t('dashboard.period.label')}
                ariaLabel={t('dashboard.period.label')}
                value={period.id}
                displayValue={periodName(period)}
                onChange={setPeriod}
              >
                {periodGroups(today).map((group) => (
                  <ChipListboxSection key={group.id} label={t(`dashboard.period.groups.${group.id}`)}>
                    {group.options.map((option) => (
                      <ChipListboxOption key={option.id} value={option.id}>
                        {periodName(parsePeriod(option.id)!)}
                        {option.hint && (
                          <span className="text-fg-muted"> · {t(`dashboard.period.hints.${option.hint}`)}</span>
                        )}
                      </ChipListboxOption>
                    ))}
                  </ChipListboxSection>
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

      {canRevenue && (
        <ViewTabs
          className="mb-3"
          value={view}
          onChange={(id) => setView(id as View)}
          tabs={[
            {
              id: 'ops',
              label: t('dashboard.tabs.operations'),
              count: attention.total > 0 ? attention.total : undefined,
              tone: attention.total > 0 ? 'danger' : undefined,
            },
            { id: 'rev', label: t('dashboard.tabs.revenue') },
          ]}
        />
      )}

      {view === 'rev' ? (
        <RevenueView period={period} isCurrent={periodIsCurrent} regionIds={regionIds} />
      ) : (
        <div className="home-view">
          <NeedsAttentionCard attention={attention} today={today} regionIds={regionIds} />
          <TodayKpis board={board.data} boardError={board.isError} summary={summary.data} />
          <div className="home-2col">
            <TodayBoardCard
              board={board.data}
              isLoading={board.isLoading}
              error={board.isError}
              onRetry={() => void queryClient.invalidateQueries({ queryKey: ['dispatch-board', 'home'] })}
            />
            <ActivityCard regionIds={regionIds} />
          </div>
        </div>
      )}
    </AppLayout>
  );
}
