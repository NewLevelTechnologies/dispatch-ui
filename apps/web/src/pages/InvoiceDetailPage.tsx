/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { invoicesApi, InvoiceStatus } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { Pill } from '../components/ui/Pill';
import { Callout } from '../components/ui/Callout';
import { DocumentPageFrame } from '../components/document/DocumentPageFrame';
import { DocumentSummaryHeader, type DocumentStep } from '../components/document/DocumentSummaryHeader';
import { DocumentBody, DocumentWarnings } from '../components/document/DocumentBody';
import { useDocumentParties } from '../components/document/useDocumentParties';
import { formatDocDate, isLegacy, memberLabel, memberSavings } from '../components/document/documentModel';

const STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  [InvoiceStatus.DRAFT]: 'neutral',
  [InvoiceStatus.SENT]: 'info',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.OVERDUE]: 'danger',
  [InvoiceStatus.CANCELLED]: 'neutral',
  [InvoiceStatus.VOID]: 'neutral',
};

const STEP_INDEX: Record<InvoiceStatus, number> = { DRAFT: 0, SENT: 1, OVERDUE: 1, PAID: 2, CANCELLED: 0, VOID: 0 };

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoicesApi.getById(id!),
    enabled: !!id,
  });
  const { billTo, location, workOrder } = useDocumentParties({
    customerId: invoice?.customerId ?? '',
    workOrderId: invoice?.workOrderId,
  });

  const entityLabel = getName('invoice');
  const back = invoice?.workOrderId
    ? {
        to: `/work-orders/${invoice.workOrderId}`,
        label: workOrder
          ? [workOrder.workOrderNumber, workOrder.summary].filter(Boolean).join(' · ')
          : getName('work_order'),
      }
    : { to: '/invoices', label: getName('invoice', true) };

  if (!invoice) {
    return <DocumentPageFrame loading={isLoading} error={isError || !isLoading} entityLabel={entityLabel} back={back} />;
  }

  const withdrawn = invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.CANCELLED;
  const steps: DocumentStep[] = [
    { label: 'Draft', date: formatDocDate(invoice.createdAt, false) },
    { label: 'Sent', date: formatDocDate(invoice.lastSentAt, false) },
    { label: 'Paid', date: null },
  ];
  const ended: DocumentStep | null = withdrawn
    ? { label: invoice.status === InvoiceStatus.VOID ? 'Void' : 'Cancelled', date: formatDocDate(invoice.updatedAt, false) }
    : null;
  const nteOver = (invoice.warnings ?? []).some((w) => w.code === 'NTE_EXCEEDED');
  const returned = invoice.payments.filter((p) => p.reversedAt);
  const returnedTotal = returned.reduce((s, p) => s + p.amount, 0);
  const paid = invoice.amountPaid > 0;
  const due = formatDocDate(invoice.dueDate);

  return (
    <DocumentPageFrame
      loading={false}
      error={false}
      entityLabel={entityLabel}
      back={back}
      number={invoice.invoiceNumber}
      badges={
        <Pill tone={STATUS_TONE[invoice.status]} dot>
          {t(`invoices.status.${invoice.status.toLowerCase()}`)}
        </Pill>
      }
    >
      <DocumentSummaryHeader
        billTo={billTo}
        location={location}
        serviceDate={formatDocDate(invoice.serviceDate)}
        poNumber={invoice.customerPoNumber}
        nte={workOrder?.notToExceed != null ? { amount: workOrder.notToExceed, over: nteOver } : null}
        member={memberLabel(invoice.adjustments)}
        amountLabel={withdrawn ? 'Total (withdrawn)' : paid ? 'Balance due' : 'Amount due'}
        amount={withdrawn ? invoice.totalAmount : invoice.balanceDue}
        amountSub={
          withdrawn ? (
            'Nothing is owed on this invoice'
          ) : (
            <>
              Due {due ?? '—'}
              {paid && ` · total ${formatCurrency(invoice.totalAmount)}, ${formatCurrency(invoice.amountPaid)} paid`}
            </>
          )
        }
        memberSaved={memberSavings(invoice.adjustments)}
        steps={steps}
        current={STEP_INDEX[invoice.status]}
        ended={ended}
      />

      {isLegacy(invoice) && (
        <Callout kind="neutral" className="mb-2.5">
          Created before line pricing, so it can't be edited. It shows the tax rate it was created with.
        </Callout>
      )}
      {invoice.reissuedAsInvoiceId && (
        <Callout kind="neutral" className="mb-2.5">
          Voided and reissued as{' '}
          <Link to={`/invoices/${invoice.reissuedAsInvoiceId}`} className="id-mono font-semibold text-fg-accent hover:underline">
            {invoice.reissuedAsInvoiceNumber}
          </Link>
          .
        </Callout>
      )}
      {invoice.reissuedFromInvoiceId && (
        <Callout kind="neutral" className="mb-2.5">
          Reissue of{' '}
          <Link to={`/invoices/${invoice.reissuedFromInvoiceId}`} className="id-mono font-semibold text-fg-accent hover:underline">
            {invoice.reissuedFromInvoiceNumber}
          </Link>
          , which was voided. Lines and prices were copied as billed; only tax was worked out again.
        </Callout>
      )}
      {withdrawn && returned.length > 0 && (
        <Callout kind="neutral" className="mb-2.5">
          {formatCurrency(returnedTotal)} in payments applied to this {entityLabel.toLowerCase()} went back to{' '}
          {billTo.name}'s credit and can be applied to another {entityLabel.toLowerCase()}.
        </Callout>
      )}
      <DocumentWarnings doc={invoice} billToName={billTo.name} nte={workOrder?.notToExceed} />

      <DocumentBody
        doc={invoice}
        notes={invoice.notes}
        settlement={{ amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue, payments: invoice.payments }}
      />
    </DocumentPageFrame>
  );
}
