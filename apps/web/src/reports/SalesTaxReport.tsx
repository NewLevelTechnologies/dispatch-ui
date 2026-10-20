// Reports → Sales tax. Invoices billed in the range (Revenue's rule), by the
// tax each line stored when it was written, per jurisdiction. Nothing is
// recomputed: every figure is the server's, and `total.tax` reconciles to the
// invoices' own tax. Each jurisdiction expands to its tax classes plus an
// exempt-accounts row. Narrow, Non-taxable + Exempt merge into one "Not taxed"
// column and money drops to whole dollars (the CSV keeps cents). State lives in
// the URL (`range`, `region`).
import { Fragment, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ArrowDownTrayIcon, ChevronRightIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  salesTaxReportApi,
  type SalesTaxClassRow,
  type SalesTaxJurisdiction,
  type SalesTaxReport as Report,
  type SalesTaxWarning,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasAnyCapability } from '../hooks/useCurrentUser';
import { showError, showSuccess } from '../lib/toast';
import { Button } from '../components/catalyst/button';
import { PageHead } from '../components/ui/PageHead';
import { Callout } from '../components/ui/Callout';
import { SummaryCell } from '../components/ui/SummaryCell';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../components/ui/DenseTable';
import { ChipListboxOption, FilterChipListbox } from '../components/ui/FilterChipListbox';
import { downloadBlob } from '../features/reports/csv';
import { RangeChips, RangeProblem, ReportBackLink } from '../features/reports/RangeChips';
import { useReportRange } from '../features/reports/useReportRange';
import { formatSpan, rangeName } from '../features/reports/revenueModel';

const BASIS = 'sent' as const;
const CASH_BASIS = 'cash';
const DASH = '—';
const CLASS_ORDER = ['LABOR', 'MATERIALS', 'EQUIPMENT', 'FEE'];
const SPECIAL_KEYS = ['NONE', 'LEGACY'];

/** A fraction as a percent with no trailing zeros: 0.0825 → "8.25%". */
const ratePct = (rate: number) => `${Number((rate * 100).toFixed(4))}%`;

const whole = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);

/** Cents, and whole dollars once the content is narrow. */
function Money({ amount }: { amount: number }) {
  return (
    <>
      <span className="rp-hide-md">{formatCurrency(amount)}</span>
      <span className="rp-show-md">{whole(amount)}</span>
    </>
  );
}

const byClassOrder = (a: SalesTaxClassRow, b: SalesTaxClassRow) => {
  const rank = (c: SalesTaxClassRow) => (c.taxClass ? CLASS_ORDER.indexOf(c.taxClass) : CLASS_ORDER.length);
  return rank(a) - rank(b);
};

