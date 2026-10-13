/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EllipsisHorizontalIcon } from '@heroicons/react/16/solid';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { invoicesApi, InvoiceStatus, type Invoice } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { showSuccess } from '../lib/toast';
import { Pill } from '../components/ui/Pill';
import { Callout } from '../components/ui/Callout';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import ConfirmDialog from '../components/ConfirmDialog';
import { DocumentPageFrame } from '../components/document/DocumentPageFrame';
import { DocumentSummaryHeader, type DocumentStep } from '../components/document/DocumentSummaryHeader';
import { DocumentBody, DocumentWarnings } from '../components/document/DocumentBody';
import { DocumentHeaderDialog } from '../components/document/DocumentHeaderDialog';
import { DocumentEditStatus, StaleCallout } from '../components/document/DocumentEditStatus';
import { useDocumentParties } from '../components/document/useDocumentParties';
import { lineEditing, useDocumentEditor } from '../components/document/useDocumentEditor';
import { formatDocDate, isLegacy, memberLabel, memberSavings, toDateInput } from '../components/document/documentModel';

const STATUS_TONE: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  [InvoiceStatus.DRAFT]: 'neutral',
  [InvoiceStatus.SENT]: 'info',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.OVERDUE]: 'danger',
  [InvoiceStatus.CANCELLED]: 'neutral',
  [InvoiceStatus.VOID]: 'neutral',
};

const STEP_INDEX: Record<InvoiceStatus, number> = { DRAFT: 0, SENT: 1, OVERDUE: 1, PAID: 2, CANCELLED: 0, VOID: 0 };

const LOCKED: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE, InvoiceStatus.PAID];

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const entityLabel = getName('invoice');
  const entityLower = entityLabel.toLowerCase();

  const { data: invoice, isLoading, isError } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => invoicesApi.getById(id!),
    enabled: !!id,
  });
  const editor = useDocumentEditor<Invoice>({ queryKey: ['invoice', id], entity: entityLower });
  const [headerOpen, setHeaderOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { billTo, location, workOrder } = useDocumentParties({
    customerId: invoice?.customerId ?? '',
    workOrderId: invoice?.workOrderId,
  });

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
  const legacy = isLegacy(invoice);
  const draft = invoice.status === InvoiceStatus.DRAFT;
  const editable = !legacy && draft;
  const sendable = draft || invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.OVERDUE;

  const send = () => {
    let to = '';
    void editor
      .run(
        async () => {
          to = (await invoicesApi.send(invoice.id)).lastSentToEmails;
        },
        `Couldn’t send this ${entityLower}`,
        { returnsDocument: false },
      )
      .then((ok) => ok && showSuccess(`${invoice.invoiceNumber} sent`, to ? `To ${to}` : undefined));
  };
  const cancel = () =>
    void editor.run(
      () => invoicesApi.updateStatus(invoice.id, { status: InvoiceStatus.CANCELLED }),
      `Couldn’t cancel this ${entityLower}`,
    );

  const actions = (
    <>
      <DocumentEditStatus saving={editor.saving} />
      {editable && (
        <Button outline size="xs" onClick={() => setHeaderOpen(true)}>
          Edit details
        </Button>
      )}
      {sendable && (
        <Button color="dark/zinc" size="xs" disabled={editor.saving} onClick={send}>
          {draft ? `Send ${entityLower}` : 'Resend'}
        </Button>
      )}
      {draft && (
        <Dropdown>
          <DropdownButton plain size="xs" aria-label="More actions">
            <EllipsisHorizontalIcon />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={() => setConfirmCancel(true)}>
              <DropdownLabel>{`Cancel ${entityLower}`}</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </>
  );

  return (
    <DocumentPageFrame
      loading={false}
      error={false}
      entityLabel={entityLabel}
      back={back}
      number={invoice.invoiceNumber}
      actions={actions}
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

      {editor.stale && <StaleCallout entity={entityLower} onDismiss={editor.dismissStale} />}
      {legacy && (
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
      {!legacy && LOCKED.includes(invoice.status) && (
        <Callout kind="neutral" className="mb-2.5">
          Sent {getName('invoice', true).toLowerCase()} are locked because the customer’s copy and balance depend on the
          total.
        </Callout>
      )}
      <DocumentWarnings doc={invoice} billToName={billTo.name} nte={workOrder?.notToExceed} />

      <DocumentBody
        doc={invoice}
        notes={invoice.notes}
        settlement={{ amountPaid: invoice.amountPaid, balanceDue: invoice.balanceDue, payments: invoice.payments }}
        editing={editable ? lineEditing(invoicesApi, invoice.id, editor.run) : undefined}
      />

      <DocumentHeaderDialog
        open={headerOpen}
        onClose={() => setHeaderOpen(false)}
        title={`Edit ${entityLower} details`}
        dates={[
          { key: 'invoiceDate', label: `${entityLabel} date`, value: toDateInput(invoice.invoiceDate), required: true },
          { key: 'dueDate', label: 'Due', value: toDateInput(invoice.dueDate), required: true },
          { key: 'serviceDate', label: 'Service date', value: toDateInput(invoice.serviceDate), hint: 'When the work was done' },
        ]}
        customerPoNumber={invoice.customerPoNumber}
        notes={invoice.notes}
        onSave={(v) =>
          editor.run(
            (version) =>
              invoicesApi.updateHeader(invoice.id, {
                version,
                invoiceDate: v.dates.invoiceDate,
                dueDate: v.dates.dueDate,
                serviceDate: v.dates.serviceDate || null,
                customerPoNumber: v.customerPoNumber,
                notes: v.notes,
              }),
            `Couldn’t save the ${entityLower} details`,
          )
        }
      />
      <ConfirmDialog
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={cancel}
        title={`Cancel ${invoice.invoiceNumber}?`}
        message={`A cancelled ${entityLower} was never owed. It stays in the record and can't be edited or sent.`}
        confirmLabel={`Cancel ${entityLower}`}
        cancelLabel="Keep it"
        isDestructive
      />
    </DocumentPageFrame>
  );
}
