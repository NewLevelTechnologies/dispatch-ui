// Reports → Callbacks. Every confirmed callback raised in a range, with its
// original job, the techs charged and the days between, compared and scoped,
// by tech or by the original job's type or division. Charged techs follow Tech
// productivity's rule (everyone who arrived on the original, once each), so a
// tech's count here is their callbacks there. State lives in the URL (`range`,
// `compare`, `region`, `group`; `pick` and `cbPage` for the list).
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import { titleCaseAddress } from '@dispatch/utils';
import {
  divisionsApi,
  userApi,
  workOrderReportsApi,
  workOrderTypesApi,
  type CallbackListParams,
  type CallbackRow,
  type CallbacksReport as Report,
  type CallbacksReportGroupBy,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlPage } from '../hooks/useUrlPage';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { Callout } from '../components/ui/Callout';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ListFooter } from '../components/ui/ListFooter';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { longDate } from '../features/home/revenueSelectors';
import { csvLines, downloadCsv } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { comparisonLine, useReportRange } from '../features/reports/useReportRange';
import { changePct, formatPct, formatSpan, rangeName, windowName } from '../features/reports/revenueModel';

const GROUP_BYS: CallbacksReportGroupBy[] = ['technician', 'workOrderType', 'division', 'none'];
const DEFAULT_GROUP: CallbacksReportGroupBy = 'technician';
const PICK_PARAM = 'pick';
const PAGE_PARAM = 'cbPage';
const PAGE_SIZE = 25;
const EXPORT_PAGE = 200;
const DASH = '—';
// Any new question starts the list over and drops the picked group.
const RESET = [PICK_PARAM, PAGE_PARAM];

const shortDay = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** The list filter for a picked group. */
function pickFilter(groupBy: CallbacksReportGroupBy, id: string | null): Partial<CallbackListParams> {
  if (!id) return {};
  if (groupBy === 'technician') return { technicianId: id };
  if (groupBy === 'workOrderType') return { workOrderTypeId: id };
  if (groupBy === 'division') return { divisionId: id };
  return {};
}

