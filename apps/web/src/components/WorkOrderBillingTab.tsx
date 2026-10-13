/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardDocumentListIcon, DocumentTextIcon, PlusIcon } from '@heroicons/react/16/solid';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { invoicesApi, InvoiceStatus, quotesApi, QuoteStatus, type Invoice, type Quote } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, showSuccess } from '../lib/toast';
import { Button } from './catalyst/button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from './ui/Card';
import { LoadingState } from './ui/LoadingState';
import { Pill, Tag } from './ui/Pill';
import PaymentDialog from './PaymentDialog';
import { BillQuoteDialog } from './document/BillQuoteDialog';
import { NewDocumentDialog, type NewDocumentKind } from './document/NewDocumentDialog';
import { billingStats, buildBillingTree, invoicedPercent } from './document/billingModel';
import { formatDocDate } from './document/documentModel';
import { documentErrorMessage, refreshDocumentLists } from './document/useDocumentEditor';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const QUOTE_TONE: Record<QuoteStatus, Tone> = {
  [QuoteStatus.DRAFT]: 'neutral',
  [QuoteStatus.SENT]: 'info',
  [QuoteStatus.ACCEPTED]: 'success',
  [QuoteStatus.DECLINED]: 'danger',
  [QuoteStatus.EXPIRED]: 'warning',
};

const INVOICE_TONE: Record<InvoiceStatus, Tone> = {
  [InvoiceStatus.DRAFT]: 'neutral',
  [InvoiceStatus.SENT]: 'info',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.OVERDUE]: 'danger',
  [InvoiceStatus.CANCELLED]: 'neutral',
  [InvoiceStatus.VOID]: 'neutral',
};

const OPEN_INVOICE: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.OVERDUE];
const withdrawn = (i: Invoice) => i.status === InvoiceStatus.VOID || i.status === InvoiceStatus.CANCELLED;
const lineCount = (n: number) => `${n} line${n === 1 ? '' : 's'}`;
const day = (v: string | null | undefined) => formatDocDate(v, false) ?? '—';

/**
 * A work order's quotes and invoices together. The work order owns no money:
 * every figure is the documents' own. Each invoice sits under the quote it
 * was billed from, a voided invoice next to its correction.
 */
