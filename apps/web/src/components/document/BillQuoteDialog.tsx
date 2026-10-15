/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@dispatch/utils';
import { invoicesApi, quotesApi, type CustomerSearchResult, type Quote, type QuoteInvoiceable } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError, showSuccess } from '../../lib/toast';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';
import { Checkbox, CheckboxField } from '../catalyst/checkbox';
import { Description, Field, Label } from '../catalyst/fieldset';
import CustomerPicker from '../CustomerPicker';
import { LoadingState } from '../ui/LoadingState';
import { localDate } from './billingModel';
import { documentErrorMessage, refreshDocumentLists } from './useDocumentEditor';

type BillableQuote = Pick<Quote, 'id' | 'quoteNumber' | 'customerId' | 'customerName'>;

/**
 * "Create invoice" on an accepted quote: what's left on each line, with a
 * quantity to bill now (all of it by default), then a new draft invoice at
 * the quote's prices. Opens the invoice.
 */
export function BillQuoteDialog({ quote, open, onClose }: { quote: BillableQuote; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} size="3xl">
      {open && <BillQuoteForm quote={quote} onClose={onClose} />}
    </Dialog>
  );
}

function BillQuoteForm({ quote, onClose }: { quote: BillableQuote; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['quoteInvoiceable', quote.id],
    queryFn: () => quotesApi.getInvoiceable(quote.id),
  });
  const { getName } = useGlossary();
  const invoiceLower = getName('invoice').toLowerCase();

  return (
    <>
      <DialogTitle>{`Create ${invoiceLower} from ${quote.quoteNumber}`}</DialogTitle>
      <DialogDescription>
        Bill all of what's left, or part of it. The {invoiceLower} starts as a draft at the {getName('quote').toLowerCase()}'s
        prices.
      </DialogDescription>
      {data ? (
        <BillQuoteFields quote={quote} invoiceable={data} onClose={onClose} />
      ) : (
        <>
          <DialogBody>
            {isLoading ? (
              <LoadingState label="Loading what's left to bill…" />
            ) : (
              isError && <p className="text-[12.5px] text-fg-muted">Couldn't load what's left to bill. Try again.</p>
            )}
          </DialogBody>
          <DialogActions>
            <Button plain onClick={onClose}>
              Close
            </Button>
          </DialogActions>
        </>
      )}
    </>
  );
}