export default function CallbacksReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const state = useReportRange(RESET);
  const { range, compare, scope, searchParams, update, today } = state;
  const groupRaw = searchParams.get('group') as CallbacksReportGroupBy | null;
  const groupBy = groupRaw && GROUP_BYS.includes(groupRaw) ? groupRaw : DEFAULT_GROUP;
  const picked = groupBy === 'none' ? null : searchParams.get(PICK_PARAM);

  const query = useQuery({
    queryKey: ['callbacks-report', range.from, range.to, compare, groupBy, scope],
    queryFn: () => workOrderReportsApi.callbacks({ from: range.from, to: range.to, compare, groupBy, regionIds: scope }),
  });
  const report = query.data;

  // Names, departed users and retired types included.
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll() });
  const { data: divisions = [] } = useQuery({ queryKey: ['divisions'], queryFn: () => divisionsApi.getAll() });
  const { data: types = [] } = useQuery({ queryKey: ['work-order-types'], queryFn: () => workOrderTypesApi.getAll() });
  const names: Record<Exclude<CallbacksReportGroupBy, 'none'>, Map<string, string>> = {
    technician: new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim() || u.email])),
    workOrderType: new Map(types.map((x) => [x.id, x.name])),
    division: new Map(divisions.map((d) => [d.id, d.name])),
  };
  const typeName = (id: string | null) => (id ? (names.workOrderType.get(id) ?? '') : '');
  const workOrder = getName('work_order');
  const groupWord = (g: CallbacksReportGroupBy) =>
    g === 'technician'
      ? getName('technician')
      : g === 'division'
        ? t('reports.callbacks.groupBy.originalDivision', { division: getName('division').toLowerCase() })
        : g === 'workOrderType'
          ? t('reports.callbacks.groupBy.originalType', { workOrder: workOrder.toLowerCase() })
          : t('reports.callbacks.groupBy.none');
  const nameIn = (g: Exclude<CallbacksReportGroupBy, 'none'>) => (id: string | null) =>
    g === 'technician'
      ? id
        ? (names.technician.get(id) ?? t('dashboard.revenue.techs.formerUser'))
        : t('reports.callbacks.nobodyArrived', { tech: getName('technician').toLowerCase() })
      : id
        ? (names[g].get(id) ?? t('reports.revenue.unknown'))
        : t('reports.revenue.unassigned', {
            group: (g === 'division' ? getName('division') : t('reports.revenue.groupBy.workOrderType', { workOrder })).toLowerCase(),
          });

  const toDate = report ? report.to < range.to : range.to > today;
  const comparisonName = report?.comparison ? windowName(report.comparison.from, report.comparison.to) : null;
  const cmpLine = comparisonLine(t, comparisonName, compare, range.from);
  const sub = report
    ? t(toDate ? 'reports.callbacks.subToDate' : 'reports.callbacks.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
        tech: getName('technician').toLowerCase(),
      })
    : rangeName(range);
  // Before linking began, zero means nothing was linked, not that nothing came back.
  const untracked = report?.callbacksTrackedSince && report.from < report.callbacksTrackedSince ? report.callbacksTrackedSince : null;

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const rows: CallbackRow[] = [];
      for (let page = 0; ; page++) {
        const res = await workOrderReportsApi.callbackList({ from: report.from, to: report.to, regionIds: scope, page, size: EXPORT_PAGE });
        rows.push(...res.content);
        if (page + 1 >= res.totalPages) break;
      }
      const csv = csvLines([
        [
          t('reports.callbacks.csv.raised'),
          t('reports.callbacks.list.callback'),
          t('reports.revenue.groupBy.workOrderType', { workOrder }),
          getName('service_location'),
          t('reports.callbacks.list.original'),
          t('reports.callbacks.csv.originalCompleted'),
          t('reports.callbacks.list.daysBetween'),
          t('reports.callbacks.list.charged'),
          t('reports.callbacks.list.linkedBy'),
        ],
        ...rows.map((r) => [
          r.createdOn,
          r.workOrderNumber,
          typeName(r.workOrderTypeId),
          [r.serviceLocation.name, titleCaseAddress(r.serviceLocation.streetAddress), titleCaseAddress(r.serviceLocation.city)]
            .filter(Boolean)
            .join(', '),
          r.original?.workOrderNumber ?? '',
          r.original?.completedDate ?? '',
          r.daysBetween ?? '',
          r.chargedTechnicians.map((c) => c.name ?? '').filter(Boolean).join('; '),
          r.linkedByName ?? '',
        ]),
      ]);
      const file = `callbacks-${range.kind === 'period' ? range.id : `${report.from}-to-${report.to}`}.csv`;
      downloadCsv(csv, file);
      showSuccess(t('reports.callbacks.exported', { file, count: rows.length }));
    } catch {
      showError(t('reports.callbacks.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.callbacks.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else
    body = (
      <>
        {untracked && (
          <Callout kind="info">{t('reports.callbacks.untracked', { date: longDate(untracked) })}</Callout>
        )}
        <Summary report={report} cmpLine={cmpLine} />
        {groupBy !== 'none' && report.count > 0 && (
          <GroupsTable
            report={report}
            groupLabel={groupWord(groupBy)}
            nameOf={nameIn(groupBy)}
            comparisonLabel={comparisonName}
            picked={picked}
            onPick={(id) => update({ [PICK_PARAM]: id === picked ? null : id })}
          />
        )}
        <CallbackList
          report={report}
          scope={scope}
          filter={pickFilter(groupBy, picked)}
          pickedName={picked && groupBy !== 'none' ? nameIn(groupBy)(picked) : null}
          onClearPick={() => update({ [PICK_PARAM]: null })}
          typeName={typeName}
        />
      </>
    );

  return (
    <div className="rp-page">
      <ReportBackLink state={state} />
      <PageHead
        title={t('reports.callbacks.title')}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting || report.count === 0}>
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <RangeChips state={state} />
        <span className="rp-filters-divider" aria-hidden />
        <FilterChipListbox
          label={t('reports.revenue.filters.groupBy')}
          ariaLabel={t('reports.revenue.filters.groupBy')}
          value={groupBy}
          displayValue={groupWord(groupBy)}
          onChange={(v) => update({ group: v && v !== DEFAULT_GROUP ? v : null })}
        >
          {GROUP_BYS.map((g) => (
            <ChipListboxOption key={g} value={g}>
              {groupWord(g)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      </div>
      <RangeProblem state={state} />
      <div className="rp-stack">{body}</div>
    </div>
  );
}

/** Fewer callbacks, and longer between them, is the good direction. */
function Change({ current, previous, higherIsBetter = false }: { current: number | null; previous: number | null | undefined; higherIsBetter?: boolean }) {
  const pct = current == null ? null : changePct(current, previous ?? null);
  if (pct == null) return null;
  const good = higherIsBetter ? pct >= 0 : pct <= 0;
  return <span className={good ? 'rp-change up' : 'rp-change down'}>{formatPct(pct)} </span>;
}

function Summary({ report, cmpLine }: { report: Report; cmpLine: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const c = report.comparison;
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.callbacks.summary.count')}
        value={report.count.toLocaleString('en-US')}
        sub={
          <>
            <Change current={report.count} previous={c?.count} />
            {cmpLine}
          </>
        }
      />
      <SummaryCell
        label={t('reports.callbacks.summary.daysBetween')}
        value={report.averageDaysBetween != null ? `${report.averageDaysBetween.toFixed(1)} d` : DASH}
        last
        sub={
          report.averageDaysBetween != null ? (
            <>
              <Change current={report.averageDaysBetween} previous={c?.averageDaysBetween} higherIsBetter />
              {t('reports.callbacks.summary.daysBetweenSub', { workOrder: getName('work_order').toLowerCase() })}
            </>
          ) : (
            t('reports.callbacks.summary.daysBetweenNone')
          )
        }
      />
    </div>
  );
}

function GroupsTable({
  report,
  groupLabel,
  nameOf,
  comparisonLabel,
  picked,
  onPick,
}: {
  report: Report;
  groupLabel: string;
  nameOf: (id: string | null) => string;
  comparisonLabel: string | null;
  picked: string | null;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const hasCmp = report.comparison != null;
  const byTech = report.groupBy === 'technician';
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.revenue.table.title', { group: groupLabel.toLowerCase() })}</CardTitle>
        <CardSub>
          {byTech
            ? t('reports.callbacks.table.hintTech', { tech: getName('technician').toLowerCase() })
            : t('reports.callbacks.table.hint')}
        </CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{groupLabel}</th>
                <th className="right">{t('reports.callbacks.summary.count')}</th>
                <th>{t('reports.revenue.table.share')}</th>
                {hasCmp && <th className="right">{comparisonLabel}</th>}
                {hasCmp && <th className="right">{t('reports.revenue.table.change')}</th>}
              </tr>
            </DenseTHead>
            <tbody>
              {report.groups.map((g) => {
                const share = report.count > 0 ? (g.count / report.count) * 100 : 0;
                const pickable = g.id != null;
                return (
                  <DenseRow
                    key={g.id ?? 'none'}
                    className={clsx(pickable && 'rp-group', pickable && g.id === picked && 'rp-selected')}
                    onClick={pickable ? () => onPick(g.id!) : undefined}
                    aria-pressed={pickable ? g.id === picked : undefined}
                    data-testid="report-group"
                  >
                    <td>
                      <span className={g.id ? 'strong' : 'text-fg-muted'}>{nameOf(g.id)}</span>
                    </td>
                    <td className="right num strong">{g.count.toLocaleString('en-US')}</td>
                    <td>
                      <span className="rp-share">
                        <span className="rp-prog">
                          <span style={{ width: `${Math.min(100, share)}%` }} />
                        </span>
                        <span className="num">{Math.round(share)}%</span>
                      </span>
                    </td>
                    {hasCmp && <td className="right num muted-cell">{(g.comparisonCount ?? 0).toLocaleString('en-US')}</td>}
                    {hasCmp && (
                      <td className="right num">
                        <Change current={g.count} previous={g.comparisonCount} />
                      </td>
                    )}
                  </DenseRow>
                );
              })}
            </tbody>
            {/* Technician rows overlap (a callback charges each tech), so no total row there. */}
            {!byTech && (
              <tfoot>
                <tr>
                  <td className="strong">{t('reports.revenue.table.total')}</td>
                  <td className="right num strong">{report.count.toLocaleString('en-US')}</td>
                  <td />
                  {hasCmp && <td className="right num muted-cell">{(report.comparison?.count ?? 0).toLocaleString('en-US')}</td>}
                  {hasCmp && (
                    <td className="right num">
                      <Change current={report.count} previous={report.comparison?.count} />
                    </td>
                  )}
                </tr>
              </tfoot>
            )}
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}

function CallbackList({
  report,
  scope,
  filter,
  pickedName,
  onClearPick,
  typeName,
}: {
  report: Report;
  scope: string[] | undefined;
  filter: Partial<CallbackListParams>;
  pickedName: string | null;
  onClearPick: () => void;
  typeName: (id: string | null) => string;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(PAGE_PARAM);
  const query = useQuery({
    queryKey: ['callbacks-report', 'list', report.from, report.to, scope, filter, page],
    queryFn: () =>
      workOrderReportsApi.callbackList({ from: report.from, to: report.to, regionIds: scope, ...filter, page: page - 1, size: PAGE_SIZE }),
    enabled: report.count > 0,
  });
  const data = query.data;
  const total = data?.totalElements ?? 0;

  let content;
  if (report.count === 0) content = <div className="rp-note">{t('reports.callbacks.list.none')}</div>;
  else if (query.isLoading) content = <LoadingState />;
  else if (query.isError || !data)
    content = (
      <ErrorState
        title={t('reports.callbacks.list.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else
    content = (
      <>
        <DenseTable className="dense-stack">
          <DenseTHead>
            <tr>
              <th>{t('reports.callbacks.list.callback')}</th>
              <th>{t('reports.callbacks.list.original')}</th>
              <th className="right">{t('reports.callbacks.list.daysBetween')}</th>
              <th>{t('reports.callbacks.list.charged')}</th>
              <th>{t('reports.callbacks.list.linkedBy')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {data.content.map((r) => {
              const place = [r.serviceLocation.name, titleCaseAddress(r.serviceLocation.streetAddress)].filter(Boolean).join(' · ');
              return (
                <DenseRow key={r.id} data-testid="callback-row">
                  <td>
                    <div>
                      <RouterLink to={`/work-orders/${r.id}`} className="id-mono text-fg-accent hover:underline">
                        {r.workOrderNumber}
                      </RouterLink>
                      <span className="rp-sub"> · {shortDay(r.createdOn)}</span>
                    </div>
                    {(place || r.workOrderTypeId) && (
                      <div className="rp-sub">{[typeName(r.workOrderTypeId), place].filter(Boolean).join(' · ')}</div>
                    )}
                  </td>
                  <td data-label={t('reports.callbacks.list.original')}>
                    {r.original ? (
                      <>
                        <RouterLink to={`/work-orders/${r.original.id}`} className="id-mono text-fg-accent hover:underline">
                          {r.original.workOrderNumber}
                        </RouterLink>
                        {r.original.completedDate && (
                          <div className="rp-sub">
                            {t('reports.callbacks.list.completedOn', { date: shortDay(r.original.completedDate) })}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="rp-sub">{t('reports.callbacks.list.originalGone', { workOrder: getName('work_order').toLowerCase() })}</span>
                    )}
                  </td>
                  <td className="right num strong" data-label={t('reports.callbacks.list.daysBetween')}>
                    {r.daysBetween ?? DASH}
                  </td>
                  <td data-label={t('reports.callbacks.list.charged')}>
                    {r.chargedTechnicians.length > 0 ? (
                      r.chargedTechnicians.map((c) => c.name ?? t('dashboard.revenue.techs.formerUser')).join(', ')
                    ) : (
                      <span className="rp-sub">{t('reports.callbacks.nobodyArrived', { tech: getName('technician').toLowerCase() })}</span>
                    )}
                  </td>
                  <td data-label={t('reports.callbacks.list.linkedBy')}>
                    {r.linkedByName ?? DASH}
                  </td>
                </DenseRow>
              );
            })}
          </tbody>
        </DenseTable>
        <ListFooter
          page={page}
          totalPages={data.totalPages}
          pageHref={pageHref}
          left={t('common.pagination.showing', {
            start: total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
            end: Math.min(page * PAGE_SIZE, total),
            total: total.toLocaleString(),
          })}
        />
      </>
    );

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.callbacks.list.title')}</CardTitle>
        {pickedName ? (
          <button type="button" className="rp-tech-filter" onClick={onClearPick}>
            {t('reports.arrivals.late.onlyTech', { name: pickedName })}
            <XMarkIcon className="size-3" aria-label={t('reports.arrivals.late.clearTech')} />
          </button>
        ) : (
          <CardSub>{t('reports.callbacks.list.hint')}</CardSub>
        )}
      </CardHead>
      <CardBody flush>{content}</CardBody>
    </Card>
  );
}