export default function WorkOrderBillingTab({
  workOrderId,
  workOrderNumber,
  customer,
}: {
  workOrderId: string;
  workOrderNumber: string;
  customer: { id: string; name: string };
}) {
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const quoteLabel = getName('quote');
  const invoiceLabel = getName('invoice');

  const quotesQuery = useQuery({
    queryKey: ['workOrderQuotes', workOrderId],
    queryFn: () => quotesApi.getByWorkOrder(workOrderId),
  });
  const invoicesQuery = useQuery({
    queryKey: ['workOrderInvoices', workOrderId],
    queryFn: () => invoicesApi.getByWorkOrder(workOrderId),
  });
  const quotes = quotesQuery.data ?? [];
  const invoices = invoicesQuery.data ?? [];
  const accepted = quotes.filter((q) => q.status === QuoteStatus.ACCEPTED);
  const invoiceable = useQueries({
    queries: accepted.map((q) => ({
      queryKey: ['quoteInvoiceable', q.id],
      queryFn: () => quotesApi.getInvoiceable(q.id),
    })),
  });
  const percentOf = new Map<string, number | null>();
  accepted.forEach((q, i) => {
    const data = invoiceable[i]?.data;
    if (data) percentOf.set(q.id, invoicedPercent(data));
  });

  const [creating, setCreating] = useState<NewDocumentKind | null>(null);
  const [billing, setBilling] = useState<Quote | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);

  const send = useMutation({
    mutationFn: async (doc: { kind: 'quote'; quote: Quote } | { kind: 'invoice'; invoice: Invoice }) =>
      doc.kind === 'quote' ? quotesApi.send(doc.quote.id) : invoicesApi.send(doc.invoice.id),
    onSuccess: (res, doc) => {
      refreshDocumentLists(queryClient);
      queryClient.invalidateQueries({ queryKey: doc.kind === 'quote' ? ['quote', doc.quote.id] : ['invoice', doc.invoice.id] });
      const num = doc.kind === 'quote' ? doc.quote.quoteNumber : doc.invoice.invoiceNumber;
      showSuccess(`${num} sent`, res.lastSentToEmails ? `To ${res.lastSentToEmails}` : undefined);
    },
    onError: (err, doc) => {
      const entity = (doc.kind === 'quote' ? quoteLabel : invoiceLabel).toLowerCase();
      showError(`Couldn’t send this ${entity}`, documentErrorMessage(err, entity));
    },
  });

  if (quotesQuery.isLoading || invoicesQuery.isLoading) {
    return (
      <Card>
        <CardBody flush>
          <LoadingState label={`Loading ${getName('quote', true).toLowerCase()} and ${getName('invoice', true).toLowerCase()}…`} />
        </CardBody>
      </Card>
    );
  }

  const dialogs = (
    <>
      <NewDocumentDialog kind={creating} onClose={() => setCreating(null)} workOrderId={workOrderId} customer={customer} />
      {billing && <BillQuoteDialog quote={billing} open onClose={() => setBilling(null)} />}
      <PaymentDialog
        open={!!paying}
        onClose={() => setPaying(null)}
        workOrderId={workOrderId}
        workOrderNumber={workOrderNumber}
        customerName={customer.name}
        openInvoices={invoices.filter((i) => OPEN_INVOICE.includes(i.status) && i.balanceDue > 0)}
        lockedInvoice={paying ?? undefined}
      />
    </>
  );
  const newButtons = (
    <div className="flex gap-1.5">
      <Button outline size="xs" onClick={() => setCreating('quote')}>
        <PlusIcon />
        {`New ${quoteLabel.toLowerCase()}`}
      </Button>
      <Button outline size="xs" onClick={() => setCreating('invoice')}>
        <PlusIcon />
        {`New ${invoiceLabel.toLowerCase()}`}
      </Button>
    </div>
  );

  if (quotesQuery.isError || invoicesQuery.isError) {
    return (
      <Card>
        <CardBody>
          <p className="text-[12.5px] text-fg-muted">
            Couldn’t load the {getName('quote', true).toLowerCase()} and {getName('invoice', true).toLowerCase()}. Try again.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (quotes.length === 0 && invoices.length === 0) {
    return (
      <Card>
        <div className="px-5 py-9 text-center">
          <div className="text-[14px] font-semibold text-fg-strong">
            No {getName('quote', true).toLowerCase()} or {getName('invoice', true).toLowerCase()} yet
          </div>
          <div className="mt-1 text-[12.5px] text-fg-muted">
            Quote the work first, or invoice directly for a simple repair.
          </div>
          <div className="mt-3.5 flex justify-center">{newButtons}</div>
        </div>
        {dialogs}
      </Card>
    );
  }

  const stats = billingStats(quotes, invoices);
  const partlyBilled = accepted.some((q) => {
    const p = percentOf.get(q.id);
    return p != null && p < 100;
  });
  const tree = buildBillingTree(quotes, invoices);
  const docCount = quotes.length + invoices.length;

  const quoteAction = (q: Quote) => {
    const pct = percentOf.get(q.id);
    if (q.status === QuoteStatus.ACCEPTED && pct != null && pct < 100)
      return { label: `Create ${invoiceLabel.toLowerCase()}`, run: () => setBilling(q) };
    if (q.status === QuoteStatus.DRAFT || q.status === QuoteStatus.SENT)
      return {
        label: q.status === QuoteStatus.SENT ? 'Resend' : q.firstSentAt ? `Re-send · Rev ${q.revision ?? 1}` : 'Send',
        run: () => send.mutate({ kind: 'quote', quote: q }),
      };
    return null;
  };
  const invoiceAction = (i: Invoice) => {
    if (i.status === InvoiceStatus.DRAFT) return { label: 'Send', run: () => send.mutate({ kind: 'invoice', invoice: i }) };
    if (OPEN_INVOICE.includes(i.status) && i.balanceDue > 0) return { label: 'Take payment', run: () => setPaying(i) };
    return null;
  };

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="grid grid-cols-2 lg:grid-cols-4">
          <Stat
            label={`Accepted ${getName('quote', true).toLowerCase()}`}
            value={stats.accepted}
            sub={stats.awaiting > 0 ? `+ ${formatCurrency(stats.awaiting)} awaiting ${getName('customer').toLowerCase()}` : null}
          />
          <Stat
            label="Invoiced"
            value={stats.invoiced}
            sub={
              stats.inDraft > 0
                ? `+ ${formatCurrency(stats.inDraft)} in draft`
                : partlyBilled
                  ? `${getName('quote', true)} not fully invoiced`
                  : null
            }
            warn={stats.inDraft === 0 && partlyBilled}
          />
          <Stat label="Collected" value={stats.collected} />
          <Stat label="Balance due" value={stats.balance} strong />
        </div>
      </Card>

      <Card>
        <CardHead>
          <CardTitle>Documents</CardTitle>
          <CardSub>{docCount}</CardSub>
          <span className="grow" />
          {newButtons}
        </CardHead>
        <CardBody flush>
          {tree.map((node) =>
            node.kind === 'quote' ? (
              <div key={node.quote.id}>
                <QuoteRow quote={node.quote} percent={percentOf.get(node.quote.id) ?? null} action={quoteAction(node.quote)} busy={send.isPending} />
                {node.invoices.map((inv, i) => (
                  <InvoiceRow
                    key={inv.id}
                    invoice={inv}
                    child={i === node.invoices.length - 1 ? 'last' : 'mid'}
                    action={invoiceAction(inv)}
                    busy={send.isPending}
                  />
                ))}
              </div>
            ) : (
              <InvoiceRow key={node.invoice.id} invoice={node.invoice} action={invoiceAction(node.invoice)} busy={send.isPending} />
            ),
          )}
        </CardBody>
      </Card>
      {dialogs}
    </div>
  );
}

