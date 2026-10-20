// Reports → Discounts & concessions. Every adjustment on invoices billed in
// the range (Revenue's rule), with its reason, grouped by reason, who gave it,
// bill-to or line type. Member savings come from agreements, not a person, so
// they're their own groups and can be left out of the table (the strip always
// counts every source). Every number is the server's. Each row expands to its
// four largest adjustments; "View all" lists the group's adjustments below the
// table. State lives in the URL (`range`, `region`, `member`, `group`, `key`).
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ArrowDownTrayIcon, ChevronRightIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  discountReportApi,
  type DiscountReport,
  type DiscountReportGroup,
  type DiscountReportGroupBy,
  type DiscountReportMember,
  type DiscountReportRow,
  type LineType,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlPage } from '../hooks/useUrlPage';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { Link } from '../components/catalyst/link';
import { PageHead } from '../components/ui/PageHead';
import { Pill } from '../components/ui/Pill';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { ListFooter } from '../components/ui/ListFooter';
import { LINE_TYPE_LABEL, REASON_LABEL } from '../components/document/documentModel';
import { money } from '../features/home/revenueSelectors';
import { downloadBlob } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { useReportRange } from '../features/reports/useReportRange';
import { formatSpan, rangeName } from '../features/reports/revenueModel';

const GROUP_BYS: DiscountReportGroupBy[] = ['reason', 'givenBy', 'customer', 'lineType'];
const DEFAULT_GROUP: DiscountReportGroupBy = 'reason';
const MEMBERS: DiscountReportMember[] = ['include', 'exclude'];
const KEY_PARAM = 'key';
const PAGE_PARAM = 'adjPage';
const PAGE_SIZE = 25;
const DASH = '—';
const MEMBER_PREFIX = 'MEMBER:';

const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const pct = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;

type T = (key: string, options?: Record<string, unknown>) => string;

/** A group's name from its key; the server names people, bill-tos and plans. */
function groupName(t: T, groupBy: DiscountReportGroupBy, g: Pick<DiscountReportGroup, 'key' | 'label'>): string {
  switch (groupBy) {
    case 'reason':
      if (g.key === 'FEE_WAIVED') return t('reports.discounts.key.feeWaived');
      if (g.key.startsWith(MEMBER_PREFIX))
        return t('reports.discounts.key.member', { plan: g.label ?? g.key.slice(MEMBER_PREFIX.length) });
      return REASON_LABEL[g.key as keyof typeof REASON_LABEL] ?? g.key;
    case 'givenBy':
      if (g.key === 'AUTOMATIC') return t('reports.discounts.key.automatic');
      if (g.key === 'UNRECORDED') return t('reports.discounts.key.unrecorded');
      return g.label ?? DASH;
    case 'customer':
      return g.label ?? DASH;
    case 'lineType':
      if (g.key === 'DOCUMENT') return t('reports.discounts.key.wholeInvoice');
      if (g.key === 'UNTYPED') return t('reports.discounts.key.untyped');
      return LINE_TYPE_LABEL[g.key as LineType] ?? g.key;
  }
}

/** Why the adjustment was given: the member plan, a fee waive, or its reason. */
function rowReason(t: T, r: DiscountReportRow): string {
  if (r.automatic || r.source === 'AGREEMENT') return t('reports.discounts.key.member', { plan: r.sourceLabel ?? DASH });
  if (r.kind === 'WAIVE' && r.lineType === 'FEE') return t('reports.discounts.key.feeWaived');
  return REASON_LABEL[r.reasonCode] ?? r.reasonCode;
}

function rowGiver(t: T, r: DiscountReportRow): string {
  if (r.automatic) return t('reports.discounts.key.automatic');
  return r.givenByName ?? t('reports.discounts.key.unrecorded');
}

/** Reason or giver, whichever the table isn't grouped by. */
const rowOther = (t: T, groupBy: DiscountReportGroupBy, r: DiscountReportRow) =>
  groupBy === 'reason' ? rowGiver(t, r) : rowReason(t, r);

