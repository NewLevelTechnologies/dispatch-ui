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
}: {
  kind: NewDocumentKind | null;
  onClose: () => void;
  workOrderId: string;
  customer: { id: string; name: string };
}) {
  return (
    <Dialog open={kind != null} onClose={onClose} size="lg">
      {kind && <NewDocumentForm kind={kind} onClose={onClose} workOrderId={workOrderId} customer={customer} />}
    </Dialog>
  );
}

function NewDocumentForm({
  kind,
  onClose,
  workOrderId,
  customer,
}: {
  kind: NewDocumentKind;
  onClose: () => void;
  workOrderId: string;
  customer: { id: string; name: string };
}) {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const label = getName(kind);
  const lower = label.toLowerCase();
  const [billTo, setBillTo] = useState<CustomerSearchResult | null>(
    customer.id ? { id: customer.id, name: customer.name, type: 'STANDARD', category: 'COMMERCIAL' } : null,
  );
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
          ? await quotesApi.create({ customerId: billTo.id, workOrderId, quoteDate: date, expirationDate: until, lineItems: [] })
          : await invoicesApi.create({ customerId: billTo.id, workOrderId, invoiceDate: date, dueDate: until, lineItems: [] });
      refreshDocumentLists(queryClient);
      onClose();
      navigate(kind === 'quote' ? `/quotes/${doc.id}` : `/invoices/${doc.id}`);
    } catch (err) {
      showError(`Couldn’t create the ${lower}`, documentErrorMessage(err, lower));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>{`New ${lower}`}</DialogTitle>
      <DialogDescription>
        Starts a draft {lower} for this {getName('work_order').toLowerCase()}. You add the lines next.
      </DialogDescription>
      <DialogBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_150px]">
          <Field>
            <Label>Bill to</Label>
            <CustomerPicker value={billTo} onChange={setBillTo} ariaLabel="Bill to" />
            {billTo && billTo.id !== customer.id && (
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