function Stat({ label, value, sub, warn, strong }: { label: string; value: number; sub?: string | null; warn?: boolean; strong?: boolean }) {
  return (
    <div className={clsx('-mb-px border-b border-r border-border-soft px-4 py-3', strong && 'bg-bg-elev-2')}>
      <div className="label-tiny mb-0.5">{label}</div>
      <div className="text-[18px] font-bold tracking-tight text-fg-strong tabular-nums">{formatCurrency(value)}</div>
      {sub && (
        <div className={clsx('mt-0.5 text-[11.5px] tabular-nums', warn ? 'font-semibold text-warning-fg' : 'text-fg-muted')}>{sub}</div>
      )}
    </div>
  );
}

interface RowAction {
  label: string;
  run: () => void;
}

function DocRow({
  icon,
  href,
  number,
  struck,
  badges,
  meta,
  amount,
  amountSub,
  action,
  busy,
  child,
}: {
  icon: ReactNode;
  href: string;
  number: string;
  struck: boolean;
  badges: ReactNode;
  meta: ReactNode;
  amount: number;
  amountSub: ReactNode;
  action: RowAction | null;
  busy: boolean;
  child?: 'mid' | 'last';
}) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center gap-3 border-b border-border-soft',
        child ? 'py-2 pr-4' : 'px-4 py-3',
        struck && 'opacity-60',
      )}
    >
      {child && (
        <span aria-hidden="true" className="relative -my-2 w-11 shrink-0 self-stretch">
          <span className={clsx('absolute left-[30px] top-0 border-l-[1.5px] border-border-strong', child === 'last' ? 'bottom-1/2' : 'bottom-0')} />
          <span className="absolute left-[30px] top-1/2 w-2.5 border-t-[1.5px] border-border-strong" />
        </span>
      )}
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-bg-active text-fg-muted [&>svg]:size-3.5">{icon}</span>
      <div className="flex min-w-[200px] grow flex-col">
        <span className="flex flex-wrap items-center gap-1.5">
          <Link to={href} className={clsx('id-mono text-[12.5px] font-bold text-fg-accent hover:underline', struck && 'line-through')}>
            {number}
          </Link>
          {badges}
        </span>
        <span className="mt-0.5 text-[11.5px] text-fg-muted">{meta}</span>
      </div>
      <div className="flex min-w-[96px] shrink-0 flex-col items-end">
        <span className={clsx('text-[13.5px] font-bold text-fg-strong tabular-nums', struck && 'line-through')}>{formatCurrency(amount)}</span>
        {amountSub}
      </div>
      <div className="flex min-w-[128px] shrink-0 justify-end">
        {action ? (
          <Button outline size="xs" disabled={busy} onClick={action.run}>
            {action.label}
          </Button>
        ) : (
          <Button plain size="xs" href={href}>
            View
          </Button>
        )}
      </div>
    </div>
  );
}

