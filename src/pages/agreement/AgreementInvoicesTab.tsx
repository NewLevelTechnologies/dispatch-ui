/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/short labels stay literal to match the sibling tabs. */
// Agreement Invoices tab — the installment invoices minted from this
// agreement's billing schedule (invoices?agreementId=). Same lean row shape +
// status pill + pager as the customer AR tab, scoped to the agreement and with
// a Period column (billingPeriodKey) so each invoice maps back to its
// installment. Read-only: no per-invoice detail route yet.
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  invoicesApi,
  InvoiceStatus,
  type InvoiceListItemRow,
  type ListInvoicesParams,
} from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Card } from '../../components/catalyst/card';
import { Pill } from '../../components/ui/Pill';
import { DenseTable, DenseTHead, DenseRow } from '../../components/ui/DenseTable';
import { ListFooter } from '../../components/ui/ListFooter';
import { EmptyState } from '../../components/ui/EmptyState';
import { useUrlPage } from '../../hooks/useUrlPage';
import { formatDateShort, formatMoney } from '../../components/customer-detail/format';

// Canonical AR status → tone (mirrors CustomerInvoicesTab / InvoicesPage).
const INVOICE_STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  [InvoiceStatus.DRAFT]: 'neutral',
  [InvoiceStatus.SENT]: 'info',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.OVERDUE]: 'danger',
  [InvoiceStatus.CANCELLED]: 'neutral',
  [InvoiceStatus.VOID]: 'neutral',
};

const PAGE_SIZE = 25;

function StatusPill({ row }: { row: InvoiceListItemRow }) {
  const { t } = useTranslation();
  // Prefer the server-derived `overdue` flag so the pill agrees with AR rules
  // even before the stored status flips.
  if (row.overdue && row.status !== InvoiceStatus.PAID) {
    return <Pill tone="danger" dot>{t('invoices.status.overdue')}</Pill>;
  }
  return (
    <Pill tone={INVOICE_STATUS_TONE[row.status]} dot>
      {t(`invoices.status.${row.status.toLowerCase()}`)}
    </Pill>
  );
}

export default function AgreementInvoicesTab({ agreementId }: { agreementId: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { page, pageHref } = useUrlPage('agreementInvoicesPage');

  const params: ListInvoicesParams = {
    agreementId,
    page: page - 1, // local 1-based → backend 0-based
    size: PAGE_SIZE,
    sort: 'dueDate,asc',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', 'agreement', agreementId, 'list', params],
    queryFn: () => invoicesApi.getAll(params),
  });

  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <Card padding="none">
      {isLoading ? (
        <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">
          {t('common.actions.loading', { entities: getName('invoice', true) })}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title={`No ${getName('invoice', true).toLowerCase()} yet`}
          description="Installment invoices generate automatically once the billing schedule is active and each period comes due."
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <DenseTable className="dense-stack">
              <DenseTHead>
                <tr>
                  <th>{t('invoices.table.invoiceNumber')}</th>
                  <th>Period</th>
                  <th>{t('invoices.table.status')}</th>
                  <th>{t('invoices.table.invoiceDate')}</th>
                  <th>{t('invoices.table.dueDate')}</th>
                  <th className="right">{t('invoices.table.totalAmount')}</th>
                  <th className="right">{t('invoices.table.balanceDue')}</th>
                </tr>
              </DenseTHead>
              <tbody>
                {rows.map((inv) => {
                  // Void/cancelled invoices are de-emphasized the same way as
                  // InvoicesPage / the location AR tab: muted number, struck
                  // total, and a dash for the balance (not $0.00, which reads
                  // as "paid off"). The status pill is already neutral-toned.
                  const voided =
                    inv.status === InvoiceStatus.VOID || inv.status === InvoiceStatus.CANCELLED;
                  return (
                  <DenseRow key={inv.id}>
                    <td>
                      {/* Plain identifier, NOT accent: accent text is reserved for
                          links that navigate to another page (cf. the Schedule
                          tab's WO number → /work-orders/:id). Invoices have no
                          detail route yet — switch to `id-mono font-semibold
                          text-fg-accent` and make the row navigate once one lands. */}
                      <span className={voided ? 'font-mono text-fg-muted' : 'font-mono font-bold text-fg-strong'}>
                        {inv.invoiceNumber}
                      </span>
                    </td>
                    <td className="muted" data-label="Period">
                      {inv.billingPeriodKey ? (
                        <span className="id-mono">{inv.billingPeriodKey}</span>
                      ) : (
                        <span className="text-fg-dim">—</span>
                      )}
                    </td>
                    <td><StatusPill row={inv} /></td>
                    <td className="muted" data-label={t('invoices.table.invoiceDate')}>{formatDateShort(inv.invoiceDate)}</td>
                    <td className="muted" data-label={t('invoices.table.dueDate')}>{formatDateShort(inv.dueDate)}</td>
                    <td
                      className={voided ? 'right num text-fg-muted line-through' : 'right num strong'}
                      data-label={t('invoices.table.totalAmount')}
                    >
                      {formatMoney(inv.totalAmount)}
                    </td>
                    <td className={`right num${voided ? ' dt-empty' : ''}`} data-label={t('invoices.table.balanceDue')}>
                      {voided ? (
                        <span className="text-fg-dim">—</span>
                      ) : inv.balanceDue > 0 ? (
                        <span className="font-semibold text-fg-strong">{formatMoney(inv.balanceDue)}</span>
                      ) : (
                        <span className="text-fg-dim">{formatMoney(0)}</span>
                      )}
                    </td>
                  </DenseRow>
                  );
                })}
              </tbody>
            </DenseTable>
          </div>
          <ListFooter
            page={page}
            totalPages={totalPages}
            pageHref={pageHref}
            left={t('common.pagination.showing', {
              start: showingStart,
              end: showingEnd,
              total: total.toLocaleString(),
            })}
          />
        </>
      )}
    </Card>
  );
}
