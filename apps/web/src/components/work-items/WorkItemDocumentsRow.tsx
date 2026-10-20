import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ClipboardDocumentListIcon } from '@heroicons/react/16/solid';
import {
  laborRatesApi,
  quotesApi,
  type Quote,
  type WorkItemDocument,
  type WorkItemResponse,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError, extractApiError } from '../../lib/toast';
import { formatCurrency } from '@dispatch/utils';
import { refreshDocumentLists } from '../document/useDocumentEditor';
import { Pill } from '../ui/Pill';
import { Button } from '../catalyst/button';
import { Alert, AlertActions, AlertDescription, AlertTitle } from '../catalyst/alert';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
const QUOTE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  DECLINED: 'neutral',
  EXPIRED: 'danger',
};
const INVOICE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
  VOID: 'neutral',
};

interface Props {
  workOrderId: string;
  /** The job's customer — a new quote is billed to them. */
  customerId?: string;
  wi: WorkItemResponse;
  /** This item's quote/invoice rows (quotes first, newest first). */
  documents: WorkItemDocument[];
  readOnly: boolean;
}

/**
 * Where the item stands with money: "On Q-1903 [Accepted] $420 for this
 * item" / "Billed on INV-3302 [Paid]", or "Not on a quote yet" with Quote this
 * work — a draft quote (or the job's open draft) with the item's labor line
 * tied to it. Parts join once the item has a parts list.
 */
export default function WorkItemDocumentsRow({ workOrderId, customerId, wi, documents, readOnly }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [draftChoice, setDraftChoice] = useState<Quote | null>(null);

  const { data: rates = [] } = useQuery({
    queryKey: ['labor-rates'],
    queryFn: () => laborRatesApi.getAll(),
    enabled: !readOnly && documents.length === 0,
  });
  // Same default the line editor uses: the priced Regular rate, else the first priced one.
  const priced = rates.filter((r) => r.active && r.billRate != null);
  const rate = priced.find((r) => r.role === 'REGULAR') ?? priced[0] ?? null;
  const hours = wi.laborHoursEstimate ?? null;

  const quoteWord = getName('quote').toLowerCase();
  // The quote carries the item's labor line; without an estimate there's
  // nothing to tie to the item yet.
  const blockedReason = !customerId
    ? t('workOrders.workItems.quoteNeedsCustomer')
    : hours == null
      ? t('workOrders.workItems.quoteNeedsLabor', { quote: quoteWord })
      : !rate
        ? t('workOrders.workItems.quoteNeedsRate')
        : null;

  const addTo = async (existing: Quote | null) => {
    if (busy || blockedReason || !rate || hours == null || !customerId) return;
    setBusy(true);
    try {
      const doc = existing
        ? await quotesApi.getById(existing.id)
        : await quotesApi.create({ customerId, workOrderId, title: wi.description.slice(0, 120) });
      await quotesApi.addLine(doc.id, {
        version: doc.version ?? 0,
        laborRateTypeId: rate.id,
        quantity: hours,
        workItemId: wi.id,
      });
      refreshDocumentLists(queryClient);
      queryClient.invalidateQueries({ queryKey: ['work-item-documents', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['workOrderQuotes', workOrderId] });
      navigate(`/quotes/${doc.id}`);
    } catch (err) {
      showError(t('workOrders.workItems.quoteFailed', { quote: quoteWord }), extractApiError(err) ?? undefined);
      setBusy(false);
    }
  };

  // An open draft for this job → add to it, or start a new one?
  const quoteThisWork = async () => {
    try {
      const quotes = await queryClient.fetchQuery({
        queryKey: ['workOrderQuotes', workOrderId],
        queryFn: () => quotesApi.getByWorkOrder(workOrderId),
      });
      // The newest draft is the one being built.
      const draft =
        quotes
          .filter((q) => q.status === 'DRAFT')
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
      if (draft) setDraftChoice(draft);
      else void addTo(null);
    } catch {
      void addTo(null);
    }
  };

  if (documents.length > 0) {
    return (
      <div className="mt-2.5 flex flex-col gap-1.5">
        {documents.map((d) => {
          const isQuote = d.documentType === 'QUOTE';
          const tone = (isQuote ? QUOTE_TONE : INVOICE_TONE)[d.status] ?? 'neutral';
          return (
            <div key={`${d.documentType}-${d.documentId}`} className="flex flex-wrap items-center gap-2 text-[12px]">
              <span className="text-fg">
                {isQuote ? t('workOrders.workItems.onDocument') : t('workOrders.workItems.billedOn')}{' '}
                <Link
                  to={isQuote ? `/quotes/${d.documentId}` : `/invoices/${d.documentId}`}
                  className="font-mono font-semibold text-fg-accent hover:underline"
                >
                  {d.number}
                </Link>
              </span>
              <Pill tone={d.declined ? 'neutral' : tone} dot>
                {d.declined
                  ? t('workOrders.workItems.notSold')
                  : t(`workOrders.workItems.docStatus.${d.documentType}.${d.status}`, { defaultValue: d.status })}
              </Pill>
              {d.amount != null && !d.declined && (
                <span className="tabular-nums text-fg-muted">
                  {isQuote
                    ? t('workOrders.workItems.forThisItem', { amount: formatCurrency(d.amount) })
                    : formatCurrency(d.amount)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-fg-muted">
        {t('workOrders.workItems.notOnQuote', { quote: quoteWord })}
      </span>
      <span className="flex-1" />
      {!readOnly && (
        <Button
          outline
          size="xxs"
          onClick={() => void quoteThisWork()}
          disabled={busy || !!blockedReason}
          title={blockedReason ?? undefined}
        >
          <ClipboardDocumentListIcon data-slot="icon" />
          {t('workOrders.workItems.quoteThisWork')}
        </Button>
      )}
      {!readOnly && blockedReason && (
        <span className="basis-full text-right text-[11px] text-fg-muted">{blockedReason}</span>
      )}

      <Alert open={!!draftChoice} onClose={() => setDraftChoice(null)}>
        <AlertTitle>{t('workOrders.workItems.draftChoiceTitle', { quote: quoteWord })}</AlertTitle>
        <AlertDescription>
          {t('workOrders.workItems.draftChoiceMessage', { number: draftChoice?.quoteNumber ?? '', quote: quoteWord })}
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setDraftChoice(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            outline
            onClick={() => {
              setDraftChoice(null);
              void addTo(null);
            }}
          >
            {t('workOrders.workItems.newQuote', { quote: quoteWord })}
          </Button>
          <Button
            color="dark"
            onClick={() => {
              const draft = draftChoice;
              setDraftChoice(null);
              void addTo(draft);
            }}
          >
            {t('workOrders.workItems.addToQuote', { number: draftChoice?.quoteNumber ?? '' })}
          </Button>
        </AlertActions>
      </Alert>
    </div>
  );
}