function QuoteRow({ quote, percent, action, busy }: { quote: Quote; percent: number | null; action: RowAction | null; busy: boolean }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const beingUpdated = quote.status === QuoteStatus.DRAFT && !!quote.firstSentAt;
  const rev = quote.revision ?? 1;
  const meta = (() => {
    switch (quote.status) {
      case QuoteStatus.ACCEPTED:
        return `Accepted ${day(quote.decidedAt)} ${quote.acceptedByUserId ? '· recorded by the office' : `by the ${getName('customer').toLowerCase()}`}`;
      case QuoteStatus.DECLINED:
        return `Declined ${day(quote.decidedAt)}`;
      case QuoteStatus.EXPIRED:
        return `Expired ${day(quote.expirationDate)}`;
      case QuoteStatus.SENT:
        return `Sent ${day(quote.lastSentAt)} · ${quote.firstViewedAt ? `viewed ${day(quote.firstViewedAt)}` : 'not viewed'} · expires ${day(quote.expirationDate)}`;
      default:
        return beingUpdated
          ? `Rev ${rev} draft · the ${getName('customer').toLowerCase()}'s link is paused until you re-send`
          : `Not sent · expires ${day(quote.expirationDate)}`;
    }
  })();
  return (
    <DocRow
      icon={<ClipboardDocumentListIcon />}
      href={`/quotes/${quote.id}`}
      number={quote.quoteNumber}
      struck={false}
      badges={
        <>
          <Pill tone={beingUpdated ? 'warning' : QUOTE_TONE[quote.status]} dot>
            {beingUpdated ? 'Being updated' : t(`quotes.status.${quote.status.toLowerCase()}`)}
          </Pill>
          {quote.revision != null && <Tag word>Rev {rev}</Tag>}
          <span className="text-[11px] text-fg-muted">{lineCount(quote.lineItems.length)}</span>
        </>
      }
      meta={meta}
      amount={quote.totalAmount}
      amountSub={
        quote.status === QuoteStatus.ACCEPTED &&
        percent != null && (
          <span className={clsx('text-[11.5px] tabular-nums', percent < 100 ? 'text-warning-fg' : 'text-fg-muted')}>
            {percent === 100 ? 'Fully invoiced' : `${percent}% invoiced`}
          </span>
        )
      }
      action={action}
      busy={busy}
    />
  );
}

function InvoiceRow({
  invoice,
  child,
  action,
  busy,
}: {
  invoice: Invoice;
  child?: 'mid' | 'last';
  action: RowAction | null;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const struck = withdrawn(invoice);
  const meta = (() => {
    switch (invoice.status) {
      case InvoiceStatus.VOID:
        return invoice.reissuedAsInvoiceNumber ? `Voided · reissued as ${invoice.reissuedAsInvoiceNumber}` : 'Voided';
      case InvoiceStatus.CANCELLED:
        return 'Cancelled before it was sent';
      case InvoiceStatus.DRAFT:
        return invoice.reissuedFromInvoiceNumber
          ? `Reissue of ${invoice.reissuedFromInvoiceNumber} · not sent`
          : `Not sent · due ${day(invoice.dueDate)}`;
      case InvoiceStatus.PAID:
        return `Sent ${day(invoice.lastSentAt ?? invoice.invoiceDate)} · paid in full`;
      default:
        return `Sent ${day(invoice.lastSentAt ?? invoice.invoiceDate)} · due ${day(invoice.dueDate)}${
          invoice.amountPaid > 0 ? ` · ${formatCurrency(invoice.amountPaid)} paid` : ''
        }`;
    }
  })();
  return (
    <DocRow
      icon={<DocumentTextIcon />}
      href={`/invoices/${invoice.id}`}
      number={invoice.invoiceNumber}
      struck={struck}
      child={child}
      badges={
        <>
          <Pill tone={INVOICE_TONE[invoice.status]} dot>
            {t(`invoices.status.${invoice.status.toLowerCase()}`)}
          </Pill>
          <span className="text-[11px] text-fg-muted">{lineCount(invoice.lineItems.length)}</span>
        </>
      }
      meta={meta}
      amount={invoice.totalAmount}
      amountSub={
        OPEN_INVOICE.includes(invoice.status) &&
        invoice.balanceDue > 0 && <span className="text-[11.5px] text-fg-muted tabular-nums">{formatCurrency(invoice.balanceDue)} due</span>
      }
      action={action}
      busy={busy}
    />
  );
}
