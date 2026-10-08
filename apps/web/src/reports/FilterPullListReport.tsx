// Reports → Filter Pull List. The filters each tech pulls for their route,
// built from the board's dispatches for the day: one card per tech (what to
// pull, then their stops in board order) and the company total last. Printed
// and taped to the truck, so Print leads and each tech gets their own page.
// State lives in the URL (`days`, `region`, `type`, `division`).
import { useMemo, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatFilterSize, titleCaseAddress } from '@dispatch/utils';
import { ArrowDownTrayIcon, ArrowLeftIcon, PrinterIcon } from '@heroicons/react/16/solid';
import {
  dispatchRegionApi,
  divisionsApi,
  reportsApi,
  workOrderTypesApi,
  type FilterPullList,
  type FilterPullListStop,
  type FilterPullListTech,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import { formatHour, formatWindow, zonedDate, zonedHour } from '../lib/boardTime';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { Link } from '../components/catalyst/link';
import { PageHead } from '../components/ui/PageHead';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { downloadCsv } from '../features/reports/csv';
import {
  customDaysId,
  customDaysProblem,
  filterCount,
  formatDays,
  pullListCsv,
  resolveDays,
  sizeKey,
  stopCount,
  stopDay,
  type DayPreset,
} from '../features/reports/pullListModel';

const DASH = '—';
const CUSTOM = 'custom';
const PRESETS: DayPreset[] = ['today', 'tomorrow'];

const DATE_INPUT =
  'h-8 rounded-md border border-border bg-bg-elev px-2 text-[12.5px] text-fg outline-none ' +
  'hover:border-border-strong focus:border-accent-500/60 ' +
  '[color-scheme:light] [.theme-dark_&]:[color-scheme:dark]';

export default function FilterPullListReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const [searchParams, setSearchParams] = useSearchParams();

  const days = resolveDays(searchParams.get('days'), today);
  const regionId = searchParams.get('region');
  const scope = useMemo(() => (regionId ? [regionId] : undefined), [regionId]);
  const typeId = searchParams.get('type');
  const divisionId = searchParams.get('division');
  const multiDay = days.date !== days.dateTo;

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next, { replace: true });
  };

  // Picked dates under edit: held here until they make a range the server takes.
  const [draft, setDraft] = useState<{ date: string; dateTo: string } | null>(null);
  const draftProblem = draft && draft.date && draft.dateTo ? customDaysProblem(draft.date, draft.dateTo) : null;
  const pickDays = (v: string | null) => {
    setDraft(null);
    if (v === CUSTOM) update({ days: customDaysId(days.date, days.dateTo) });
    else update({ days: v === 'today' ? 'today' : null });
  };
  const setCustom = (v: { date: string; dateTo: string }) => {
    setDraft(v);
    if (v.date && v.dateTo && !customDaysProblem(v.date, v.dateTo)) {
      setDraft(null);
      update({ days: customDaysId(v.date, v.dateTo) });
    }
  };

  const query = useQuery({
    queryKey: ['report-filter-pull-list', days.date, days.dateTo, scope, typeId, divisionId],
    queryFn: () =>
      reportsApi.filterPullList({
        date: days.date,
        dateTo: multiDay ? days.dateTo : undefined,
        regionIds: scope,
        workOrderTypeId: typeId ?? undefined,
        divisionId: divisionId ?? undefined,
      }),
  });
  const list = query.data;

  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });
  const { data: types = [] } = useQuery({ queryKey: ['work-order-types'], queryFn: () => workOrderTypesApi.getAll() });
  const { data: divisions = [] } = useQuery({ queryKey: ['divisions'], queryFn: () => divisionsApi.getAll() });
  // Retired types and divisions aren't offered, but one already in the URL keeps its name.
  const activeTypes = types.filter((x) => x.isActive || x.id === typeId);
  const activeDivisions = divisions.filter((d) => d.isActive || d.id === divisionId);
  const regionName = regions.find((r) => r.id === regionId)?.name ?? null;

  const daysLabel = formatDays(days.date, days.dateTo, today);
  const daysTitle = days.kind === 'custom' ? daysLabel : `${t(`reports.pullList.days.${days.kind}`)}, ${daysLabel}`;
  const techName = (name: string | null) => name ?? t('reports.pullList.unnamed');
  const windowLabel = (startIso: string, endIso: string | null) => {
    const start = zonedHour(startIso, zone);
    const end = endIso ? zonedHour(endIso, zone) : null;
    if (start == null) return DASH;
    return end == null ? formatHour(start) : formatWindow(start, end);
  };
  const stopTime = (stop: FilterPullListStop) => windowLabel(stop.arrivalWindowStart, stop.arrivalWindowEnd);
  const stopDate = (iso: string) => zonedDate(iso, zone) ?? iso.slice(0, 10);

  const exportCsv = () => {
    if (!list) return;
    try {
      const csv = pullListCsv(list, {
        headers: [
          t('reports.pullList.csv.tech'),
          t('reports.pullList.csv.date'),
          t('reports.pullList.table.window'),
          getName('work_order'),
          getName('customer'),
          getName('service_location'),
          t('reports.pullList.csv.address'),
          t('reports.pullList.csv.city'),
          getName('equipment'),
          t('reports.pullList.table.size'),
          t('reports.pullList.table.qty'),
        ],
        tech: techName,
        day: stopDate,
        window: windowLabel,
      });
      const file = `filter-pull-list-${multiDay ? `${days.date}-to-${days.dateTo}` : days.date}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.pullList.exported', { file }));
    } catch {
      showError(t('reports.pullList.exportFailed'));
    }
  };

  const sub = list
    ? [
        daysTitle,
        regionName,
        t('reports.pullList.counts.techs', { count: list.techs.length }),
        t('reports.pullList.counts.stops', { count: stopCount(list) }),
        t('reports.pullList.counts.filters', { count: filterCount(list.totals) }),
      ]
        .filter(Boolean)
        .join(' · ')
    : daysTitle;
  // Printed at the top of every page, since each tech's page travels alone.
  const printContext = [t('reports.pullList.title'), daysTitle, regionName].filter(Boolean).join(' · ');

  const filters = (
    <div className="rp-filters">
      <FilterChipListbox
        label={t('reports.pullList.filters.days')}
        ariaLabel={t('reports.pullList.filters.days')}
        value={days.kind === 'custom' ? CUSTOM : days.kind}
        displayValue={t(`reports.pullList.days.${days.kind}`)}
        onChange={pickDays}
      >
        {PRESETS.map((p) => (
          <ChipListboxOption key={p} value={p}>
            {t(`reports.pullList.days.${p}`)}
          </ChipListboxOption>
        ))}
        <ChipListboxOption value={CUSTOM}>{t('reports.pullList.days.customOption')}</ChipListboxOption>
      </FilterChipListbox>
      {days.kind === 'custom' && (
        <span className="pl-dates">
          <input
            type="date"
            aria-label={t('reports.pullList.filters.from')}
            value={draft?.date ?? days.date}
            onChange={(e) => setCustom({ date: e.target.value, dateTo: draft?.dateTo ?? days.dateTo })}
            className={DATE_INPUT}
          />
          <span className="text-fg-muted">{t('reports.pullList.filters.through')}</span>
          <input
            type="date"
            aria-label={t('reports.pullList.filters.to')}
            value={draft?.dateTo ?? days.dateTo}
            onChange={(e) => setCustom({ date: draft?.date ?? days.date, dateTo: e.target.value })}
            className={DATE_INPUT}
          />
        </span>
      )}
      {regions.length > 1 && (
        <FilterChipListbox
          label={regionId ? t('dashboard.scope.label') : t('dashboard.scope.labelAll')}
          ariaLabel={t('dashboard.scope.label')}
          value={regionId}
          displayValue={regionName}
          resetLabel={t('dashboard.scope.all')}
          onChange={(id) => update({ region: id })}
          onClear={() => update({ region: null })}
        >
          {regions.map((r) => (
            <ChipListboxOption key={r.id} value={r.id}>
              {r.name}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      )}
      {activeTypes.length > 0 && (
        <FilterChipListbox
          label={t('reports.pullList.filters.type')}
          ariaLabel={t('reports.pullList.filters.type')}
          value={typeId}
          displayValue={activeTypes.find((x) => x.id === typeId)?.name ?? null}
          resetLabel={t('reports.pullList.filters.anyType')}
          onChange={(id) => update({ type: id })}
          onClear={() => update({ type: null })}
        >
          {activeTypes.map((x) => (
            <ChipListboxOption key={x.id} value={x.id}>
              {x.name}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      )}
      {activeDivisions.length > 0 && (
        <FilterChipListbox
          label={getName('division')}
          ariaLabel={getName('division')}
          value={divisionId}
          displayValue={activeDivisions.find((d) => d.id === divisionId)?.name ?? null}
          resetLabel={t('reports.pullList.filters.anyDivision', { division: getName('division').toLowerCase() })}
          onChange={(id) => update({ division: id })}
          onClear={() => update({ division: null })}
        >
          {activeDivisions.map((d) => (
            <ChipListboxOption key={d.id} value={d.id}>
              {d.name}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      )}
    </div>
  );

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !list)
    body = (
      <ErrorState
        title={t('reports.pullList.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (list.techs.length === 0)
    body = (
      <EmptyState
        title={t('reports.pullList.empty.title', { days: daysTitle })}
        description={t('reports.pullList.empty.body', { entities: getName('dispatch', true).toLowerCase() })}
      />
    );
  else
    body = (
      <>
        {list.techs.map((tech) => (
          <TechCard
            key={tech.userId}
            tech={tech}
            name={techName(tech.name)}
            printContext={printContext}
            stopTime={stopTime}
            stopDate={multiDay ? (iso) => stopDay(stopDate(iso)) : null}
          />
        ))}
        <TotalsCard list={list} regionName={regionName} printContext={printContext} />
      </>
    );

  return (
    <div className="rp-page pl-page">
      <div className="pl-screen-only">
        <RouterLink to="/reports" className="rp-back">
          <ArrowLeftIcon className="size-3.5" />
          {t('reports.title')}
        </RouterLink>
        <PageHead
          title={t('reports.pullList.title')}
          sub={sub}
          actions={
            <>
              <Button outline size="xs" onClick={exportCsv} disabled={!list || list.techs.length === 0}>
                <ArrowDownTrayIcon data-slot="icon" />
                {t('reports.pullList.export')}
              </Button>
              <Button
                color="accent"
                size="xs"
                onClick={() => window.print()}
                disabled={!list || list.techs.length === 0}
              >
                <PrinterIcon data-slot="icon" />
                {t('reports.pullList.print')}
              </Button>
            </>
          }
        />
        {filters}
        {draftProblem && (
          <p className="rp-filter-error" role="alert">
            {t(`reports.pullList.filters.problem.${draftProblem}`)}
          </p>
        )}
      </div>
      <div className="rp-stack">{body}</div>
    </div>
  );
}

function TechCard({
  tech,
  name,
  printContext,
  stopTime,
  stopDate,
}: {
  tech: FilterPullListTech;
  name: string;
  printContext: string;
  stopTime: (stop: FilterPullListStop) => string;
  /** The stop's day, when the list covers more than one; else null. */
  stopDate: ((iso: string) => string) | null;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  return (
    <div className="pl-sheet" data-testid="pull-tech">
      <div className="pl-print-context">{printContext}</div>
      <Card>
        <CardHead>
          <CardTitle>{name}</CardTitle>
          <CardSub>
            {t('reports.pullList.counts.stops', { count: tech.stops.length })}
            {' · '}
            {t('reports.pullList.counts.filters', { count: filterCount(tech.totals) })}
          </CardSub>
        </CardHead>
        <CardBody flush>
          <div className="pl-tech">
            <section className="pl-pull" aria-label={t('reports.pullList.pull')}>
              <h3 className="pl-section">{t('reports.pullList.pull')}</h3>
              {tech.totals.length === 0 ? (
                <p className="pl-none">{t('reports.pullList.noFiltersTech')}</p>
              ) : (
                <SizeTable sizes={tech.totals} />
              )}
            </section>
            <section className="pl-stops" aria-label={t('reports.pullList.stops')}>
              <h3 className="pl-section">{t('reports.pullList.stops')}</h3>
              <DenseTable className="pl-table">
                <DenseTHead>
                  <tr>
                    <th className="right">#</th>
                    <th>{t('reports.pullList.table.window')}</th>
                    <th>{getName('work_order')}</th>
                    <th>{getName('service_location')}</th>
                    <th>{t('reports.pullList.table.filters')}</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {tech.stops.map((stop, i) => (
                    <tr key={stop.dispatchId} data-testid="pull-stop">
                      <td className="right num muted-cell">{i + 1}</td>
                      <td className="num nowrap">
                        {stopDate && <span className="text-fg-muted">{stopDate(stop.arrivalWindowStart)} </span>}
                        {stopTime(stop)}
                      </td>
                      <td>
                        {stop.workOrderNumber ? (
                          <Link href={`/work-orders/${stop.workOrderId}`} className="mono text-fg-accent hover:underline">
                            {stop.workOrderNumber}
                          </Link>
                        ) : (
                          <span className="text-fg-muted">{DASH}</span>
                        )}
                      </td>
                      <td>
                        <StopPlace stop={stop} />
                      </td>
                      <td>
                        <StopFilters stop={stop} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DenseTable>
            </section>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function StopPlace({ stop }: { stop: FilterPullListStop }) {
  const lead = stop.customerName ?? stop.locationName;
  const second = stop.customerName && stop.locationName && stop.locationName !== stop.customerName ? stop.locationName : null;
  const address = [stop.streetAddress, stop.city].filter(Boolean).map((x) => titleCaseAddress(x)).join(', ');
  if (!lead && !address) return <span className="text-fg-muted">{DASH}</span>;
  return (
    <span className="pl-place">
      {lead && <span className="strong">{lead}</span>}
      {second && <span>{second}</span>}
      {address && <span className="text-fg-muted">{address}</span>}
    </span>
  );
}

function StopFilters({ stop }: { stop: FilterPullListStop }) {
  const { t } = useTranslation();
  if (stop.filters.length === 0) return <span className="text-fg-muted">{t('reports.pullList.noFiltersStop')}</span>;
  return (
    <ul className="pl-stop-filters">
      {stop.filters.map((f, i) => (
        <li key={`${sizeKey(f)}-${i}`}>
          <span className="mono">{formatFilterSize(f)}</span>
          <span className="num strong">×{f.quantity}</span>
          {f.equipmentName && <span className="text-fg-muted">{f.equipmentName}</span>}
        </li>
      ))}
    </ul>
  );
}

/** What to pull: a box to tick, the size, how many. */
function SizeTable({
  sizes,
  units,
}: {
  sizes: { lengthIn: number; widthIn: number; thicknessIn: number; quantity: number; equipmentCount?: number }[];
  /** Show the equipment-count column (company totals). */
  units?: boolean;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  return (
    <DenseTable className="pl-table pl-sizes">
      <DenseTHead>
        <tr>
          <th className="pl-check-col" aria-label={t('reports.pullList.table.pulled')} />
          <th>{t('reports.pullList.table.size')}</th>
          <th className="right">{t('reports.pullList.table.qty')}</th>
          {units && <th className="right">{getName('equipment')}</th>}
        </tr>
      </DenseTHead>
      <tbody>
        {sizes.map((s) => (
          <tr key={sizeKey(s)} data-testid="pull-size">
            <td className="pl-check-col">
              <span className="pl-check" aria-hidden />
            </td>
            <td className="mono">{formatFilterSize(s)}</td>
            <td className="right num pl-qty">{s.quantity}</td>
            {units && <td className="right num muted-cell">{s.equipmentCount}</td>}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="pl-check-col" />
          <td className="strong">{t('reports.pullList.table.total')}</td>
          <td className="right num pl-qty">{filterCount(sizes)}</td>
          {units && <td />}
        </tr>
      </tfoot>
    </DenseTable>
  );
}

function TotalsCard({
  list,
  regionName,
  printContext,
}: {
  list: FilterPullList;
  regionName: string | null;
  printContext: string;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  return (
    <div className="pl-sheet" data-testid="pull-totals">
      <div className="pl-print-context">{printContext}</div>
      <Card>
        <CardHead>
          <CardTitle>
            {regionName ? t('reports.pullList.regionTotal', { region: regionName }) : t('reports.pullList.companyTotal')}
          </CardTitle>
          <CardSub>{t('reports.pullList.totalHint', { entity: getName('work_order').toLowerCase() })}</CardSub>
        </CardHead>
        <CardBody flush>
          {list.totals.length === 0 ? (
            <p className="pl-none">
              {t('reports.pullList.noFiltersAll', { entities: getName('work_order', true).toLowerCase() })}
            </p>
          ) : (
            <div className="pl-totals">
              <SizeTable sizes={list.totals} units />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
