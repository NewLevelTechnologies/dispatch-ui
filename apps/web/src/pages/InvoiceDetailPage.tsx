/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EllipsisHorizontalIcon } from '@heroicons/react/16/solid';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { invoicesApi, InvoiceStatus, paymentsApi, type Invoice, type NestedInvoicePayment } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { errorCode, showError, showSuccess } from '../lib/toast';
import { Pill } from '../components/ui/Pill';
import { Callout } from '../components/ui/Callout';
import { Button } from '../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import ConfirmDialog from '../components/ConfirmDialog';
import PaymentDialog from '../components/PaymentDialog';
import VoidFinancialDocDialog from '../components/VoidFinancialDocDialog';
import { DocumentPageFrame } from '../components/document/DocumentPageFrame';
import { DocumentSummaryHeader, type DocumentStep } from '../components/document/DocumentSummaryHeader';
import { DocumentBody, DocumentWarnings } from '../components/document/DocumentBody';
import { DocumentHeaderDialog } from '../components/document/DocumentHeaderDialog';
import { DocumentEditStatus, StaleCallout } from '../components/document/DocumentEditStatus';
import { useDocumentParties } from '../components/document/useDocumentParties';
import { documentErrorMessage, lineEditing, refreshDocumentLists, useDocumentEditor } from '../components/document/useDocumentEditor';
import { useShareLink } from '../components/document/useShareLink';
import { ReissueCreditCallout } from '../components/document/ReissueCreditCallout';
import { formatDocDate, isLegacy, memberLabel, memberSavings, toDateInput } from '../components/document/documentModel';
import { SendDocumentDialog } from '../components/document/SendDocumentDialog';

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
  const [paying, setPaying] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [voidingPayment, setVoidingPayment] = useState<NestedInvoicePayment | null>(null);
  const [reissuing, setReissuing] = useState(false);
  const [sending, setSending] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const shareLink = useShareLink({
    routes: invoicesApi,
    id: id ?? '',
    number: invoice?.invoiceNumber ?? '',
    entity: entityLower,
  });
  const { billTo, location, workOrder, termsDays } = useDocumentParties({
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
  const open = invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.OVERDUE;
  const sendable = draft || open;
  const payable = open && invoice.balanceDue > 0;
  const voidable = open || invoice.status === InvoiceStatus.PAID;
  // A sent invoice is corrected by voiding it and copying it to a new draft; a void one can still be copied once.
  const reissuable = !invoice.reissuedAsInvoiceId && (voidable || invoice.status === InvoiceStatus.VOID);
  const reissueLabel = invoice.status === InvoiceStatus.VOID ? `Reissue ${entityLower}` : 'Void & reissue';

  // Who it goes to and its due date are confirmed in the Send dialog.
  const send = () => setSending(true);
  const voidInvoice = ({ revokeShareLink }: { revokeShareLink: boolean }) => {
    setVoiding(false);
    void editor
      .run(() => invoicesApi.updateStatus(invoice.id, { status: InvoiceStatus.VOID }), `Couldn’t void this ${entityLower}`)
      .then(async (ok) => {
        if (!ok || !revokeShareLink) return;
        try {
          await invoicesApi.revokeShareLink(invoice.id);
        } catch {
          showError('The customer’s link still works', 'Replace it from the ⋯ menu to turn it off.');
        }
      });
  };
  const voidPayment = async (payment: NestedInvoicePayment) => {
    try {
      await paymentsApi.void(payment.id);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      refreshDocumentLists(queryClient);
      showSuccess(`${payment.paymentNumber} voided`);
    } catch (err) {
      showError(`Couldn’t void ${payment.paymentNumber}`, documentErrorMessage(err, entityLower));
    }
  };
  const reissue = async () => {
    setReissuing(false);
    try {
      const copy = await invoicesApi.reissue(invoice.id);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      refreshDocumentLists(queryClient);
      showSuccess(
        invoice.status === InvoiceStatus.VOID
          ? `${copy.invoiceNumber} draft created`
          : `${invoice.invoiceNumber} voided · ${copy.invoiceNumber} draft created`,
      );
      navigate(`/invoices/${copy.id}`);
    } catch (err) {
      showError(
        `Couldn’t reissue ${invoice.invoiceNumber}`,
        // A 400 here is a pre-pricing invoice with a credit line, which can't be copied.
        errorCode(err) === 'INVALID_REQUEST'
          ? `It has a credit line from before line pricing, so it can’t be copied. Correct it by hand.`
          : documentErrorMessage(err, entityLower),
      );
    }
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
      {sendable &&
        (payable ? (
          <Button outline size="xs" disabled={editor.saving} onClick={send}>
            Resend
          </Button>
        ) : (
          <Button color="dark/zinc" size="xs" disabled={editor.saving} onClick={send}>
            {draft ? `Send ${entityLower}` : 'Resend'}
          </Button>
        ))}
      {payable && (
        <Button color="dark/zinc" size="xs" onClick={() => setPaying(true)}>
          Take payment
        </Button>
      )}
      {(draft || voidable || reissuable) && (
        <Dropdown>
          <DropdownButton plain size="xs" aria-label="More actions">
            <EllipsisHorizontalIcon />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            {draft && (
              <DropdownItem onClick={() => setConfirmCancel(true)}>
                <DropdownLabel>{`Cancel ${entityLower}`}</DropdownLabel>
              </DropdownItem>
            )}
            {voidable && invoice.lastSentAt && shareLink.items}
            {reissuable && (
              <DropdownItem onClick={() => setReissuing(true)}>
                <DropdownLabel>{reissueLabel}</DropdownLabel>
              </DropdownItem>
            )}
            {voidable && (
              <DropdownItem onClick={() => setVoiding(true)}>
                <DropdownLabel>{`Void ${entityLower}`}</DropdownLabel>
              </DropdownItem>
            )}
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
              {invoice.dueDate
                ? `Due ${due}`
                : `Not sent · ${termsDays == null ? 'dated when sent' : termsDays === 0 ? 'due on receipt once sent' : `due ${termsDays} days after it’s sent`}`}
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
      {invoice.reissuedFromInvoiceId && <ReissueCreditCallout invoice={invoice} billToName={billTo.name} entity={entityLower} />}
      {!legacy && LOCKED.includes(invoice.status) && (
        <Callout
          kind="neutral"
          className="mb-2.5"
          action={
            reissuable && (
              <Button outline size="xs" onClick={() => setReissuing(true)}>
                {reissueLabel}
              </Button>
            )
          }
        >
          Sent {getName('invoice', true).toLowerCase()} are locked because the customer’s copy and balance depend on the
          total.{reissuable && ' To correct one, void and reissue it.'}
        </Callout>
      )}
      <DocumentWarnings doc={invoice} billToName={billTo.name} nte={workOrder?.notToExceed} />

      <DocumentBody
        doc={invoice}
        notes={invoice.notes}
        settlement={{
          amountPaid: invoice.amountPaid,
          balanceDue: invoice.balanceDue,
          payments: invoice.payments,
          onVoidPayment: withdrawn ? undefined : setVoidingPayment,
        }}
        editing={editable ? lineEditing(invoicesApi, invoice.id, editor.run) : undefined}
      />

      <DocumentHeaderDialog
        open={headerOpen}
        onClose={() => setHeaderOpen(false)}
        title={`Edit ${entityLower} details`}
        dates={[
          { key: 'invoiceDate', label: `${entityLabel} date`, value: toDateInput(invoice.invoiceDate), hint: 'Blank: dated when sent' },
          { key: 'dueDate', label: 'Due', value: toDateInput(invoice.dueDate), hint: 'Blank: from the terms' },
          { key: 'serviceDate', label: 'Service date', value: toDateInput(invoice.serviceDate), hint: 'When the work was done' },
        ]}
        customerPoNumber={invoice.customerPoNumber}
        notes={invoice.notes}
        onSave={(v) =>
          editor.run(
            (version) =>
              invoicesApi.updateHeader(invoice.id, {
                version,
                invoiceDate: v.dates.invoiceDate || null,
                dueDate: v.dates.dueDate || null,
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
      <SendDocumentDialog target={sending ? { kind: 'invoice', doc: invoice } : null} onClose={() => setSending(false)} />
      <ConfirmDialog
        isOpen={reissuing}
        onClose={() => setReissuing(false)}
        onConfirm={() => void reissue()}
        title={invoice.status === InvoiceStatus.VOID ? `Reissue ${invoice.invoiceNumber}?` : `Void ${invoice.invoiceNumber} and reissue?`}
        message={
          invoice.status === InvoiceStatus.VOID
            ? `A new draft with the same lines opens so you can correct it and send it. ${invoice.invoiceNumber} stays void.`
            : `${invoice.invoiceNumber} becomes Void and stays in the record.${
                invoice.amountPaid > 0
                  ? ` The ${formatCurrency(invoice.amountPaid)} paid on it goes back to ${billTo.name}’s credit.`
                  : ''
              } A new draft with the same lines opens so you can correct it${
                invoice.amountPaid > 0 ? ', and once it’s sent it offers to apply that credit' : ''
              }.`
        }
        confirmLabel={invoice.status === InvoiceStatus.VOID ? 'Reissue' : 'Void & reissue'}
        cancelLabel="Keep it"
        isDestructive={invoice.status !== InvoiceStatus.VOID}
      />
      <ConfirmDialog
        isOpen={!!voidingPayment}
        onClose={() => setVoidingPayment(null)}
        onConfirm={() => voidingPayment && void voidPayment(voidingPayment)}
        title={`Void ${voidingPayment?.paymentNumber ?? 'payment'}?`}
        message={`This undoes the whole ${getName('payment').toLowerCase()}, on every ${entityLower} it was applied to, not just this one. It can't be undone.`}
        confirmLabel={`Void ${getName('payment').toLowerCase()}`}
        cancelLabel="Keep it"
        isDestructive
      />
      {voiding && (
        <VoidFinancialDocDialog
          open
          kind="invoice"
          entityLabel={entityLabel}
          documentNumber={invoice.invoiceNumber}
          amountDisplay={formatCurrency(invoice.totalAmount)}
          hasActiveShareLink={!!invoice.lastSentAt}
          onConfirm={voidInvoice}
          onClose={() => setVoiding(false)}
        />
      )}
      <PaymentDialog
        open={paying}
        onClose={() => {
          setPaying(false);
          queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
        }}
        workOrderId={invoice.workOrderId ?? ''}
        workOrderNumber={workOrder?.workOrderNumber ?? ''}
        customerName={billTo.name}
        openInvoices={payable ? [invoice] : []}
        lockedInvoice={invoice}
      />
      {shareLink.dialogs}
    </DocumentPageFrame>
  );
}
