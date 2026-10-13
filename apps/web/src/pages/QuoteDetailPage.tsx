/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { EllipsisHorizontalIcon } from '@heroicons/react/16/solid';
import { useTranslation } from '@dispatch/i18n';
import { quotesApi, QuoteStatus, type Quote } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess } from '../lib/toast';
import { Pill, Tag } from '../components/ui/Pill';
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
import { documentErrorMessage, lineEditing, useDocumentEditor } from '../components/document/useDocumentEditor';
import { formatDocDate, isLegacy, memberLabel, memberSavings, toDateInput } from '../components/document/documentModel';

const STATUS_TONE: Record<QuoteStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  [QuoteStatus.DRAFT]: 'neutral',
  [QuoteStatus.SENT]: 'info',
  [QuoteStatus.ACCEPTED]: 'success',
  [QuoteStatus.DECLINED]: 'danger',
  [QuoteStatus.EXPIRED]: 'warning',
};

const STEP_INDEX: Record<QuoteStatus, number> = { DRAFT: 0, SENT: 1, ACCEPTED: 2, DECLINED: 1, EXPIRED: 1 };

const FROZEN: QuoteStatus[] = [QuoteStatus.ACCEPTED, QuoteStatus.DECLINED, QuoteStatus.EXPIRED];