export default function DiscountsReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const state = useReportRange([KEY_PARAM, PAGE_PARAM]);
  const { range, scope, searchParams, update, today } = state;
  const groupRaw = searchParams.get('group') as DiscountReportGroupBy | null;
  const groupBy = groupRaw && GROUP_BYS.includes(groupRaw) ? groupRaw : DEFAULT_GROUP;
  const member: DiscountReportMember = searchParams.get('member') === 'exclude' ? 'exclude' : 'include';
  const openKey = searchParams.get(KEY_PARAM);

  const params = { from: range.from, to: range.to, member, groupBy, regionIds: scope };
  const query = useQuery({
    queryKey: ['discount-report', params],
    queryFn: () => discountReportApi.get(params),
  });
  const report = query.data;

  const invoices = getName('invoice', true);
  const groupWord = (g: DiscountReportGroupBy) =>
    g === 'customer' ? t('reports.discounts.groupBy.customer', { customer: getName('customer') }) : t(`reports.discounts.groupBy.${g}`);
  const toDate = report ? report.to < range.to : range.to > today;
  const sub = report
    ? t(toDate ? 'reports.discounts.subToDate' : 'reports.discounts.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
        invoices: invoices.toLowerCase(),
      })
    : rangeName(range);

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const blob = await discountReportApi.exportCsv({ from: report.from, to: report.to, member, regionIds: scope });
      const file = `discounts-${report.from}-to-${report.to}.csv`;
      downloadBlob(blob, file);
      showSuccess(t('reports.discounts.exported', { file }));
    } catch {
      showError(t('reports.discounts.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.discounts.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (report.summary.adjustmentCount === 0)
    body = (
      <>
        <Summary report={report} />
        <EmptyState
          title={t('reports.discounts.empty.title')}
          description={t('reports.discounts.empty.body', { range: rangeName(range), invoices: invoices.toLowerCase() })}
        />
      </>
    );
  else {
    const open = openKey ? report.groups.find((g) => g.key === openKey) : undefined;
    body = (
      <>
        <Summary report={report} />
        <GroupsTable
          report={report}
          groupLabel={groupWord(groupBy)}
          onViewAll={(key) => update({ [KEY_PARAM]: key })}
        />
        {open && (
          <AllRows
            params={params}
            group={open}
            title={t('reports.discounts.list.title', { group: groupName(t, groupBy, open) })}
            onClose={() => update({ [KEY_PARAM]: null })}
          />
        )}
      </>
    );
  }

  return (
    <div className="rp-page rp-cq">
      <ReportBackLink state={state} />
      <PageHead
        title={t('reports.discounts.title')}
        sub={sub}
        actions={
          <Button
            outline
            size="xs"
            onClick={() => void exportCsv()}
            disabled={!report || exporting || report.summary.adjustmentCount === 0}
          >
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <RangeChips state={state} compare={false} />
        <FilterChipListbox
          label={t('reports.discounts.filters.member')}
          ariaLabel={t('reports.discounts.filters.member')}
          value={member}
          displayValue={t(`reports.discounts.member.${member}`)}
          onChange={(v) => update({ member: v === 'exclude' ? v : null })}
        >
          {MEMBERS.map((m) => (
            <ChipListboxOption key={m} value={m}>
              {t(`reports.discounts.member.${m}`)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
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

/** Every source, whatever the Member filter says. */
function Summary({ report }: { report: DiscountReport }) {
  const { t } = useTranslation();
  const s = report.summary;
  const count = t('reports.discounts.summary.count', { count: s.adjustmentCount });
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell
        label={t('reports.discounts.summary.total')}
        value={money(s.totalReduced)}
        sub={s.shareOfList != null ? t('reports.discounts.summary.ofList', { pct: pct(s.shareOfList), count }) : count}
      />
      <SummaryCell
        label={t('reports.discounts.summary.staff')}
        value={money(s.staff)}
        sub={t('reports.discounts.summary.staffSub')}
      />
      <SummaryCell label={t('reports.discounts.summary.feesWaived')} value={money(s.feesWaived)} />
      <SummaryCell
        label={t('reports.discounts.summary.member')}
        value={money(s.memberSavings)}
        sub={t('reports.discounts.summary.memberSub')}
        last
      />
    </div>
  );
}

function GroupsTable({
  report,
  groupLabel,
  onViewAll,
}: {
  report: DiscountReport;
  groupLabel: string;
  onViewAll: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.revenue.table.title', { group: groupLabel.toLowerCase() })}</CardTitle>
        <CardSub>{t('reports.discounts.table.hint')}</CardSub>
      </CardHead>
      <CardBody flush>
        {report.groups.length === 0 ? (
          <EmptyState compact title={t('reports.discounts.table.onlyMember')} />
        ) : (
          <div className="rp-table-wrap">
            <DenseTable className="rp-table">
              <DenseTHead>
                <tr>
                  <th>{groupLabel}</th>
                  <th className="right">{t('reports.discounts.table.count')}</th>
                  <th className="right">{t('reports.discounts.table.amount')}</th>
                  <th className="rp-hide-sm">{t('reports.revenue.table.share')}</th>
                  <th className="right rp-hide-md">{t('reports.discounts.table.average')}</th>
                </tr>
              </DenseTHead>
              <tbody>
                {report.groups.map((g) => {
                  const isOpen = open.has(g.key);
                  return (
                    <Fragment key={g.key}>
                      <DenseRow
                        className="rp-group"
                        onClick={() => toggle(g.key)}
                        aria-expanded={isOpen}
                        data-testid="report-group"
                      >
                        <td>
                          <span className="rp-group-name">
                            <ChevronRightIcon className={clsx('rp-caret size-3', isOpen && 'open')} />
                            <span className="strong">{groupName(t, report.groupBy, g)}</span>
                            {g.automatic && <Pill tone="neutral">{t('reports.discounts.automatic')}</Pill>}
                          </span>
                        </td>
                        <td className="right num">{g.count.toLocaleString('en-US')}</td>
                        <td className="right num strong">{formatCurrency(g.amount)}</td>
                        <td className="rp-hide-sm">
                          <span className="rp-share">
                            <span className="rp-prog rp-hide-md">
                              <span style={{ width: `${g.share * 100}%` }} />
                            </span>
                            <span className="num">{Math.round(g.share * 100)}%</span>
                          </span>
                        </td>
                        <td className="right num rp-hide-md">{formatCurrency(g.average)}</td>
                      </DenseRow>
                      {isOpen && <GroupSample report={report} group={g} onViewAll={() => onViewAll(g.key)} />}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td className="strong">{t('reports.revenue.table.total')}</td>
                  <td className="right num">{report.total.count.toLocaleString('en-US')}</td>
                  <td className="right num strong">{formatCurrency(report.total.amount)}</td>
                  <td className="rp-hide-sm" />
                  <td className="right num rp-hide-md">
                    {report.total.count ? formatCurrency(report.total.amount / report.total.count) : DASH}
                  </td>
                </tr>
              </tfoot>
            </DenseTable>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** A group's largest adjustments under its row: the header's columns, cell for cell. */
function GroupSample({
  report,
  group,
  onViewAll,
}: {
  report: DiscountReport;
  group: DiscountReportGroup;
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {group.sample.map((r) => {
        const line = r.lineDescription ?? t('reports.discounts.key.wholeInvoice');
        const other = rowOther(t, report.groupBy, r);
        return (
          <tr key={r.adjustmentId} className="rp-detail" data-testid="report-group-adjustment">
            <td>
              <span className="rp-detail-lead">
                <InvoiceLink row={r} />
                <span className="rp-trunc" title={r.billToName ?? undefined}>
                  {r.billToName ?? DASH}
                </span>
                <span className="rp-trunc text-fg-muted" title={line}>
                  {line}
                </span>
              </span>
            </td>
            <td className="right muted-cell">
              <span className="rp-trunc" title={r.reasonNote ? `${other} · ${r.reasonNote}` : other}>
                {other}
              </span>
            </td>
            <td className="right num">−{formatCurrency(r.amount)}</td>
            <td className="rp-hide-sm" />
            <td className="rp-hide-md" />
          </tr>
        );
      })}
      <tr className="rp-detail">
        <td colSpan={5}>
          <span className="rp-detail-note">
            {t('reports.revenue.table.showing', {
              shown: group.sample.length,
              count: group.count.toLocaleString('en-US'),
            })}
            {group.count > group.sample.length && (
              <>
                {' · '}
                <button type="button" className="card-action" onClick={onViewAll}>
                  {t('reports.discounts.table.viewAll')}
                </button>
              </>
            )}
          </span>
        </td>
      </tr>
    </>
  );
}

function InvoiceLink({ row }: { row: DiscountReportRow }) {
  return (
    <Link href={`/invoices/${row.invoiceId}`} className="mono text-fg-accent hover:underline">
      {row.invoiceNumber}
    </Link>
  );
}

/** One group's adjustments, largest first, paged in the URL. */
function AllRows({
  params,
  group,
  title,
  onClose,
}: {
  params: { from: string; to: string; member: DiscountReportMember; groupBy: DiscountReportGroupBy; regionIds?: string[] };
  group: DiscountReportGroup;
  title: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage(PAGE_PARAM);
  const full = { ...params, groupKey: group.key, page: page - 1, size: PAGE_SIZE };
  const query = useQuery({
    queryKey: ['discount-report', 'rows', full],
    queryFn: () => discountReportApi.rows(full),
  });

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !query.data)
    body = (
      <ErrorState
        title={t('reports.discounts.list.failed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else {
    const data = query.data;
    const first = data.totalElements ? data.page * data.size + 1 : 0;
    const last = data.page * data.size + data.content.length;
    body = (
      <>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{getName('invoice')}</th>
                <th className="rp-hide-md">{t('reports.discounts.list.billed')}</th>
                <th>{t('reports.discounts.list.billTo')}</th>
                <th className="rp-hide-sm">{t('reports.discounts.list.line')}</th>
                <th>
                  {params.groupBy === 'reason' ? t('reports.discounts.groupBy.givenBy') : t('reports.discounts.groupBy.reason')}
                </th>
                <th className="right">{t('reports.discounts.table.amount')}</th>
              </tr>
            </DenseTHead>
            <tbody>
              {data.content.map((r) => {
                const line = r.lineDescription ?? t('reports.discounts.key.wholeInvoice');
                const other = rowOther(t, params.groupBy, r);
                return (
                  <DenseRow key={r.adjustmentId} data-testid="report-adjustment">
                    <td>
                      <InvoiceLink row={r} />
                    </td>
                    <td className="num muted-cell rp-hide-md">{shortDate(r.invoiceDate)}</td>
                    <td className="strong">
                      <span className="rp-trunc" title={r.billToName ?? undefined}>
                        {r.billToName ?? DASH}
                      </span>
                    </td>
                    <td className="rp-hide-sm">
                      <span className="rp-trunc" title={line}>
                        {line}
                      </span>
                    </td>
                    <td className="muted-cell">
                      <span className="rp-trunc" title={r.reasonNote ? `${other} · ${r.reasonNote}` : other}>
                        {other}
                      </span>
                    </td>
                    <td className="right num">−{formatCurrency(r.amount)}</td>
                  </DenseRow>
                );
              })}
            </tbody>
          </DenseTable>
        </div>
        <ListFooter
          page={page}
          totalPages={data.totalPages}
          pageHref={pageHref}
          left={t('reports.discounts.list.range', { first, last, count: data.totalElements })}
        />
      </>
    );
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{title}</CardTitle>
        <button type="button" className="card-action" onClick={onClose}>
          {t('common.close')}
        </button>
      </CardHead>
      <CardBody flush>{body}</CardBody>
    </Card>
  );
}