function BillQuoteFields({
  quote,
  invoiceable,
  onClose,
}: {
  quote: BillableQuote;
  invoiceable: QuoteInvoiceable;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { getName } = useGlossary();
  const invoiceLower = getName('invoice').toLowerCase();
  // Credit lines go on the invoice as an adjustment, not from here.
  const lines = [...invoiceable.lines].filter((l) => l.unitPrice > 0).sort((a, b) => a.sortOrder - b.sortOrder);
  const credits = invoiceable.lines.length - lines.length;
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.quoteLineId, l.remainingQuantity > 0 ? String(l.remainingQuantity) : ''])),
  );
  const [billTo, setBillTo] = useState<CustomerSearchResult | null>({
    id: quote.customerId,
    name: quote.customerName ?? '',
    type: 'STANDARD',
    category: 'COMMERCIAL',
  });
  const [reprice, setReprice] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => localDate());
  const [dueDate, setDueDate] = useState(() => localDate(30));

  const parsed = lines.map((l) => ({ line: l, value: qty[l.quoteLineId]?.trim() ? Number(qty[l.quoteLineId]) : 0 }));
  const invalid = parsed.some(({ line, value }) => !Number.isFinite(value) || value < 0 || value > line.remainingQuantity);
  const picked = parsed.filter(({ value }) => value > 0);
  const amount = picked.reduce((s, { line, value }) => s + value * line.unitPrice, 0);
  const otherBillTo = !!billTo && billTo.id !== quote.customerId;
  const ready = !invalid && picked.length > 0 && !!billTo && !!invoiceDate && !!dueDate;

  const create = useMutation({
    mutationFn: () =>
      invoicesApi.createFromQuote({
        quoteId: quote.id,
        lines: picked.map(({ line, value }) => ({ quoteLineId: line.quoteLineId, quantity: value })),
        billToCustomerId: otherBillTo ? billTo!.id : undefined,
        invoiceDate,
        dueDate,
        reprice: otherBillTo && reprice,
      }),
    onSuccess: (invoice) => {
      refreshDocumentLists(queryClient);
      queryClient.invalidateQueries({ queryKey: ['quoteInvoiceable', quote.id] });
      showSuccess(`${invoice.invoiceNumber} created`, `A draft from ${quote.quoteNumber}. Review it, then send.`);
      onClose();
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (err) => showError(`Couldn’t create the ${invoiceLower}`, documentErrorMessage(err, invoiceLower, { quote: getName('quote').toLowerCase() })),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !create.isPending) create.mutate();
      }}
    >
      <DialogBody>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-fg-muted">
              <th className="py-1.5 pr-2 font-medium">Line</th>
              <th className="px-2 py-1.5 text-right font-medium">Quoted</th>
              <th className="px-2 py-1.5 text-right font-medium">Invoiced</th>
              <th className="px-2 py-1.5 text-right font-medium">Bill now</th>
              <th className="py-1.5 pl-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {parsed.map(({ line, value }) => {
              const done = line.remainingQuantity <= 0;
              return (
                <tr key={line.quoteLineId} className="border-b border-border-soft">
                  <td className={done ? 'py-1.5 pr-2 text-fg-muted' : 'py-1.5 pr-2 text-fg-strong'}>
                    {line.description}
                    <div className="text-[11px] text-fg-muted">
                      {formatCurrency(line.unitPrice)}
                      {line.unit ? ` / ${line.unit}` : ''}
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-fg-muted">{line.invoicedQuantity}</td>
                  <td className="w-[96px] px-2 py-1.5">
                    {done ? (
                      <span className="block text-right text-fg-muted">All billed</span>
                    ) : (
                      <Input
                        size="xs"
                        inputMode="decimal"
                        aria-label={`Bill now: ${line.description}`}
                        value={qty[line.quoteLineId]}
                        invalid={!Number.isFinite(value) || value < 0 || value > line.remainingQuantity}
                        onChange={(e) => setQty((q) => ({ ...q, [line.quoteLineId]: e.target.value }))}
                        className="[&_input]:text-right"
                      />
                    )}
                  </td>
                  <td className="py-1.5 pl-2 text-right tabular-nums text-fg-strong">
                    {value > 0 && Number.isFinite(value) ? formatCurrency(value * line.unitPrice) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-1.5 flex items-baseline justify-between text-[12px]">
          <span className="text-fg-muted">
            {invalid
              ? 'A quantity is more than what’s left on its line.'
              : credits > 0
                ? `${credits} credit line${credits === 1 ? '' : 's'} not shown. Add credits to the ${invoiceLower} as an adjustment.`
                : 'Before tax and any discounts on the quote.'}
          </span>
          <span className="font-semibold tabular-nums text-fg-strong">{formatCurrency(amount)}</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_150px]">
          <Field>
            <Label>Bill to</Label>
            <CustomerPicker value={billTo} onChange={setBillTo} ariaLabel="Bill to" />
          </Field>
          <Field>
            <Label>{`${getName('invoice')} date`}</Label>
            <Input type="date" value={invoiceDate} required onChange={(e) => setInvoiceDate(e.target.value)} />
          </Field>
          <Field>
            <Label>Due</Label>
            <Input type="date" value={dueDate} required onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>
        {otherBillTo && (
          <CheckboxField className="mt-3">
            <Checkbox checked={reprice} onChange={setReprice} />
            <Label>{`Reprice under ${billTo!.name}'s rate plan`}</Label>
            <Description>Prices typed on the {getName('quote').toLowerCase()} stay as they are.</Description>
          </CheckboxField>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!ready || create.isPending}>
          {`Create ${invoiceLower}`}
        </Button>
      </DialogActions>
    </form>
  );
}
