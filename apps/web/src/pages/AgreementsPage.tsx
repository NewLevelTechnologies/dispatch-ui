// Agreements: the company's service agreements, and the visits on them that
// still need a dispatch. Both read in the scope chip's regions under the same
// rules as Home's Agreements card and visits row, so a count on Home is the
// matching tab's total. The tab (`view=visits`) and scope (`region`) live in
// the URL, so Home links straight to either.
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from '@dispatch/i18n';
import { agreementApi, dispatchRegionApi } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import { useUrlTab } from '../hooks/useUrlTab';
import { zonedDate } from '../lib/boardTime';
import AppLayout from '../components/AppLayout';
import { PageHead } from '../components/ui/PageHead';
import { ViewTabs } from '../components/ui/Tabs';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { money } from '../features/home/revenueSelectors';
import { AgreementsList } from '../features/agreements/AgreementsList';
import { VisitQueue, VISITS_PAGE_PARAM } from '../features/agreements/VisitQueue';

const VIEWS = ['list', 'visits'] as const;
type View = (typeof VIEWS)[number];

export default function AgreementsPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const [view, setView] = useUrlTab<View>(VIEWS, 'list', 'view');
  const [searchParams, setSearchParams] = useSearchParams();
  // Recurring value is invoice money: shown with the invoice capability, as on Home.
  const showMoney = useHasCapability('VIEW_ALL_INVOICES');

  const regionId = searchParams.get('region');
  const scope = regionId ? [regionId] : undefined;
  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });
  const setRegion = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('region', id);
    else next.delete('region');
    next.delete('page');
    next.delete(VISITS_PAGE_PARAM);
    setSearchParams(next, { replace: true });
  };

  // The counts on the tabs and the sub line: Home's own read, same scope.
  const overview = useQuery({
    queryKey: ['agreements', 'overview', scope],
    queryFn: () => agreementApi.getOverview({ regionIds: scope }),
  });
  const o = overview.data;
  const visitsDue = o?.visitsDueSoonUnscheduled.count;

  const sub = o
    ? [
        t('agreements.page.active', { count: o.activeAgreementCount }),
        showMoney ? t('agreements.page.recurring', { amount: money(o.recurringMonthly) }) : null,
        o.renewingSoon.count > 0
          ? t('agreements.page.renewing', { count: o.renewingSoon.count, days: o.renewingSoon.withinDays })
          : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;

  const scopeChip =
    regions.length > 1 ? (
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
    ) : null;

  return (
    <AppLayout>
      <PageHead title={getName('agreement', true)} sub={sub} />
      <ViewTabs
        className="mb-3"
        value={view}
        onChange={(id) => setView(id as View)}
        tabs={[
          { id: 'list', label: getName('agreement', true), count: o?.activeAgreementCount },
          {
            id: 'visits',
            label: t('agreements.page.visitsTab'),
            count: visitsDue,
            tone: visitsDue ? 'warning' : undefined,
          },
        ]}
      />
      {view === 'visits' ? (
        <VisitQueue scope={scope} today={today} scopeChip={scopeChip} />
      ) : (
        <AgreementsList scope={scope} overview={o} showMoney={showMoney} scopeChip={scopeChip} />
      )}
    </AppLayout>
  );
}
