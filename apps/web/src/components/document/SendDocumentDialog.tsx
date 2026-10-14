/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, validateEmail } from '@dispatch/utils';
import {
  contactApi,
  customerApi,
  invoicesApi,
  InvoiceStatus,
  quotesApi,
  QuoteStatus,
  taxApi,
  type Invoice,
  type Quote,
  type SendResponse,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError, showSuccess } from '../../lib/toast';
import { Button } from '../catalyst/button';
import { Checkbox } from '../catalyst/checkbox';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Input } from '../catalyst/input';
import { Callout } from '../ui/Callout';
import { documentErrorMessage, refreshDocumentLists } from './useDocumentEditor';

export type SendTarget = { kind: 'invoice'; doc: Invoice } | { kind: 'quote'; doc: Quote };

interface Recipient {
  key: string;
  name: string;
  role: string;
  email: string;
  on: boolean;
}

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const longDate = (day: string) => {
  const [y, m, dd] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Sends (or re-sends) a quote or invoice: who it goes to, and its due date
 * or expiry. A first send dates it: issued today, due by the bill-to's
 * terms or expiring after the company's quote validity, and either can be
 * changed here for this one document. Once out, its dates stay; a wrong due
 * date on a sent invoice is fixed by void and reissue.
 */
export function SendDocumentDialog({
  target,
  onClose,
  onSent,
}: {
  target: SendTarget | null;
  onClose: () => void;
  onSent?: (res: SendResponse) => void;
}) {
  return (
    <Dialog open={target != null} onClose={onClose} size="xl" className="sm:!max-w-[560px]">
      {target && <SendForm key={target.doc.id} target={target} onClose={onClose} onSent={onSent} />}
    </Dialog>
  );
}

function SendForm({ target, onClose, onSent }: { target: SendTarget; onClose: () => void; onSent?: (res: SendResponse) => void }) {
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const { kind, doc } = target;
  const isQuote = kind === 'quote';
  const noun = getName(kind).toLowerCase();
  const number = isQuote ? (doc as Quote).quoteNumber : (doc as Invoice).invoiceNumber;
  const draft = doc.status === (isQuote ? QuoteStatus.DRAFT : InvoiceStatus.DRAFT);
  // A draft quote that went out before is a revision: the customer's link moves to it.
  const revision = isQuote && draft && !!(doc as Quote).firstSentAt ? ((doc as Quote).revision ?? 1) : null;
  const today = new Date();

  const { data: customer } = useQuery({ queryKey: ['customers', doc.customerId], queryFn: () => customerApi.getById(doc.customerId) });
  const { data: contacts = [] } = useQuery({
    queryKey: ['customer-contacts', doc.customerId],
    queryFn: () => contactApi.getCustomerContacts(doc.customerId),
  });
  const { data: settings } = useQuery({ queryKey: ['pricing-settings'], queryFn: () => taxApi.getPricingSettings(), enabled: isQuote });

  // What the date will be unless changed: the terms or validity from today, or a revision's own expiry while it's still ahead.
  const termsDays = customer?.paymentTermsDays ?? null;
  const validity = settings?.quoteValidityDays ?? 30;
  const existing = isQuote ? (doc as Quote).expirationDate : (doc as Invoice).dueDate;
  const defaultDay = draft
    ? isQuote && existing && existing.slice(0, 10) >= isoDay(today)
      ? existing.slice(0, 10)
      : isoDay(addDays(today, isQuote ? validity : (termsDays ?? 0)))
    : null;
  const defaultNote = isQuote
    ? revision && existing && existing.slice(0, 10) >= isoDay(today)
      ? 'Kept from the earlier revision'
      : `${validity} days · company default`
    : termsDays == null
      ? 'From the terms'
      : termsDays === 0
        ? 'Due on receipt'
        : `Net ${termsDays}`;

  const [day, setDay] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const chosen = day ?? defaultDay;
  const overridden = draft && day != null && day !== defaultDay;

  // The account's own address first (what the server sends to by default), then its contacts.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState<Recipient[]>([]);
  const [adding, setAdding] = useState('');
  const base: Recipient[] = [
    ...(customer?.email
      ? [{ key: 'account', name: customer.name, role: customer.type === 'BILLING_ONLY' ? 'Payer' : 'Customer', email: customer.email, on: true }]
      : []),
    ...contacts
      .filter((c) => c.email)
      .map((c) => ({ key: c.id, name: c.name, role: c.role || 'Contact', email: c.email!, on: !customer?.email && !!c.isPrimary })),
  ];
  const recipients = [...base, ...extra].map((r) => ({ ...r, on: picked[r.key] ?? r.on }));
  const to = recipients.filter((r) => r.on).map((r) => r.email);
  const addOk = validateEmail(adding.trim());

  const nteOver = !isQuote && ((doc as Invoice).warnings ?? []).some((w) => w.code === 'NTE_EXCEEDED');
  const [busy, setBusy] = useState(false);

  const addRecipient = (e: FormEvent) => {
    e.preventDefault();
    if (!addOk) return;
    const email = adding.trim();
    const key = `extra-${email}`;
    setExtra((xs) => (xs.some((x) => x.key === key) ? xs : [...xs, { key, name: email, role: 'This send only', email, on: true }]));
    setPicked((p) => ({ ...p, [key]: true }));
    setAdding('');
  };

  const send = async () => {
    if (busy || !to.length) return;
    setBusy(true);
    try {
      const override = overridden ? (chosen ?? undefined) : undefined;
      const res = isQuote ? await quotesApi.send(doc.id, to, override) : await invoicesApi.send(doc.id, to, override);
      queryClient.invalidateQueries({ queryKey: [kind, doc.id] });
      refreshDocumentLists(queryClient);
      showSuccess(`${number} sent`, res.lastSentToEmails ? `To ${res.lastSentToEmails}` : undefined);
      onSent?.(res);
      onClose();
    } catch (err) {
      showError(`Couldn’t send this ${noun}`, documentErrorMessage(err, noun));
      setBusy(false);
    }
  };

  const dateLabel = isQuote ? 'Expires' : 'Due';
  const dueOnReceipt = !isQuote && !overridden && termsDays === 0;

  return (
    <>
      <DialogTitle>{draft ? (revision ? `Send ${number} · Rev ${revision}` : `Send ${noun} ${number}`) : `Resend ${number}`}</DialogTitle>
      {revision && revision > 1 && (
        <DialogDescription>
          {`Rev ${revision} replaces Rev ${revision - 1}. The customer’s link will show this revision, and Rev ${revision - 1} can no longer be approved.`}
        </DialogDescription>
      )}
      <DialogBody className="!mt-3 flex flex-col gap-4">
        {nteOver && (
          <Callout kind="warning">{`Over the job’s not-to-exceed. Make sure ${customer?.name ?? 'the customer'} approved the extra before sending.`}</Callout>
        )}

        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Send to</div>
          <div className="rounded-md border border-border">
            {recipients.map((r, i) => (
              <label key={r.key} className={clsx('flex cursor-pointer items-center gap-2.5 px-3 py-2', i > 0 && 'border-t border-border-soft')}>
                <Checkbox checked={r.on} onChange={(on) => setPicked((p) => ({ ...p, [r.key]: on }))} aria-label={`Send to ${r.email}`} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[12.5px] font-semibold text-fg-strong">
                    {r.name} <span className="font-normal text-fg-muted">· {r.role}</span>
                  </span>
                  <span className="truncate text-[11.5px] text-fg-muted">{r.email}</span>
                </span>
                <span className="text-[11px] text-fg-muted">Email</span>
              </label>
            ))}
            {!recipients.length && customer && (
              <p className="px-3 py-2 text-[12px] text-fg-muted">{`${customer.name} has no email on file. Add one below.`}</p>
            )}
            <form onSubmit={addRecipient} className="flex items-center gap-2 border-t border-border-soft px-3 py-2" aria-label="Add recipient">
              <Input size="xs" type="email" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add an email for this send" aria-label="Add recipient" />
              <Button type="submit" plain size="xs" disabled={!addOk}>
                Add
              </Button>
            </form>
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Dates</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-border px-3 py-2">
              <div className="text-[11.5px] text-fg-muted">{isQuote ? 'Sent' : 'Issued'}</div>
              <div className="mt-px text-[13px] font-semibold text-fg-strong">
                {draft ? `Today · ${longDate(isoDay(today))}` : 'Original date kept'}
              </div>
            </div>
            <div className={clsx('rounded-md border px-3 py-2', overridden ? 'border-[color-mix(in_oklch,var(--accent-500)_45%,var(--border))]' : 'border-border')}>
              <div className="flex items-baseline justify-between">
                <span className="text-[11.5px] text-fg-muted">{dateLabel}</span>
                {draft && !changing && (
                  <button type="button" className="card-action" onClick={() => setChanging(true)}>
                    Change
                  </button>
                )}
                {draft && overridden && (
                  <button
                    type="button"
                    className="card-action"
                    onClick={() => {
                      setDay(null);
                      setChanging(false);
                    }}
                  >
                    Reset
                  </button>
                )}
              </div>
              {draft && changing ? (
                <Input
                  size="xs"
                  type="date"
                  aria-label={`${dateLabel} date`}
                  value={chosen ?? ''}
                  min={isoDay(today)}
                  onChange={(e) => e.target.value && setDay(e.target.value)}
                  className="mt-1"
                />
              ) : (
                <div className="mt-px text-[13px] font-semibold text-fg-strong">
                  {!draft ? (existing ? longDate(existing) : '—') : dueOnReceipt ? 'On receipt' : chosen ? longDate(chosen) : '—'}
                </div>
              )}
              <div className={clsx('mt-0.5 text-[11px]', overridden ? 'text-fg-accent' : 'text-fg-muted')}>
                {!draft ? 'Set when first sent' : overridden ? `Changed from ${defaultNote} for this ${noun}` : defaultNote}
              </div>
            </div>
          </div>
        </div>

        <p className="text-[11.5px] text-fg-muted">
          {`The email includes a link to the ${noun}. Its wording is set in Notification Templates.`}
        </p>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button color="dark/zinc" disabled={busy || !to.length} onClick={() => void send()}>
          {`${draft ? `Send ${noun}` : 'Resend'} · ${formatCurrency(doc.totalAmount)}`}
        </Button>
      </DialogActions>
    </>
  );
}
