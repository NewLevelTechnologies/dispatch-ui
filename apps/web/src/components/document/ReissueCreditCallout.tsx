/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). */
import { useState } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency } from '@dispatch/utils';
import { InvoiceStatus, invoicesApi, paymentsApi, type Invoice } from '../../api/setup';
import { showError, showSuccess } from '../../lib/toast';
import { Button } from '../catalyst/button';
import { Callout } from '../ui/Callout';
import { documentErrorMessage, refreshDocumentLists } from './useDocumentEditor';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * On a reissue's corrected copy: the payments the void returned to the
 * customer's credit, and the way to put them on this invoice. Offered once
 * the copy is sent. Applying credit to a draft it fully covers marks the
 * draft paid and locks it before it's been corrected, so a draft only says
 * the credit is waiting.
 */
export function ReissueCreditCallout({ invoice, billToName, entity }: { invoice: Invoice; billToName: string; entity: string }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: original } = useQuery({
    queryKey: ['invoice', invoice.reissuedFromInvoiceId],
    queryFn: () => invoicesApi.getById(invoice.reissuedFromInvoiceId!),
    enabled: !!invoice.reissuedFromInvoiceId,
  });
  const returned = (original?.payments ?? []).filter((p) => p.reversedAt);
  // What's still unapplied on each: some of it may have gone elsewhere since.
  const payments = useQueries({
    queries: returned.map((p) => ({ queryKey: ['payment', p.id], queryFn: () => paymentsApi.getById(p.id) })),
  });
  const credits = payments
    .map((q) => q.data)
    .filter((p): p is NonNullable<typeof p> => !!p && p.status !== 'VOID' && p.unappliedAmount > 0);
  const available = round2(credits.reduce((s, p) => s + p.unappliedAmount, 0));
  if (!original || available <= 0) return null;

  const draft = invoice.status === InvoiceStatus.DRAFT;
  const open = invoice.status === InvoiceStatus.SENT || invoice.status === InvoiceStatus.OVERDUE;
  if (!draft && !(open && invoice.balanceDue > 0)) return null;
  const toApply = round2(Math.min(available, invoice.balanceDue));

  const apply = async () => {
    setBusy(true);
    let remaining = toApply;
    let applied = 0;
    try {
      for (const p of credits) {
        if (remaining <= 0) break;
        const amount = round2(Math.min(p.unappliedAmount, remaining));
        await paymentsApi.apply(p.id, [{ invoiceId: invoice.id, amountApplied: amount }]);
        remaining = round2(remaining - amount);
        applied = round2(applied + amount);
      }
      showSuccess(`${formatCurrency(applied)} credit applied to ${invoice.invoiceNumber}`);
    } catch (err) {
      showError(
        applied > 0 ? `Only ${formatCurrency(applied)} of the credit was applied` : 'Couldn’t apply the credit',
        documentErrorMessage(err, entity),
      );
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ['invoice', invoice.id] });
      for (const p of credits) queryClient.invalidateQueries({ queryKey: ['payment', p.id] });
      refreshDocumentLists(queryClient);
    }
  };

  return draft ? (
    <Callout kind="neutral" className="mb-2.5">
      {formatCurrency(available)} from {original.invoiceNumber}’s payments is on {billToName}’s credit. Apply it once this{' '}
      {entity} is sent: applied to a draft it fully covers, it would mark the draft paid and lock it.
    </Callout>
  ) : (
    <Callout
      kind="success"
      className="mb-2.5"
      action={
        <Button color="dark/zinc" size="xs" disabled={busy} onClick={() => void apply()}>
          {`Apply ${formatCurrency(toApply)} credit`}
        </Button>
      }
    >
      {original.invoiceNumber} was voided. {formatCurrency(available)} from its payments is back on {billToName}’s credit and can go
      on this {entity}.
    </Callout>
  );
}
