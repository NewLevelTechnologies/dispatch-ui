/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CubeIcon } from '@heroicons/react/16/solid';
import { formatCurrency } from '@dispatch/utils';
import { purchaseBillingApi, type Invoice, type UnbilledPurchase } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { Button } from './catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { Field, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Card, CardBody, CardHead, CardSub, CardTitle } from './ui/Card';

const round2 = (n: number) => Math.round(n * 100) / 100;

interface PoGroup {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  lines: UnbilledPurchase[];
}

const byPo = (rows: UnbilledPurchase[]): PoGroup[] => {
  const groups: PoGroup[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.purchaseOrderId === r.purchaseOrderId);
    if (g) g.lines.push(r);
    else groups.push({ purchaseOrderId: r.purchaseOrderId, purchaseOrderNumber: r.purchaseOrderNumber, lines: [r] });
  }
  return groups;
};

/**
 * Parts bought on the job's purchase orders that aren't on an invoice yet
 * (drafts count; void and cancelled invoices don't), one row per PO. "Add to
 * invoice" opens a draft on its From PO tab, starting one when there's no
 * draft. "Dismiss" marks parts that will never be billed (warranty, shop
 * stock), with a reason, for everyone; dismissed parts can be shown and undone.
 */
export function UnbilledPurchasesCard({
  workOrderId,
  draftInvoices,
  onNewInvoice,
}: {
  workOrderId: string;
  /** The job's draft invoices, which parts can be added to. */
  draftInvoices: Invoice[];
  /** Start a draft invoice that opens on the job's purchase-order parts. */
  onNewInvoice: () => void;
}) {
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const invoiceLower = getName('invoice').toLowerCase();
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissing, setDismissing] = useState<PoGroup | null>(null);

  const { data = [] } = useQuery({
    queryKey: ['unbilledPurchases', workOrderId, 'withDismissed'],
    queryFn: () => purchaseBillingApi.getUnbilled(workOrderId, true),
  });
  const open = byPo(data.filter((r) => !r.notBillable?.notBillable));
  const dismissed = data.filter((r) => r.notBillable?.notBillable);

  const setBilling = useMutation({
    mutationFn: async ({ lines, reason }: { lines: UnbilledPurchase[]; reason: string | null }) => {
      for (const l of lines) {
        await purchaseBillingApi.setBilling(l.poLineId, reason ? { notBillable: true, reason } : { notBillable: false });
      }
    },
    onSuccess: (_, { lines, reason }) => {
      queryClient.invalidateQueries({ queryKey: ['unbilledPurchases', workOrderId] });
      setDismissing(null);
      showSuccess(reason ? (lines.length === 1 ? 'Part dismissed' : `${lines.length} parts dismissed`) : 'Part back on the not billed list');
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['unbilledPurchases', workOrderId] });
      showError('Couldn’t change the part', extractApiError(err));
    },
  });

  if (!open.length && !dismissed.length) return null;

  const addTo =
    draftInvoices.length === 1 ? (
      <Button outline size="xs" href={`/invoices/${draftInvoices[0].id}?add=po`}>
        {`Add to ${invoiceLower}`}
      </Button>
    ) : draftInvoices.length > 1 ? (
      <Dropdown>
        <DropdownButton outline size="xs">{`Add to ${invoiceLower}`}</DropdownButton>
        <DropdownMenu anchor="bottom end">
          {draftInvoices.map((i) => (
            <DropdownItem key={i.id} href={`/invoices/${i.id}?add=po`}>
              <DropdownLabel>{`${i.invoiceNumber} · draft`}</DropdownLabel>
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
    ) : (
      <Button outline size="xs" onClick={onNewInvoice}>
        {`Add to new ${invoiceLower}`}
      </Button>
    );

  return (
    <Card>
      <CardHead>
        <CardTitle>Not billed yet</CardTitle>
        <CardSub>{open.reduce((n, g) => n + g.lines.length, 0)}</CardSub>
        <span className="grow" />
        {dismissed.length > 0 && (
          <Button plain size="xs" onClick={() => setShowDismissed((s) => !s)}>
            {showDismissed ? `Hide dismissed (${dismissed.length})` : `Show dismissed (${dismissed.length})`}
          </Button>
        )}
      </CardHead>
      <CardBody flush>
        {open.map((g) => {
          const cost = round2(g.lines.reduce((s, l) => s + l.unbilledCost, 0));
          const n = g.lines.length;
          return (
            <div key={g.purchaseOrderId} className="flex flex-wrap items-center gap-3 border-b border-border-soft px-4 py-2.5 last:border-b-0">
              <CubeIcon className="size-4 shrink-0 text-warning-fg" aria-hidden />
              <div className="min-w-[220px] flex-1">
                <div className="text-[12.5px] text-fg-strong">
                  {n === 1 ? '1 part' : `${n} parts`} bought on{' '}
                  <Link to={`/purchase-orders/${g.purchaseOrderId}`} className="font-mono text-fg-accent hover:underline">
                    {g.purchaseOrderNumber}
                  </Link>{' '}
                  {n === 1 ? 'isn’t' : 'aren’t'} on any {invoiceLower}
                </div>
                <div className="text-[11.5px] tabular-nums text-fg-muted">
                  {g.lines.map((l) => l.description).join(', ')} · {formatCurrency(cost)} cost
                </div>
              </div>
              <Button plain size="xs" onClick={() => setDismissing(g)}>
                Dismiss
              </Button>
              {addTo}
            </div>
          );
        })}
        {!open.length && <p className="px-4 py-2.5 text-[12px] text-fg-muted">Every part bought for this job is billed or dismissed.</p>}
        {showDismissed &&
          dismissed.map((l) => (
            <div key={l.poLineId} className="flex flex-wrap items-center gap-3 border-t border-border-soft bg-bg-elev-2 px-4 py-2">
              <div className="min-w-[220px] flex-1">
                <div className="text-[12.5px] text-fg">
                  {l.description} <span className="font-mono text-[11px] text-fg-muted">{l.purchaseOrderNumber}</span>
                </div>
                <div className="text-[11.5px] text-fg-muted">
                  Not billable{l.notBillable?.reason ? `: ${l.notBillable.reason}` : ''}
                  {l.notBillable?.markedByName ? ` · ${l.notBillable.markedByName}` : ''}
                </div>
              </div>
              <Button
                plain
                size="xs"
                disabled={setBilling.isPending}
                aria-label={`Undo dismiss ${l.description}`}
                onClick={() => setBilling.mutate({ lines: [l], reason: null })}
              >
                Undo
              </Button>
            </div>
          ))}
      </CardBody>
      <Dialog open={!!dismissing} onClose={() => setDismissing(null)} size="md">
        {dismissing && (
          <DismissForm
            group={dismissing}
            invoiceLower={invoiceLower}
            busy={setBilling.isPending}
            onCancel={() => setDismissing(null)}
            onDismiss={(reason) => setBilling.mutate({ lines: dismissing.lines, reason })}
          />
        )}
      </Dialog>
    </Card>
  );
}

function DismissForm({
  group,
  invoiceLower,
  busy,
  onCancel,
  onDismiss,
}: {
  group: PoGroup;
  invoiceLower: string;
  busy: boolean;
  onCancel: () => void;
  onDismiss: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim() && !busy) onDismiss(reason.trim());
  };
  const n = group.lines.length;
  return (
    <form onSubmit={submit}>
      <DialogTitle>{`Dismiss ${n === 1 ? 'this part' : `${n} parts`} from ${group.purchaseOrderNumber}?`}</DialogTitle>
      <DialogDescription>
        {`For parts that will never go on an ${invoiceLower}, like warranty parts or shop stock. It applies for everyone and the reason is kept. You can undo it.`}
      </DialogDescription>
      <DialogBody>
        <p className="mb-2.5 text-[12px] text-fg-muted">{group.lines.map((l) => l.description).join(', ')}</p>
        <Field>
          <Label>Reason</Label>
          <Input autoFocus value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Warranty part" />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!reason.trim() || busy}>
          Dismiss
        </Button>
      </DialogActions>
    </form>
  );
}