export default function SalesTaxReport() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const state = useReportRange();
  const { range, scope, today } = state;

  const params = { from: range.from, to: range.to, basis: BASIS, regionIds: scope };
  const query = useQuery({
    queryKey: ['sales-tax-report', params],
    queryFn: () => salesTaxReportApi.get(params),
  });
  const report = query.data;

  const invoices = getName('invoice', true).toLowerCase();
  const toDate = report ? report.to < range.to : range.to > today;
  const sub = report
    ? t(toDate ? 'reports.salesTax.subToDate' : 'reports.salesTax.sub', {
        range: rangeName(range),
        dates: formatSpan(report.from, report.to),
        invoices,
      })
    : rangeName(range);
  const empty = !!report && report.jurisdictions.length === 0;

  const [exporting, setExporting] = useState(false);
  const exportCsv = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const blob = await salesTaxReportApi.exportCsv({ from: report.from, to: report.to, basis: BASIS, regionIds: scope });
      const file = `sales-tax-${report.from}-to-${report.to}.csv`;
      downloadBlob(blob, file);
      showSuccess(t('reports.salesTax.exported', { file }));
    } catch {
      showError(t('reports.salesTax.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !report)
    body = (
      <ErrorState
        title={t('reports.salesTax.loadFailed')}
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
        {report.warnings.map((w, i) => (
          <Warning key={`${w.code}-${i}`} warning={w} report={report} />
        ))}
        <Summary report={report} />
        {empty ? (
          <EmptyState
            title={t('reports.salesTax.empty.title', { invoices })}
            description={t('reports.salesTax.empty.body', { range: rangeName(range), invoices })}
          />
        ) : (
          <JurisdictionsTable report={report} />
        )}
      </>
    );

  return (
    <div className="rp-page rp-cq">
      <ReportBackLink state={state} />
      <PageHead
        title={t('reports.salesTax.title')}
        sub={sub}
        actions={
          <Button outline size="xs" onClick={() => void exportCsv()} disabled={!report || exporting || empty}>
            <ArrowDownTrayIcon data-slot="icon" />
            {exporting ? t('reports.revenue.exporting') : t('reports.revenue.export')}
          </Button>
        }
      />
      <div className="rp-filters">
        <RangeChips state={state} compare={false} />
        <span className="rp-filters-divider" aria-hidden />
        <FilterChipListbox
          label={t('reports.salesTax.filters.basis')}
          ariaLabel={t('reports.salesTax.filters.basis')}
          value={BASIS}
          displayValue={t('reports.salesTax.basis.sent')}
          onChange={() => {}}
        >
          <ChipListboxOption value={BASIS}>{t('reports.salesTax.basis.sent')}</ChipListboxOption>
          <ChipListboxOption value={CASH_BASIS} disabled>
            {t('reports.salesTax.basis.cash')}
            <span className="text-fg-muted"> · {t('reports.salesTax.basis.soon')}</span>
          </ChipListboxOption>
        </FilterChipListbox>
      </div>
      <RangeProblem state={state} />
      <div className="rp-stack">{body}</div>
    </div>
  );
}

function Warning({ warning, report }: { warning: SalesTaxWarning; report: Report }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canSetRate = useHasAnyCapability('MANAGE_PRICING');
  if (warning.code === 'TAX_MISMATCH')
    return (
      <Callout kind="danger">
        {t('reports.salesTax.warn.mismatch', {
          count: warning.count,
          invoices: getName('invoice', warning.count !== 1).toLowerCase(),
          numbers: warning.invoiceNumbers.join(', '),
        })}
      </Callout>
    );
  if (warning.code !== 'NO_RATE') return null;
  // Those invoices really collected nothing, so it keeps firing once a rate is set.
  const now = report.jurisdictions.find((j) => j.jurisdictionId === warning.jurisdictionId)?.currentRate ?? null;
  return (
    <Callout
      kind="warning"
      action={
        now == null && canSetRate ? (
          <RouterLink to="/settings/tax" className="card-action">
            {t('reports.salesTax.warn.setRate')}
          </RouterLink>
        ) : undefined
      }
    >
      {t('reports.salesTax.warn.noRate', { name: warning.jurisdictionName, amount: formatCurrency(warning.amount) })}
      {now != null && ` ${t('reports.salesTax.warn.nowSet', { rate: ratePct(now) })}`}
    </Callout>
  );
}

function Summary({ report }: { report: Report }) {
  const { t } = useTranslation();
  const total = report.total;
  return (
    <div className="rp-strip" data-testid="report-summary">
      <SummaryCell label={t('reports.salesTax.summary.gross')} value={formatCurrency(total.gross)} />
      <SummaryCell label={t('reports.salesTax.summary.taxable')} value={formatCurrency(total.taxable)} />
      <SummaryCell
        label={t('reports.salesTax.summary.notTaxed')}
        value={formatCurrency(total.nonTaxable + total.exempt)}
        sub={t('reports.salesTax.summary.exemptSub', { amount: formatCurrency(total.exempt) })}
      />
      <SummaryCell
        label={t('reports.salesTax.summary.tax')}
        value={formatCurrency(total.tax)}
        sub={t('reports.salesTax.summary.jurisdictions', { count: report.jurisdictionCount })}
        last
      />
    </div>
  );
}

function Rates({ rates }: { rates: (number | null)[] }) {
  const { t } = useTranslation();
  if (rates.length === 0) return <span className="text-fg-muted">{DASH}</span>;
  return (
    <>
      {rates.map((r, i) => (
        <Fragment key={`${r}-${i}`}>
          {i > 0 && ' / '}
          {r == null ? <span className="text-warning-fg">{t('reports.salesTax.notSet')}</span> : ratePct(r)}
        </Fragment>
      ))}
    </>
  );
}

/** Gross · Taxable · Non-taxable · Exempt · Not taxed (narrow) · Tax: the money columns, cell for cell. */
function MoneyCells({
  gross,
  taxable,
  nonTaxable,
  exempt,
  tax,
  strong,
}: {
  gross: number;
  taxable: number | null;
  nonTaxable: number | null;
  exempt: number | null;
  tax: number;
  strong?: boolean;
}) {
  const cell = (v: number | null) => (v == null ? <span className="text-fg-muted">{DASH}</span> : <Money amount={v} />);
  return (
    <>
      <td className="right num">{cell(gross)}</td>
      <td className="right num">{cell(taxable)}</td>
      <td className="right num rp-hide-md">{cell(nonTaxable)}</td>
      <td className="right num rp-hide-md">{cell(exempt)}</td>
      <td className="right num rp-show-md">
        {cell(nonTaxable == null && exempt == null ? null : (nonTaxable ?? 0) + (exempt ?? 0))}
      </td>
      <td className={clsx('right num', strong && 'strong')}>{cell(tax)}</td>
    </>
  );
}

function JurisdictionsTable({ report }: { report: Report }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const nameOf = (j: SalesTaxJurisdiction) =>
    j.key === 'NONE'
      ? t('reports.salesTax.key.none')
      : j.key === 'LEGACY'
        ? t('reports.salesTax.key.legacy')
        : (j.name ?? DASH);

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('reports.salesTax.table.title')}</CardTitle>
        <CardSub>{t('reports.salesTax.table.hint')}</CardSub>
      </CardHead>
      <CardBody flush>
        <div className="rp-table-wrap">
          <DenseTable className="rp-table">
            <DenseTHead>
              <tr>
                <th>{t('reports.salesTax.table.jurisdiction')}</th>
                <th>{t('reports.salesTax.table.rate')}</th>
                <th className="right">{t('reports.salesTax.table.gross')}</th>
                <th className="right">{t('reports.salesTax.table.taxable')}</th>
                <th className="right rp-hide-md">{t('reports.salesTax.table.nonTaxable')}</th>
                <th className="right rp-hide-md">{t('reports.salesTax.table.exempt')}</th>
                <th className="right rp-show-md">{t('reports.salesTax.table.notTaxed')}</th>
                <th className="right">{t('reports.salesTax.table.tax')}</th>
              </tr>
            </DenseTHead>
            <tbody>
              {report.jurisdictions.map((j) => {
                // NONE and LEGACY have no class split to open.
                const expandable = !SPECIAL_KEYS.includes(j.key) && (j.classes.length > 0 || j.exemptAccounts != null);
                const isOpen = expandable && open.has(j.key);
                return (
                  <Fragment key={j.key}>
                    <DenseRow
                      className={clsx(expandable && 'rp-group')}
                      onClick={expandable ? () => toggle(j.key) : undefined}
                      aria-expanded={expandable ? isOpen : undefined}
                      data-testid="report-jurisdiction"
                    >
                      <td>
                        <span className="rp-group-name">
                          <ChevronRightIcon
                            className={clsx('rp-caret size-3', isOpen && 'open', !expandable && 'invisible')}
                          />
                          <span className={SPECIAL_KEYS.includes(j.key) ? 'text-fg-muted' : 'strong'}>{nameOf(j)}</span>
                        </span>
                      </td>
                      <td className="num">
                        <Rates rates={j.rates} />
                      </td>
                      <MoneyCells {...j} strong />
                    </DenseRow>
                    {isOpen && (
                      <>
                        {[...j.classes].sort(byClassOrder).map((c) => (
                          <tr key={c.taxClass ?? 'none'} className="rp-detail" data-testid="report-tax-class">
                            <td>
                              <span className="rp-detail-lead">
                                <span>
                                  {c.taxClass ? t(`settings.tax.class.${c.taxClass}`) : t('reports.salesTax.key.unclassified')}
                                </span>
                                {!c.taxedHere && <span className="text-fg-muted">{t('reports.salesTax.notTaxedHere')}</span>}
                              </span>
                            </td>
                            <td />
                            <MoneyCells gross={c.gross} taxable={c.taxable} nonTaxable={c.nonTaxable} exempt={null} tax={c.tax} />
                          </tr>
                        ))}
                        {j.exemptAccounts && (
                          <tr className="rp-detail" data-testid="report-tax-class">
                            <td>
                              <span className="rp-detail-lead">{t('reports.salesTax.exemptAccounts')}</span>
                            </td>
                            <td />
                            <MoneyCells
                              gross={j.exemptAccounts.gross}
                              taxable={null}
                              nonTaxable={null}
                              exempt={j.exemptAccounts.gross}
                              tax={j.exemptAccounts.tax}
                            />
                          </tr>
                        )}
                      </>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="strong">{t('reports.revenue.table.total')}</td>
                <td />
                <MoneyCells {...report.total} strong />
              </tr>
            </tfoot>
          </DenseTable>
        </div>
      </CardBody>
    </Card>
  );
}