type Confirm = 'revise' | 'accept' | 'decline' | null;

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const entityLabel = getName('quote');
  const entityLower = entityLabel.toLowerCase();

  const { data: quote, isLoading, isError } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesApi.getById(id!),
    enabled: !!id,
  });
  const editor = useDocumentEditor<Quote>({ queryKey: ['quote', id], entity: entityLower });
  // A sent quote is edited only after the CSR confirms it goes back to Draft
  // as a new revision; the first edit is what moves it.
  // Keyed by id so it doesn't carry over to a duplicate opened in place.
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const revising = revisingId === id;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [headerOpen, setHeaderOpen] = useState(false);

  const duplicate = useMutation({
    mutationFn: () => quotesApi.duplicate(id!),
    onSuccess: (copy) => {
      showSuccess(`Duplicated as ${copy.quoteNumber}`, 'A new draft with the same lines, dated today.');
      navigate(`/quotes/${copy.id}`);
    },
    onError: (err) => showError(`Couldn’t duplicate this ${entityLower}`, documentErrorMessage(err, entityLower)),
  });
  const { billTo, location, workOrder } = useDocumentParties({
    customerId: quote?.customerId ?? '',
    customerName: quote?.customerName,
    workOrderId: quote?.workOrderId,
    serviceLocationId: quote?.serviceLocationId,
  });

  const back = quote?.workOrderId
    ? {
        to: `/work-orders/${quote.workOrderId}`,
        label: workOrder
          ? [workOrder.workOrderNumber, workOrder.summary].filter(Boolean).join(' · ')
          : getName('work_order'),
      }
    : { to: '/quotes', label: getName('quote', true) };

  if (!quote) {
    return <DocumentPageFrame loading={isLoading} error={isError || !isLoading} entityLabel={entityLabel} back={back} />;
  }

  const steps: DocumentStep[] = [
    { label: 'Draft', date: formatDocDate(quote.createdAt, false) },
    { label: 'Sent', date: formatDocDate(quote.firstSentAt, false) },
    { label: 'Accepted', date: formatDocDate(quote.decidedAt, false) },
  ];
  const ended: DocumentStep | null =
    quote.status === QuoteStatus.DECLINED
      ? { label: 'Declined', date: formatDocDate(quote.decidedAt, false) }
      : quote.status === QuoteStatus.EXPIRED
        ? { label: 'Expired', date: formatDocDate(quote.expirationDate, false) }
        : null;
  const revision = quote.revision ?? null;
  const legacy = isLegacy(quote);
  const frozen = FROZEN.includes(quote.status);
  const editable = !legacy && (quote.status === QuoteStatus.DRAFT || (quote.status === QuoteStatus.SENT && revising));
  // A draft that was sent before is a revision the customer can't see yet.
  const unsentRevision = quote.status === QuoteStatus.DRAFT && !!quote.firstSentAt;
  const nextRev = (revision ?? 1) + 1;

  const send = () => {
    let to = '';
    void editor
      .run(
        async () => {
          to = (await quotesApi.send(quote.id)).lastSentToEmails;
        },
        `Couldn’t send this ${entityLower}`,
        { returnsDocument: false },
      )
      .then((ok) => {
        if (!ok) return;
        setRevisingId(null);
        showSuccess(`${quote.quoteNumber} sent`, to ? `To ${to}` : undefined);
      });
  };
  const setStatus = (status: QuoteStatus) =>
    void editor.run(() => quotesApi.updateStatus(quote.id, { status }), `Couldn’t update this ${entityLower}`);

  const sendLabel = unsentRevision ? `Re-send · Rev ${revision ?? 1}` : quote.lastSentAt ? 'Resend' : `Send ${entityLower}`;
  const actions = (
    <>
      <DocumentEditStatus saving={editor.saving} />
      {editable && (
        <Button outline size="xs" onClick={() => setHeaderOpen(true)}>
          Edit details
        </Button>
      )}
      {!legacy && quote.status === QuoteStatus.SENT && !revising && (
        <Button outline size="xs" onClick={() => setConfirm('revise')}>
          {`Edit ${entityLower}`}
        </Button>
      )}
      {frozen ? (
        <Button outline size="xs" disabled={duplicate.isPending} onClick={() => duplicate.mutate()}>
          Duplicate
        </Button>
      ) : (
        <>
          <Button color="dark/zinc" size="xs" disabled={editor.saving} onClick={send}>
            {sendLabel}
          </Button>
          <Dropdown>
            <DropdownButton plain size="xs" aria-label="More actions">
              <EllipsisHorizontalIcon />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem onClick={() => setConfirm('accept')}>
                <DropdownLabel>Mark accepted</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={() => setConfirm('decline')}>
                <DropdownLabel>Mark declined</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={() => duplicate.mutate()}>
                <DropdownLabel>Duplicate</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </>
      )}
    </>
  );

  return (
    <DocumentPageFrame
      loading={false}
      error={false}
      entityLabel={entityLabel}
      back={back}
      number={quote.quoteNumber}
      actions={actions}
      badges={
        <>
          <Pill tone={STATUS_TONE[quote.status]} dot>
            {t(`quotes.status.${quote.status.toLowerCase()}`)}
          </Pill>
          {revision != null && <Tag word>Rev {revision}</Tag>}
        </>
      }
    >
      <DocumentSummaryHeader
        billTo={billTo}
        location={location}
        poNumber={quote.customerPoNumber}
        nte={workOrder?.notToExceed != null ? { amount: workOrder.notToExceed, over: false } : null}
        member={memberLabel(quote.adjustments)}
        amountLabel={`${entityLabel} total`}
        amount={quote.totalAmount}
        amountSub={`Expires ${formatDocDate(quote.expirationDate) ?? '—'}`}
        memberSaved={memberSavings(quote.adjustments)}
        steps={steps}
        current={STEP_INDEX[quote.status]}
        ended={ended}
      />

      {editor.stale && <StaleCallout entity={entityLower} onDismiss={editor.dismissStale} />}
      {legacy && (
        <Callout kind="neutral" className="mb-2.5">
          Created before line pricing, so it can't be edited. It shows the tax rate it was created with.
        </Callout>
      )}
      {quote.status === QuoteStatus.ACCEPTED && (
        <Callout kind="success" className="mb-2.5">
          Accepted {formatDocDate(quote.decidedAt) ?? ''}
          {quote.acceptedByUserId ? ', recorded by the office' : ' by the customer'}
          {quote.acceptedRevision != null ? ` · Rev ${quote.acceptedRevision}` : ''}. Accepted {getName('quote', true).toLowerCase()} are locked.
        </Callout>
      )}
      {!legacy && quote.status === QuoteStatus.SENT && (
        <Callout kind="info" className="mb-2.5">
          {revising
            ? `Your first change moves it back to Draft as Rev ${nextRev}. `
            : `Sent ${formatDocDate(quote.lastSentAt) ?? ''} · Rev ${revision ?? 1}. Editing moves it back to Draft as Rev ${nextRev}. `}
          Until you re-send, the customer’s link shows “This {entityLower} is being updated”, with no amounts and no approve
          button.
        </Callout>
      )}
      {unsentRevision && (
        <Callout kind="warning" className="mb-2.5">
          Rev {revision ?? 1} draft. The customer’s link shows “This {entityLower} is being updated” until you re-send.
        </Callout>
      )}
      <DocumentWarnings doc={quote} billToName={billTo.name} nte={workOrder?.notToExceed} />

      <DocumentBody
        doc={quote}
        notes={quote.notes}
        editing={editable ? lineEditing(quotesApi, quote.id, editor.run) : undefined}
      />

      <DocumentHeaderDialog
        open={headerOpen}
        onClose={() => setHeaderOpen(false)}
        title={`Edit ${entityLower} details`}
        dates={[
          { key: 'quoteDate', label: `${entityLabel} date`, value: toDateInput(quote.quoteDate), required: true },
          { key: 'expirationDate', label: 'Expires', value: toDateInput(quote.expirationDate), required: true },
        ]}
        customerPoNumber={quote.customerPoNumber}
        notes={quote.notes}
        onSave={(v) =>
          editor.run(
            (version) =>
              quotesApi.updateHeader(quote.id, {
                version,
                quoteDate: v.dates.quoteDate,
                expirationDate: v.dates.expirationDate,
                // The location is the work order's; never changed here.
                serviceLocationId: quote.serviceLocationId ?? null,
                customerPoNumber: v.customerPoNumber,
                notes: v.notes,
              }),
            `Couldn’t save the ${entityLower} details`,
          )
        }
      />
      <ConfirmDialog
        isOpen={confirm === 'revise'}
        onClose={() => setConfirm(null)}
        onConfirm={() => setRevisingId(id ?? null)}
        title={`Edit ${quote.quoteNumber}?`}
        message={`It goes back to Draft as Rev ${nextRev}. The customer’s link will show “This ${entityLower} is being updated” with no amounts until you re-send. An approval of Rev ${revision ?? 1} won’t be accepted after that.`}
        confirmLabel={`Edit as Rev ${nextRev}`}
      />
      <ConfirmDialog
        isOpen={confirm === 'accept'}
        onClose={() => setConfirm(null)}
        onConfirm={() => setStatus(QuoteStatus.ACCEPTED)}
        title={`Mark ${quote.quoteNumber} accepted?`}
        message={`Records that the customer said yes to Rev ${revision ?? 1} by phone or in person. Accepted ${getName('quote', true).toLowerCase()} are locked.`}
        confirmLabel="Mark accepted"
      />
      <ConfirmDialog
        isOpen={confirm === 'decline'}
        onClose={() => setConfirm(null)}
        onConfirm={() => setStatus(QuoteStatus.DECLINED)}
        title={`Mark ${quote.quoteNumber} declined?`}
        message={`Declined ${getName('quote', true).toLowerCase()} are locked. To quote the work again, duplicate it.`}
        confirmLabel="Mark declined"
        isDestructive
      />
    </DocumentPageFrame>
  );
}
