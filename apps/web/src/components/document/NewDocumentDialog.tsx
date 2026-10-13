/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { invoicesApi, quotesApi, type CustomerSearchResult } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError } from '../../lib/toast';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';
import { Description, Field, Label } from '../catalyst/fieldset';
import CustomerPicker from '../CustomerPicker';
import { localDate } from './billingModel';
import { documentErrorMessage, refreshDocumentLists } from './useDocumentEditor';

export type NewDocumentKind = 'quote' | 'invoice';

/**
 * Starts an empty draft quote or invoice on a work order and opens it, where
 * the lines are added. Asks only what the server needs up front: who it's
 * billed to (the work order's customer unless it goes to a payer) and the
 * two dates. Location and job come from the work order.
 */
export function NewDocumentDialog({
  kind,
  onClose,
  workOrderId,
  customer,
  openOnPurchases,
}: {
  kind: NewDocumentKind | null;
  onClose: () => void;
  /** The job it's for; omitted when started from the Quotes or Invoices list. */
  workOrderId?: string;
  /** The job's customer, prefilled as the bill-to. */
  customer?: { id: string; name: string };
  /** Open the new draft with its add-line panel on the job's purchase-order parts. */
  openOnPurchases?: boolean;
}) {
  return (
    <Dialog open={kind != null} onClose={onClose} size="lg">
      {kind && (
        <NewDocumentForm kind={kind} onClose={onClose} workOrderId={workOrderId} customer={customer} openOnPurchases={openOnPurchases} />
      )}
    </Dialog>
  );
}

function NewDocumentForm({
  kind,
  onClose,
  workOrderId,
  customer,
  openOnPurchases,
}: {
  kind: NewDocumentKind;
  onClose: () => void;
  workOrderId?: string;
  customer?: { id: string; name: string };
  openOnPurchases?: boolean;
}) {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const label = getName(kind);
  const lower = label.toLowerCase();
  const [billTo, setBillTo] = useState<CustomerSearchResult | null>(
    customer?.id ? { id: customer.id, name: customer.name, type: 'STANDARD', category: 'COMMERCIAL' } : null,
  );
  const [heading, setHeading] = useState('');
  const [date, setDate] = useState(() => localDate());
  const [until, setUntil] = useState(() => localDate(30));
  const [busy, setBusy] = useState(false);
  const ready = !!billTo && !!date && !!until;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    try {
      const doc =
        kind === 'quote'
          ? await quotesApi.create({
              customerId: billTo.id,
              workOrderId,
              ...(heading.trim() ? { title: heading.trim() } : {}),
              quoteDate: date,
              expirationDate: until,
              lineItems: [],
            })
          : await invoicesApi.create({ customerId: billTo.id, workOrderId, invoiceDate: date, dueDate: until, lineItems: [] });
      refreshDocumentLists(queryClient);
      onClose();
      navigate(`${kind === 'quote' ? `/quotes/${doc.id}` : `/invoices/${doc.id}`}${openOnPurchases ? '?add=po' : ''}`);
    } catch (err) {
      showError(`Couldn’t create the ${lower}`, documentErrorMessage(err, lower));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>{`New ${lower}`}</DialogTitle>
      <DialogDescription>
        {workOrderId
          ? `Starts a draft ${lower} for this ${getName('work_order').toLowerCase()}. You add the lines next.`
          : `Starts a draft ${lower} with no ${getName('work_order').toLowerCase()}. You add the lines next.`}
      </DialogDescription>
      <DialogBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_150px]">
          <Field>
            <Label>Bill to</Label>
            <CustomerPicker value={billTo} onChange={setBillTo} ariaLabel="Bill to" />
            {customer && billTo && billTo.id !== customer.id && (
              <Description>{`Not the ${getName('work_order').toLowerCase()}'s ${getName('customer').toLowerCase()}, ${customer.name}.`}</Description>
            )}
          </Field>
          <Field>
            <Label>{`${label} date`}</Label>
            <Input type="date" value={date} required onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field>
            <Label>{kind === 'quote' ? 'Expires' : 'Due'}</Label>
            <Input type="date" value={until} required onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
        {kind === 'quote' && (
          <Field className="mt-3">
            <Label>Title</Label>
            <Input value={heading} maxLength={120} onChange={(e) => setHeading(e.target.value)} placeholder="e.g. Condenser replacement · 3-ton" />
            <Description>Optional. A short description of the work, shown on the quote and in the list.</Description>
          </Field>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!ready || busy}>
          {`Create ${lower}`}
        </Button>
      </DialogActions>
    </form>
  );
}
