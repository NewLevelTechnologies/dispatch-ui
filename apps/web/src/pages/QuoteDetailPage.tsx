/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { quotesApi, QuoteStatus } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { Pill, Tag } from '../components/ui/Pill';
import { Callout } from '../components/ui/Callout';
import { DocumentPageFrame } from '../components/document/DocumentPageFrame';
import { DocumentSummaryHeader, type DocumentStep } from '../components/document/DocumentSummaryHeader';
import { DocumentBody, DocumentWarnings } from '../components/document/DocumentBody';
import { useDocumentParties } from '../components/document/useDocumentParties';
import { formatDocDate, isLegacy, memberLabel, memberSavings } from '../components/document/documentModel';

const STATUS_TONE: Record<QuoteStatus, 'neutral' | 'info' | 'success' | 'warning' | 'danger'> = {
  [QuoteStatus.DRAFT]: 'neutral',
  [QuoteStatus.SENT]: 'info',
  [QuoteStatus.ACCEPTED]: 'success',
  [QuoteStatus.DECLINED]: 'danger',
  [QuoteStatus.EXPIRED]: 'warning',
};

const STEP_INDEX: Record<QuoteStatus, number> = { DRAFT: 0, SENT: 1, ACCEPTED: 2, DECLINED: 1, EXPIRED: 1 };

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const { data: quote, isLoading, isError } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => quotesApi.getById(id!),
    enabled: !!id,
  });
  const { billTo, location, workOrder } = useDocumentParties({
    customerId: quote?.customerId ?? '',
    customerName: quote?.customerName,
    workOrderId: quote?.workOrderId,
    serviceLocationId: quote?.serviceLocationId,
  });

  const entityLabel = getName('quote');
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

  return (
    <DocumentPageFrame
      loading={false}
      error={false}
      entityLabel={entityLabel}
      back={back}
      number={quote.quoteNumber}
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

      {isLegacy(quote) && (
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
      <DocumentWarnings doc={quote} billToName={billTo.name} nte={workOrder?.notToExceed} />

      <DocumentBody doc={quote} notes={quote.notes} />
    </DocumentPageFrame>
  );
}
