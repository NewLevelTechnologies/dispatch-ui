/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatPhone, validateEmail } from '@dispatch/utils';
import {
  contactApi,
  customerApi,
  invoicesApi,
  InvoiceStatus,
  notificationTemplateApi,
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
import { Textarea } from '../catalyst/textarea';
import { Callout } from '../ui/Callout';
import { documentErrorMessage, refreshDocumentLists } from './useDocumentEditor';

export type SendTarget = { kind: 'invoice'; doc: Invoice } | { kind: 'quote'; doc: Quote };

interface Recipient {
  key: string;
  name: string;
  role: string;
  channel: 'email' | 'text';
  /** An email, or a phone as entered. */
  address: string;
  on: boolean;
}

const MESSAGE_MAX = 2000;
const LINK = '{{link}}';
/** What the server accepts as a US number: 10 digits, or 11 starting with 1. */
const isPhone = (v: string) => {
  const d = v.replace(/\D/g, '');
  return /^[\d\s().+-]+$/.test(v) && (d.length === 10 || (d.length === 11 && d.startsWith('1')));
};

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
 * date on a sent invoice is fixed by void and reissue. It can go by email,
 * text, or both; the email's wording can be rewritten for this one send.
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

  // The email as the template would write it, with the dates this send would give it.
  const previewDate = overridden ? (chosen ?? undefined) : undefined;
  const { data: preview, isError: previewFailed } = useQuery({
    queryKey: ['send-preview', kind, doc.id, previewDate ?? null],
    queryFn: async () => {
      const p = isQuote ? await quotesApi.sendPreview(doc.id, previewDate) : await invoicesApi.sendPreview(doc.id, previewDate);
      return notificationTemplateApi.render({ notificationTypeKey: p.emailNotificationTypeKey, templateData: p.templateData });
    },
  });
  const templateBody = preview?.body ?? '';
  // null until Edit: the template's own wording goes out. Once edited, the text is the user's; a date change doesn't rewrite it.
  const [message, setMessage] = useState<string | null>(null);
  const edited = message != null && message.trim() !== templateBody.trim();
  const tooLong = (message ?? '').trim().length > MESSAGE_MAX;

  // The account's own address first (what the server sends to by default), then its contacts' emails, then numbers to text.
  // A text is on by default only for a homeowner's own phone, or when the account has no email to send to.
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [extra, setExtra] = useState<Recipient[]>([]);
  const [adding, setAdding] = useState('');
  const accountRole = getName(customer?.type === 'BILLING_ONLY' ? 'payer' : 'customer');
  const contactPhone = (c: (typeof contacts)[number]) => c.mobilePhone || c.phone;
  const base: Recipient[] = [
    ...(customer?.email ? [{ key: 'account', name: customer.name, role: accountRole, channel: 'email' as const, address: customer.email, on: true }] : []),
    ...contacts
      .filter((c) => c.email)
      .map((c) => ({ key: c.id, name: c.name, role: c.role || 'Contact', channel: 'email' as const, address: c.email!, on: !customer?.email && !!c.isPrimary })),
    ...(customer?.phone
      ? [{ key: 'account-text', name: customer.name, role: accountRole, channel: 'text' as const, address: customer.phone, on: !customer.email || customer.category === 'RESIDENTIAL' }]
      : []),
    ...contacts
      .filter((c) => contactPhone(c))
      .map((c) => ({ key: `text-${c.id}`, name: c.name, role: c.role || 'Contact', channel: 'text' as const, address: contactPhone(c)!, on: false })),
  ];
  const recipients = [...base, ...extra].map((r) => ({ ...r, on: picked[r.key] ?? r.on }));
  const emails = recipients.filter((r) => r.on && r.channel === 'email').map((r) => r.address);
  const phones = recipients.filter((r) => r.on && r.channel === 'text').map((r) => r.address);
  const addAs = validateEmail(adding.trim()) ? 'email' : isPhone(adding.trim()) ? 'text' : null;

  const nteOver = !isQuote && ((doc as Invoice).warnings ?? []).some((w) => w.code === 'NTE_EXCEEDED');
  const [busy, setBusy] = useState(false);

  const addRecipient = (e: FormEvent) => {
    e.preventDefault();
    if (!addAs) return;
    const address = adding.trim();
    const key = `extra-${address}`;
    const name = addAs === 'text' ? formatPhone(address) : address;
    setExtra((xs) => (xs.some((x) => x.key === key) ? xs : [...xs, { key, name, role: 'This send only', channel: addAs, address, on: true }]));
    setPicked((p) => ({ ...p, [key]: true }));
    setAdding('');
  };

  // The customer's page in a new tab, with this send's dates. The tab opens on the click so it isn't blocked as a popup.
  const [previewing, setPreviewing] = useState(false);
  const openPreview = async () => {
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    setPreviewing(true);
    try {
      const { url } = isQuote ? await quotesApi.previewLink(doc.id, previewDate) : await invoicesApi.previewLink(doc.id, previewDate);
      if (tab) tab.location.href = url;
      else window.open(url, '_blank', 'noopener');
    } catch (err) {
      tab?.close();
      showError('Couldn’t open the preview', documentErrorMessage(err, noun));
    } finally {
      setPreviewing(false);
    }
  };

  const canSend = (emails.length > 0 || phones.length > 0) && !tooLong;
  const send = async () => {
    if (busy || !canSend) return;
    setBusy(true);
    try {
      const override = overridden ? (chosen ?? undefined) : undefined;
      const opts = { recipientEmails: emails, recipientPhones: phones, message: edited && emails.length ? message! : undefined };
      const res = isQuote
        ? await quotesApi.send(doc.id, { ...opts, expirationDate: override })
        : await invoicesApi.send(doc.id, { ...opts, dueDate: override });
      queryClient.invalidateQueries({ queryKey: [kind, doc.id] });
      refreshDocumentLists(queryClient);
      const sentTo = [res.lastSentToEmails, res.lastSentToPhones?.split(',').map(formatPhone).join(', ')].filter(Boolean).join(', ');
      showSuccess(`${number} sent`, sentTo ? `To ${sentTo}` : undefined);
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
          {`Rev ${revision} replaces Rev ${revision - 1}. The ${getName('customer').toLowerCase()}’s link will show this revision, and Rev ${revision - 1} can no longer be approved.`}
        </DialogDescription>
      )}
      <DialogBody className="!mt-3 flex flex-col gap-4">
        {nteOver && (
          <Callout kind="warning">{`Over the ${getName('work_order').toLowerCase()}’s not-to-exceed. Make sure ${customer?.name ?? `the ${getName('customer').toLowerCase()}`} approved the extra before sending.`}</Callout>
        )}

        <div>
          <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Send to</div>
          <div className="rounded-md border border-border">
            {recipients.map((r, i) => (
              <label key={r.key} className={clsx('flex cursor-pointer items-center gap-2.5 px-3 py-2', i > 0 && 'border-t border-border-soft')}>
                <Checkbox
                  checked={r.on}
                  onChange={(on) => setPicked((p) => ({ ...p, [r.key]: on }))}
                  aria-label={r.channel === 'email' ? `Send to ${r.address}` : `Text ${formatPhone(r.address)}`}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[12.5px] font-semibold text-fg-strong">
                    {r.name} <span className="font-normal text-fg-muted">· {r.role}</span>
                  </span>
                  <span className={clsx('truncate text-[11.5px] text-fg-muted', r.channel === 'text' && 'tabular-nums')}>
                    {r.channel === 'text' ? formatPhone(r.address) : r.address}
                  </span>
                </span>
                <span className="text-[11px] text-fg-muted">{r.channel === 'email' ? 'Email' : 'Text'}</span>
              </label>
            ))}
            {!recipients.length && customer && (
              <p className="px-3 py-2 text-[12px] text-fg-muted">{`${customer.name} has no email or phone on file. Add one below.`}</p>
            )}
            <form onSubmit={addRecipient} className="flex items-center gap-2 border-t border-border-soft px-3 py-2" aria-label="Add recipient">
              <Input size="xs" value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add an email or mobile number for this send" aria-label="Add recipient" />
              <Button type="submit" plain size="xs" disabled={!addAs}>
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

        <div>
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Message</span>
            {message == null ? (
              (emails.length > 0 || !phones.length) && (
                <button type="button" className="card-action" disabled={!preview && !previewFailed} onClick={() => setMessage(templateBody)}>
                  Edit
                </button>
              )
            ) : (
              <button type="button" className="card-action" onClick={() => setMessage(null)}>
                Use template
              </button>
            )}
          </div>
          {!emails.length && phones.length > 0 ? (
            <p className="text-[12px] text-fg-muted">{`Texts only: the text message’s wording comes from its own template.`}</p>
          ) : message != null ? (
            <>
              <Textarea rows={7} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message" invalid={tooLong} autoFocus />
              <div className={clsx('mt-1 flex justify-between gap-3 text-[11px]', tooLong ? 'text-danger-500' : 'text-fg-muted')}>
                <span>{`${LINK} marks where the link to the ${noun} goes; without it, the link is added at the end. This send only.`}</span>
                <span className="shrink-0 tabular-nums">{`${(message ?? '').trim().length} / ${MESSAGE_MAX}`}</span>
              </div>
            </>
          ) : (
            <div className="max-h-16 overflow-hidden whitespace-pre-line rounded-md bg-bg-elev-2 px-2.5 py-2 text-[12px] leading-normal text-fg-muted">
              {preview ? (
                preview.body.split(LINK).map((part, i) => (
                  <span key={i}>
                    {i > 0 && <span className="font-semibold text-fg">{`[link to the ${noun}]`}</span>}
                    {part}
                  </span>
                ))
              ) : previewFailed ? (
                `Couldn’t load the template. It still goes out as set in Notification Templates, or edit it here.`
              ) : (
                'Loading…'
              )}
            </div>
          )}
          {(emails.length > 0 || !phones.length) && message == null && (
            <p className="mt-1 text-[11px] text-fg-muted">{`Includes a link to the ${noun}. The template is set in Notification Templates.`}</p>
          )}
          {emails.length > 0 && phones.length > 0 && (
            <p className="mt-1 text-[11px] text-fg-muted">Texts use their own short template, not this message.</p>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain className="sm:mr-auto" disabled={previewing} onClick={() => void openPreview()}>
          {`Preview ${getName('customer').toLowerCase()} view`}
        </Button>
        <Button plain onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button color="dark/zinc" disabled={busy || !canSend} onClick={() => void send()}>
          {`${draft ? `Send ${noun}` : 'Resend'} · ${formatCurrency(doc.totalAmount)}`}
        </Button>
      </DialogActions>
    </>
  );
}
