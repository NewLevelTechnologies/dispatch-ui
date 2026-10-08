// Agreements: the company's service agreements, and the visits on them that
// still need a dispatch. Both read in the scope chip's regions under the same
// rules as Home's Agreements card and visits row, so a count on Home is the
// matching tab's total. The tab (`view=visits`) and scope (`region`) live in
// the URL, so Home links straight to either.
import { Fragment, useState } from 'react';
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
import { Button } from '../components/catalyst/button';
import AgreementFormDialog from '../components/AgreementFormDialog';
import { extractApiError, showError } from '../lib/toast';
import { money } from '../features/home/revenueSelectors';
import { downloadCsv } from '../features/reports/csv';
import { AgreementsList } from '../features/agreements/AgreementsList';
import { agreementsCsv, fetchAllAgreements } from '../features/agreements/agreementsCsv';
import { listParams, parseFilters } from '../features/agreements/agreementListModel';
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
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  // Home's own figures, each segment's number set as a figure.
  const sub = o ? (
    <>
      {[
        t('agreements.page.active', { count: o.activeAgreementCount }),
        showMoney ? t('agreements.page.recurring', { amount: money(o.recurringMonthly) }) : null,
        o.renewingSoon.count > 0
          ? t('agreements.page.renewing', { count: o.renewingSoon.count, days: o.renewingSoon.withinDays })
          : null,
      ]
        .filter((x): x is string => Boolean(x))
        .map((seg, i) => (
          <Fragment key={i}>
            {i > 0 && ' · '}
            <LeadFigure text={seg} />
          </Fragment>
        ))}
    </>
  ) : null;

  const statusName = (s: string) => t(`agreements.list.status.${s}`);
  const exportCsv = async () => {
    setExporting(true);
    try {
      const params = listParams(parseFilters(searchParams), {
        scope,
        sort: searchParams.get('sort'),
        page: 1,
        size: 200,
      });
      const rows = await fetchAllAgreements(params);
      const h = (k: string) => t(`agreements.list.csv.${k}`);
      const text = agreementsCsv(
        rows,
        {
          number: h('number'),
          name: h('name'),
          plan: t('agreements.list.filters.plan'),
          customer: getName('customer'),
          status: t('agreements.list.table.status'),
          locations: getName('service_location', true),
          monthly: h('monthly'),
          billingAmount: h('billingAmount'),
          billingCadence: h('billingCadence'),
          visitsCompleted: h('visitsCompleted'),
          visitsPlanned: h('visitsPlanned'),
          visitsBehind: t('agreements.list.filters.visitsBehind'),
          nextVisit: t('agreements.list.table.nextVisit'),
          nextWorkOrder: t('agreements.list.csv.nextWorkOrder', { workOrder: getName('work_order') }),
          termEnd: h('termEnd'),
          autoRenew: t('agreements.list.table.autoRenews'),
          endedOn: h('endedOn'),
        },
        { showMoney, statusName, yes: h('yes'), no: h('no') },
      );
      downloadCsv(text, `${getName('agreement', true).toLowerCase().replace(/\s+/g, '-')}-${today}.csv`);
    } catch (err) {
      showError(t('agreements.list.csv.failed'), extractApiError(err) ?? undefined);
    } finally {
      setExporting(false);
    }
  };

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
      <PageHead
        title={getName('agreement', true)}
        sub={sub}
        actions={
          <>
            {view === 'list' && (
              <Button outline size="xs" onClick={() => void exportCsv()} disabled={exporting}>
                {exporting ? t('agreements.list.csv.exporting') : t('agreements.list.csv.export')}
              </Button>
            )}
            <Button color="accent" size="xs" onClick={() => setAdding(true)}>
              {t('common.actions.add', { entity: getName('agreement') })}
            </Button>
          </>
        }
      />
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
        <AgreementsList scope={scope} today={today} zone={zone} showMoney={showMoney} scopeChip={scopeChip} />
      )}
      <AgreementFormDialog isOpen={adding} onClose={() => setAdding(false)} />
    </AppLayout>
  );
}

/** The segment's first figure ("128", "$31,240") set as Home sets it. */
function LeadFigure({ text }: { text: string }) {
  const m = /[$€£]?\d[\d,.]*/.exec(text);
  if (!m) return <>{text}</>;
  return (
    <>
      {text.slice(0, m.index)}
      <span className="ag-figure">{m[0]}</span>
      {text.slice(m.index + m[0].length)}
    </>
  );
}
