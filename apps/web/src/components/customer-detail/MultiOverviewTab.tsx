/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/separators/short operational labels stay literal to keep the markup readable (same convention as ServiceLocationDetailPage). */
// MULTI customer Overview — the billing-hub view. Left rail = lookup surfaces
// (Billing & AR · Locations preview · Agreements summary · Notes); right rail =
// identity/reference (Contact · Account details). Tags now live on the header
// (CustomerHeaderTags); a full Activity feed is still absent until its backend
// read exists (see BACKEND_ASKS ACT-1).
//
// Finance/agreement rollups are wired off two sibling summary calls fired on
// load — FIN-1 (GET /financial/customers/{id}/ar-summary: outstanding, aging,
// LTV) and AG-1 (GET /work-orders/agreements/summary: ARR, coverage %, overdue
// visits). Until each resolves (loading/error), the dependent surface keeps its
// honest "—" / pending note rather than a faked number; per-location next-visit
// is a separate work-order call wired on the Locations tab (LOC-1 Phase 3).
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ReceiptPercentIcon,
  MapPinIcon,
  ClipboardDocumentListIcon,
  UserIcon,
  PencilSquareIcon,
  StarIcon,
} from '@heroicons/react/24/outline';
import {
  activityApi,
  agreementApi,
  contactApi,
  customerApi,
  financialActivityApi,
  invoicesApi,
  InvoiceAgingBucket,
  type Customer,
  type AgreementSummaryResponse,
  type CustomerArSummaryResponse,
  type CustomerAgreementSummaryResponse,
  type ArPaymentMethod,
  type UpdateCustomerRequest,
  type AddressVerifyRequest,
  type AdditionalContact,
} from '../../api/setup';
import { PatternFormat } from 'react-number-format';
import { useTranslation } from '@dispatch/i18n';
import clsx from 'clsx';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError, showSuccess, extractApiError } from '../../lib/toast';
import { handleConcurrentEdit } from '../../lib/conflict';
import { titleCaseAddress } from '@dispatch/utils';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { Checkbox } from '../catalyst/checkbox';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import AccountManagerPicker, { type AccountManagerValue } from '../AccountManagerPicker';
import { US_STATES } from '../../constants/states';
import { useAddressVerify } from '../../hooks/useAddressVerify';
import { AddressSuggestion } from '../AddressSuggestion';
import { Pill } from '../ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../ui/DenseTable';
import NotesCard from '../NotesCard';
import { ContactBlock } from '../detail/ContactBlock';
import NotifBell from '../detail/NotifBell';
import ContactFormDialog from '../ContactFormDialog';
import NotificationPreferencesDialog from '../NotificationPreferencesDialog';
import ConfirmDialog from '../ConfirmDialog';
import { CardTitle, CardLink } from './shared';
import { formatDateShort, formatMoney } from './format';
import { buildAttentionItems, daysUntil, type AttentionItem } from './attention';
import { useGoToInvoicesBucket } from './invoiceAgingNav';
import { buildRecentActivity } from '../../lib/locationActivityRows';
import { ACTIVITY_TONE_STYLE } from '../../lib/activityGlyph';

const PREVIEW_LIMIT = 8;
const CONTACT_CARD_CAP = 2;

const PAYMENT_METHOD_LABEL: Record<ArPaymentMethod, string> = {
  CASH: 'Cash',
  CHECK: 'Check',
  CREDIT_CARD: 'Credit card',
  DEBIT_CARD: 'Debit card',
  ACH: 'ACH',
  WIRE_TRANSFER: 'Wire',
  OTHER: 'Other',
};

export default function MultiOverviewTab({
  customer,
  canEdit,
  onViewLocations,
  onViewAgreements,
  onViewContacts,
}: {
  customer: Customer;
  canEdit: boolean;
  onViewLocations: () => void;
  onViewAgreements: () => void;
  onViewContacts: () => void;
}) {
  // All three share keys with the parent's tab-count queries → one request each.
  const { data: agreements = [] } = useQuery({
    queryKey: ['agreements', { customerId: customer.id }],
    queryFn: () => agreementApi.list({ customerId: customer.id }),
    enabled: !!customer.id,
  });
  // FIN-1 + AG-1 sibling summary calls — fired on load, in parallel with the
  // detail. Each card degrades to its pending state until its query resolves.
  const { data: arSummary } = useQuery({
    queryKey: ['customer-ar-summary', customer.id],
    queryFn: () => invoicesApi.getCustomerArSummary(customer.id),
    enabled: !!customer.id,
  });
  const { data: agreementSummary } = useQuery({
    queryKey: ['agreement-customer-summary', customer.id],
    queryFn: () => agreementApi.getCustomerSummary(customer.id),
    enabled: !!customer.id,
  });

  const attentionItems = buildAttentionItems(agreements, arSummary, agreementSummary, customer.id);
  const goToBucket = useGoToInvoicesBucket();

  return (
    <div className="flex flex-col gap-3">
      {attentionItems.length > 0 && <AttentionStrip items={attentionItems} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <BillingCard customer={customer} ar={arSummary} canEdit={canEdit} onSelectAging={goToBucket} />
          <LocationsPreviewCard customer={customer} onViewAll={onViewLocations} />
          <NotesCard entityType="customer" entityId={customer.id} canEdit={canEdit} />
          <CustomerActivityTeaser customerId={customer.id} />
        </div>

        <div className="flex flex-col gap-3">
          <ContactCard customer={customer} canEdit={canEdit} onViewAll={onViewContacts} />
          <AccountDetailsCard customer={customer} ar={arSummary} canEdit={canEdit} />
          <AgreementsSummaryCard agreements={agreements} summary={agreementSummary} onViewAll={onViewAgreements} />
        </div>
      </div>
    </div>
  );
}

export function AttentionStrip({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();
  return (
    <Card padding="none">
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg">Needs attention</span>
        <span className="rounded bg-bg-active px-1.5 font-mono text-[10.5px] font-semibold text-fg-strong">
          {items.length}
        </span>
      </div>
      {items.map((it, i) => (
        <div
          key={it.key}
          className={`relative flex items-center gap-2.5 py-1.5 pl-3 pr-3.5 ${i < items.length - 1 ? 'border-b border-border-soft' : ''}`}
        >
          <span className="absolute inset-y-1.5 left-0 w-[3px] rounded" style={{ background: 'var(--warning-500)' }} />
          <div className="flex grow flex-wrap items-baseline gap-2 leading-normal">
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--warning-fg)' }}>
              {it.title}
            </span>
            <span className="text-[11.5px] text-fg-muted">· {it.sub}</span>
          </div>
          <Button outline size="xxs" className="shrink-0" onClick={() => navigate(it.to)}>
            {it.action}
          </Button>
        </div>
      ))}
    </Card>
  );
}

function LabelTiny({ children }: { children: React.ReactNode }) {
  return <div className="label-tiny">{children}</div>;
}

// Recent activity peek — the 3 most-recent business + financial events merged
// (the customer-scoped twin of the location overview's ActivityTeaser). Quiet
// when there's no activity yet. "View activity →" switches to the Activity tab.
function CustomerActivityTeaser({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const { data: businessData } = useQuery({
    queryKey: ['customer-activity-teaser', customerId],
    queryFn: () => activityApi.listForCustomer(customerId, { limit: 5 }),
    enabled: !!customerId,
  });
  const { data: financialData } = useQuery({
    queryKey: ['customer-financial-activity-teaser', customerId],
    queryFn: () => financialActivityApi.getForCustomer(customerId, { limit: 500 }).then((p) => p.content),
    enabled: !!customerId,
  });
  const recent = buildRecentActivity(
    { events: businessData?.content ?? [], financial: financialData ?? [] },
    t,
    getName,
    3,
  );
  if (recent.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-bg-elev shadow-sm">
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-dim">Recent activity</span>
        <span className="grow" />
        <CardLink onClick={() => navigate(`/customers/${customerId}?tab=activity`)}>View activity →</CardLink>
      </div>
      {recent.map((item, i) => {
        const s = ACTIVITY_TONE_STYLE[item.tone];
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2.5 px-3.5 py-1.5 ${i < recent.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <div
              className="flex size-[18px] shrink-0 items-center justify-center rounded text-[11px] font-bold"
              style={{ background: s.bg, color: s.fg }}
            >
              {item.glyph}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
              <span className="text-[12.5px] font-medium text-fg-strong">{item.text}</span>
              {item.obj && <span className="text-[11px] text-fg-dim">· {item.obj}</span>}
            </div>
            <span className="shrink-0 text-[11px] text-fg-dim" title={item.tsExact}>
              {item.ts}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Aging buckets tint by severity only when populated — older = hotter (91+/61–90
// amber, 31–60 info, current/1–30 neutral). $0 buckets stay flat/dim so a clean
// AR reads calm.
type BucketTone = 'neutral' | 'info' | 'warning';
function bucketTint(tone: BucketTone, amount: number): { wrap?: React.CSSProperties; text: string } {
  if (amount <= 0) return { text: 'var(--fg-dim)' };
  if (tone === 'warning')
    return {
      wrap: {
        background: 'color-mix(in oklch, var(--warning-500) 10%, transparent)',
        borderColor: 'color-mix(in oklch, var(--warning-500) 35%, transparent)',
      },
      text: 'var(--warning-fg)',
    };
  if (tone === 'info')
    return {
      wrap: {
        background: 'color-mix(in oklch, var(--info-500) 9%, transparent)',
        borderColor: 'color-mix(in oklch, var(--info-500) 30%, transparent)',
      },
      text: 'var(--info-500)',
    };
  return { text: 'var(--fg-strong)' };
}

// AR-relevant writable fields share Billing & AR with the balance (one home,
// edit-where-you-read): payment terms, tax-exempt + cert, PO-required. Pricebook
// is an operational/quoting detail — it lives in Account details, not here.
interface BillingDraft {
  paymentTermsDays: number;
  taxExempt: boolean;
  taxExemptCertificate: string;
  requiresPurchaseOrder: boolean;
}

function seedBillingDraft(c: Customer): BillingDraft {
  return {
    paymentTermsDays: c.paymentTermsDays,
    taxExempt: c.taxExempt,
    taxExemptCertificate: c.taxExemptCertificate ?? '',
    requiresPurchaseOrder: c.requiresPurchaseOrder,
  };
}

function isBillingDirty(d: BillingDraft, c: Customer): boolean {
  const s = seedBillingDraft(c);
  return (
    d.paymentTermsDays !== s.paymentTermsDays ||
    d.taxExempt !== s.taxExempt ||
    (d.taxExempt && d.taxExemptCertificate.trim() !== s.taxExemptCertificate) ||
    d.requiresPurchaseOrder !== s.requiresPurchaseOrder
  );
}

// Billing & AR — the financial headline: outstanding balance + the 5-bucket
// aging strip (each box deep-links to that bucket on the Invoices tab) from the
// FIN-1 summary (honest "—" until it resolves), plus the AR-relevant account
// terms. Terms / tax-exempt / PO live here (not Account details) — they're AR
// facts and edit where they're read. Exported for reuse by the other variants.
export function BillingCard({
  customer,
  ar,
  canEdit = false,
  onSelectAging,
}: {
  customer: Customer;
  ar?: CustomerArSummaryResponse;
  canEdit?: boolean;
  // Deep-link a bucket into the Invoices tab filtered to it. Omit to render the
  // boxes as static (e.g. where there's no Invoices tab to jump to).
  onSelectAging?: (bucket: InvoiceAgingBucket) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<BillingDraft>(() => seedBillingDraft(customer));

  const startEdit = () => {
    setDraft(seedBillingDraft(customer));
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const request: UpdateCustomerRequest = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? null,
        type: customer.type,
        paymentTermsDays: draft.paymentTermsDays,
        requiresPurchaseOrder: draft.requiresPurchaseOrder,
        contractPricingTier: customer.contractPricingTier ?? null,
        taxExempt: draft.taxExempt,
        taxExemptCertificate: draft.taxExempt ? draft.taxExemptCertificate.trim() || null : null,
        notes: customer.notes ?? null,
        status: customer.status,
        accountManagerUserId: customer.accountManager?.id ?? null,
        industry: customer.industry ?? null,
      };
      return customerApi.update(customer.id, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditing(false);
      showSuccess('Billing details updated');
    },
    onError: (err) => {
      if (handleConcurrentEdit(err, queryClient, ['customers'])) return;
      showError("Couldn't update billing details", extractApiError(err) ?? undefined);
    },
  });

  const dirty = isBillingDirty(draft, customer);
  const termsLabel = customer.paymentTermsDays > 0 ? `Net ${customer.paymentTermsDays}` : '—';
  const buckets: {
    k: string;
    b: CustomerArSummaryResponse['current'];
    tone: BucketTone;
    bucket: InvoiceAgingBucket;
  }[] = ar
    ? [
        { k: 'Current', b: ar.current, tone: 'neutral', bucket: InvoiceAgingBucket.CURRENT },
        { k: '1–30', b: ar.days1To30, tone: 'neutral', bucket: InvoiceAgingBucket.DAYS_1_30 },
        { k: '31–60', b: ar.days31To60, tone: 'info', bucket: InvoiceAgingBucket.DAYS_31_60 },
        { k: '61–90', b: ar.days61To90, tone: 'warning', bucket: InvoiceAgingBucket.DAYS_61_90 },
        { k: '91+', b: ar.days91Plus, tone: 'warning', bucket: InvoiceAgingBucket.DAYS_91_PLUS },
      ]
    : [];
  return (
    <Card
      title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Billing &amp; AR</CardTitle>}
      padding="none"
      action={
        !editing && canEdit ? (
          <Button outline size="xs" type="button" onClick={startEdit}>
            Edit
          </Button>
        ) : undefined
      }
      footer={
        editing ? (
          <div className="flex items-center justify-end gap-1.5 rounded-b-[10px] border-t border-border-soft bg-bg-elev-2 px-3.5 py-2.5">
            <Button plain size="xs" type="button" onClick={() => setEditing(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              color="accent"
              size="xs"
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="p-3.5">
        {/* Outstanding balance + aging in one horizontal strip — balance left,
            the 5 compact bucket cells right-aligned on the same band. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div>
            <LabelTiny>Outstanding balance</LabelTiny>
            {ar ? (
              <div
                className="mt-0.5 font-mono text-[20px] font-bold tabular-nums"
                style={{ color: ar.outstandingBalance > 0 ? 'var(--fg-strong)' : 'var(--fg-dim)' }}
              >
                {formatMoney(ar.outstandingBalance)}
              </div>
            ) : (
              <>
                <div className="mt-0.5 font-mono text-[20px] font-bold tabular-nums text-fg-dim">—</div>
                <div className="text-[11px] text-fg-muted">AR aging &amp; balance loading…</div>
              </>
            )}
          </div>
          {ar && (
            <div className="grid grid-cols-5 gap-1 sm:flex sm:shrink-0">
              {buckets.map(({ k, b, tone, bucket }) => {
                const tint = bucketTint(tone, b.amount);
                const clickable = !!onSelectAging && b.count > 0;
                const cls = 'min-w-0 rounded-md border border-border-soft px-1.5 py-1 text-center sm:min-w-[46px]';
                const inner = (
                  <>
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-fg-muted">{k}</div>
                    <div className="mt-0.5 font-mono text-[11px] font-bold tabular-nums" style={{ color: tint.text }}>
                      {formatMoney(b.amount)}
                    </div>
                  </>
                );
                return clickable ? (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onSelectAging!(bucket)}
                    title={`View ${k} invoices (${b.count})`}
                    className={`${cls} cursor-pointer transition-colors hover:border-border`}
                    style={tint.wrap}
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={k} className={cls} style={tint.wrap}>
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {ar && ar.days91Plus.count > 0 && ar.oldestPastDueInvoiceDate && (
          <div className="mt-2 text-[11px]" style={{ color: 'var(--danger-500)' }}>
            Oldest past due {formatDateShort(ar.oldestPastDueInvoiceDate)}
          </div>
        )}

        <div className="my-3.5 h-px bg-border-soft" />

        {editing ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 items-end gap-2.5">
              <Field size="xs">
                <Label size="xs">Payment terms</Label>
                <Select
                  value={String(draft.paymentTermsDays)}
                  onChange={(e) => setDraft((d) => ({ ...d, paymentTermsDays: Number(e.target.value) }))}
                >
                  {PAYMENT_TERMS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex h-9 cursor-pointer items-center gap-2">
                <Checkbox
                  color="accent"
                  checked={draft.requiresPurchaseOrder}
                  onChange={(v) => setDraft((d) => ({ ...d, requiresPurchaseOrder: v }))}
                />
                <span className="text-[12.5px] text-fg-strong">PO required</span>
              </label>
            </div>
            <div className="grid grid-cols-2 items-end gap-2.5">
              <label className="flex h-9 cursor-pointer items-center gap-2">
                <Checkbox
                  color="accent"
                  checked={draft.taxExempt}
                  onChange={(v) => setDraft((d) => ({ ...d, taxExempt: v }))}
                />
                <span className="text-[12.5px] text-fg-strong">Tax exempt</span>
              </label>
              {draft.taxExempt && (
                <Field size="xs">
                  <Label size="xs">Exemption certificate #</Label>
                  <Input
                    size="xs"
                    value={draft.taxExemptCertificate}
                    onChange={(e) => setDraft((d) => ({ ...d, taxExemptCertificate: e.target.value }))}
                    placeholder="84-2200"
                  />
                </Field>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            <div>
              <LabelTiny>Terms</LabelTiny>
              <div className="mt-0.5 text-[13px] font-semibold text-fg-strong">{termsLabel}</div>
              {customer.requiresPurchaseOrder && <div className="text-[11px] text-fg-muted">PO required</div>}
            </div>
            <div>
              <LabelTiny>Tax exempt</LabelTiny>
              <div className="mt-0.5 text-[13px] font-semibold text-fg-strong">
                {customer.taxExempt ? 'Yes' : 'No'}
              </div>
              {customer.taxExempt && customer.taxExemptCertificate && (
                <div className="font-mono text-[11px] text-fg-muted">{customer.taxExemptCertificate}</div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function LocationsPreviewCard({
  customer,
  onViewAll,
}: {
  customer: Customer;
  onViewAll: () => void;
}) {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const total = customer.serviceLocations.length;
  // Needs-attention first: locations with open jobs float up, then active before
  // inactive/closed, then by name — capped at PREVIEW_LIMIT (not payload order).
  const top = [...customer.serviceLocations]
    .sort((a, b) => {
      const ao = a.openJobsCount ?? (a.hasOpenJobs ? 1 : 0);
      const bo = b.openJobsCount ?? (b.hasOpenJobs ? 1 : 0);
      if (ao !== bo) return bo - ao;
      const rank = (s: string) => (s === 'ACTIVE' ? 0 : s === 'INACTIVE' ? 1 : 2);
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
      return (a.locationName || '').localeCompare(b.locationName || '');
    })
    .slice(0, PREVIEW_LIMIT);
  // Open-jobs teaser column lights up once the LOC-1 denorm is on the payload
  // (full operational/financial columns live on the Locations tab).
  const enriched = customer.serviceLocations.some(
    (l) => l.hasOpenJobs !== undefined || l.openJobsCount !== undefined,
  );

  return (
    <Card
      title={<CardTitle icon={<MapPinIcon className="size-3.5" />}>{getName('service_location', true)}</CardTitle>}
      action={
        <div className="flex items-center gap-2">
          {total > PREVIEW_LIMIT && (
            <>
              <span className="text-[11px] text-fg-muted">
                Top {PREVIEW_LIMIT} of {total}
              </span>
              <span className="text-fg-dim">·</span>
            </>
          )}
          <CardLink onClick={onViewAll}>View all →</CardLink>
        </div>
      }
      padding="none"
    >
      <DenseTable>
        <DenseTHead>
          <tr>
            <th>{getName('service_location')}</th>
            <th>Last service</th>
            {enriched && <th className="right">Open jobs</th>}
            <th>Status</th>
          </tr>
        </DenseTHead>
        <tbody>
          {top.map((l) => {
            const street = titleCaseAddress(
              [l.address.streetAddress, l.address.streetAddressLine2].filter(Boolean).join(' '),
            );
            const cityLine = [titleCaseAddress(l.address.city), l.address.state].filter(Boolean).join(', ');
            return (
              <DenseRow key={l.id} onClick={() => navigate(`/service-locations/${l.id}?from=customer`)}>
                <td>
                  <CellStack>
                    <CellTop>{l.locationName || `Unnamed ${getName('service_location').toLowerCase()}`}</CellTop>
                    <CellSub>{[street, cityLine].filter(Boolean).join(' · ')}</CellSub>
                  </CellStack>
                </td>
                <td className={clsx('muted', !l.lastServiceAt && 'dt-empty')} data-label="Last service">
                  {l.lastServiceAt ? formatDateShort(l.lastServiceAt) : <span className="text-fg-dim">—</span>}
                </td>
                {enriched && (
                  <td
                    className={clsx('right num strong', !(l.openJobsCount && l.openJobsCount > 0) && 'dt-empty')}
                    data-label="Open jobs"
                  >
                    {l.openJobsCount && l.openJobsCount > 0 ? (
                      l.openJobsCount
                    ) : (
                      <span className="text-fg-dim">—</span>
                    )}
                  </td>
                )}
                <td>
                  <Pill tone={l.status === 'ACTIVE' ? 'success' : 'neutral'} dot>
                    {l.status === 'ACTIVE' ? 'Active' : l.status === 'CLOSED' ? 'Closed' : 'Inactive'}
                  </Pill>
                </td>
              </DenseRow>
            );
          })}
        </tbody>
      </DenseTable>
    </Card>
  );
}

// Condensed strategic summary — active count + nearest renewal, plus ARR +
// coverage % from the AG-1 summary (honest pending until that query resolves).
// Exported so the SINGLE-shape detail reuses the exact same right-rail rollup
// (ARR + active count + next renewal). The coverage line auto-hides for a
// single location (nothing to roll up), so it reads identically on both shapes.
export function AgreementsSummaryCard({
  agreements,
  summary,
  onViewAll,
}: {
  agreements: AgreementSummaryResponse[];
  summary?: CustomerAgreementSummaryResponse;
  onViewAll: () => void;
}) {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const active = agreements.filter((a) => a.status === 'ACTIVE');

  const nextRenewal = useMemo(() => {
    const upcoming = active
      .map((a) => ({ a, days: a.termEnd ? daysUntil(a.termEnd) : null }))
      .filter((x): x is { a: AgreementSummaryResponse; days: number } => x.days != null && x.days > 0)
      .sort((x, y) => x.days - y.days);
    return upcoming[0] ?? null;
  }, [active]);

  return (
    <Card
      title={<CardTitle icon={<ClipboardDocumentListIcon className="size-3.5" />}>{getName('agreement', true)}</CardTitle>}
      action={agreements.length > 0 ? <CardLink onClick={onViewAll}>View all {agreements.length} →</CardLink> : undefined}
      padding="none"
    >
      {agreements.length === 0 ? (
        <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
          No {getName('agreement', true).toLowerCase()} yet.
        </div>
      ) : (
        <div>
          {/* Restacked single-column for the 340px right rail: ARR headline,
              active count as an eyebrow, coverage as a sub-line. */}
          <div className="border-b border-border-soft px-3.5 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <LabelTiny>Annual recurring</LabelTiny>
              <span className="text-[11px] text-fg-muted">
                {active.length} of {agreements.length} active
              </span>
            </div>
            {summary ? (
              <>
                <div className="mt-0.5 font-mono text-[17px] font-bold tabular-nums text-fg-strong">
                  {formatMoney(summary.arr)}
                  <span className="ml-0.5 text-[11px] font-medium text-fg-muted">/yr</span>
                </div>
                {/* Coverage rollup only makes sense across multiple locations;
                    a single-site customer has nothing to roll up. */}
                {summary.totalLocations > 1 && (
                  <div className="text-[11px] text-fg-muted">
                    {summary.coveragePct}% covered · {summary.coveredLocations}/{summary.totalLocations} {getName('service_location', true).toLowerCase()}
                  </div>
                )}
              </>
            ) : (
              <div className="mt-0.5 text-[11px] text-fg-muted">ARR &amp; coverage loading…</div>
            )}
          </div>
          {nextRenewal && (
            <button
              type="button"
              onClick={() => navigate(`/agreements/${nextRenewal.a.id}?from=customer`)}
              className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-bg-hover"
              style={
                nextRenewal.days < 30
                  ? { background: 'color-mix(in oklch, var(--warning-500) 6%, var(--bg-elev))' }
                  : undefined
              }
            >
              <div className="grow">
                <div className="flex items-baseline gap-1.5">
                  <LabelTiny>Next renewal</LabelTiny>
                  {nextRenewal.days < 30 && (
                    <span className="text-[10px] font-bold tracking-wide" style={{ color: 'var(--warning-fg)' }}>
                      · IN {nextRenewal.days} DAYS
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[13px] font-semibold text-fg-strong">{nextRenewal.a.name}</div>
                <div className="text-[11.5px] text-fg-muted">
                  <span className="font-mono">{nextRenewal.a.agreementNumber}</span> · renews {formatDateShort(nextRenewal.a.termEnd)}
                </div>
              </div>
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

// Customer contacts — the contact PEOPLE only (the customer's own phone/email
// now lives in the page header, same tier as the billing address). A pure mirror
// of the location Site-contact card: designated primary on top with a badge, the
// rest under "Additional" with Make-primary / Edit / notify on hover, plus
// "+ Add" and a "View all" peek into the Contacts tab. "Bill-to" etc. read as a
// role chip on the relevant person. Primary support: CUST-CONTACT-PRIMARY-1.
export function ContactCard({
  customer,
  canEdit,
  onViewAll,
}: {
  customer: Customer;
  canEdit: boolean;
  onViewAll: () => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<{ open: boolean; contact: AdditionalContact | null }>({
    open: false,
    contact: null,
  });
  const [notifyContact, setNotifyContact] = useState<AdditionalContact | null>(null);
  const [contactToDelete, setContactToDelete] = useState<AdditionalContact | null>(null);

  const makePrimaryMutation = useMutation({
    mutationFn: (contactId: string) => contactApi.makeCustomerContactPrimary(customer.id, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customer.id] });
      showSuccess('Primary contact updated');
    },
    onError: (err) => showError("Couldn't set primary contact", extractApiError(err) ?? undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => contactApi.deleteCustomerContact(customer.id, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customer.id] });
      setContactToDelete(null);
      showSuccess('Contact deleted');
    },
    onError: (err) => showError("Couldn't delete contact", extractApiError(err) ?? undefined),
  });

  const all = customer.additionalContacts ?? [];
  const primary = all.find((c) => c.isPrimary) ?? null;
  const additional = all
    .filter((c) => c.id !== primary?.id)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const shown = additional.slice(0, CONTACT_CARD_CAP);
  const hiddenCount = additional.length - shown.length;

  // Notification bell — filled when the contact has any alert enabled. Shared
  // with the location card; self-fetches its opt-in state.
  const notifyButton = (c: AdditionalContact) => (
    <NotifBell customerId={customer.id} contactId={c.id} onClick={() => setNotifyContact(c)} />
  );

  return (
    <Card
      title={<CardTitle icon={<UserIcon className="size-3.5" />}>Contacts</CardTitle>}
      action={
        canEdit && primary ? (
          <CardLink onClick={() => setDialog({ open: true, contact: primary })}>Edit</CardLink>
        ) : undefined
      }
      padding="none"
    >
      {/* Primary */}
      <div className="px-3.5 py-3">
        {primary ? (
          <ContactBlock
            contact={primary}
            primary
            badge={<Pill tone="info">Primary</Pill>}
            actions={canEdit ? notifyButton(primary) : undefined}
          />
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            No contacts on file.
            {canEdit && (
              <CardLink onClick={() => setDialog({ open: true, contact: null })}>+ Add</CardLink>
            )}
          </div>
        )}
      </div>

      {/* Additional — same block shape as the primary, divided rows, capped */}
      {(additional.length > 0 || (canEdit && primary)) && (
        <div className="border-t border-border-soft px-3.5 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Additional</div>
            {canEdit && (
              <CardLink onClick={() => setDialog({ open: true, contact: null })}>+ Add</CardLink>
            )}
          </div>
          {additional.length === 0 ? (
            <div className="text-[11.5px] italic text-fg-dim">No additional contacts.</div>
          ) : (
            <div className="flex flex-col">
              {shown.map((c) => (
                <div
                  key={c.id}
                  className="border-t border-border-soft py-2.5 first:border-t-0 first:pt-0 last:pb-0"
                >
                  <ContactBlock
                    contact={c}
                    actions={
                      canEdit ? (
                        <>
                          <button
                            type="button"
                            onClick={() => makePrimaryMutation.mutate(c.id)}
                            disabled={makePrimaryMutation.isPending}
                            title="Make primary"
                            aria-label="Make primary"
                            className="text-fg-dim hover:text-fg-strong disabled:opacity-50"
                          >
                            <StarIcon className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDialog({ open: true, contact: c })}
                            title="Edit contact"
                            aria-label="Edit contact"
                            className="text-fg-dim hover:text-fg-strong"
                          >
                            <PencilSquareIcon className="size-3.5" />
                          </button>
                          {notifyButton(c)}
                        </>
                      ) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={onViewAll}
              className="mt-2.5 block w-full border-t border-border-soft pt-2 text-left text-[11px] font-medium text-fg-accent hover:underline"
            >
              View all {all.length} →
            </button>
          )}
        </div>
      )}

      <ContactFormDialog
        isOpen={dialog.open}
        onClose={() => setDialog({ open: false, contact: null })}
        parentType="customer"
        parentId={customer.id}
        contact={dialog.contact}
        queryKey={['customers', customer.id]}
        onRequestDelete={
          dialog.contact && !dialog.contact.isPrimary
            ? () => {
                const target = dialog.contact;
                setDialog({ open: false, contact: null });
                setContactToDelete(target);
              }
            : undefined
        }
      />
      <ConfirmDialog
        isOpen={!!contactToDelete}
        onClose={() => setContactToDelete(null)}
        onConfirm={() => contactToDelete && deleteMutation.mutate(contactToDelete.id)}
        title="Delete contact"
        message={`Delete ${contactToDelete?.name ?? ''}?`}
        confirmLabel="Delete"
        isDestructive
        isPending={deleteMutation.isPending}
      />
      <NotificationPreferencesDialog
        isOpen={!!notifyContact}
        onClose={() => setNotifyContact(null)}
        customerId={customer.id}
        contact={notifyContact}
        contactName={notifyContact?.name || ''}
      />
    </Card>
  );
}

// Payment terms map to numeric `paymentTermsDays` on the wire; 0 = due on receipt.
const PAYMENT_TERMS: { value: number; label: string }[] = [
  { value: 0, label: 'Due on receipt' },
  { value: 15, label: 'Net 15' },
  { value: 30, label: 'Net 30' },
  { value: 60, label: 'Net 60' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Inline edit of the customer's IDENTITY — name, primary phone/email, and the
// billing address — flipped in place from the page header, mirroring the
// location header's inline-edit gesture exactly (accent-bordered card, full
// width, Save/Cancel bottom-right). These live in exactly one editable surface
// (this one); terms/tax/contacts edit in their own cards below.
//
// Billing-address autocomplete + live USPS re-verification are deferred (no
// provider wired yet), so the address fields are plain inputs and we surface
// the existing validated-address metadata as a read-only badge when present —
// identical to the location header.
export function CustomerHeaderEdit({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [email, setEmail] = useState(customer.email);
  const [street, setStreet] = useState(customer.billingAddress.streetAddress ?? '');
  const [line2, setLine2] = useState(customer.billingAddress.streetAddressLine2 ?? '');
  const [city, setCity] = useState(customer.billingAddress.city ?? '');
  const [state, setState] = useState(customer.billingAddress.state ?? '');
  const [zip, setZip] = useState(customer.billingAddress.zipCode ?? '');

  const av = useAddressVerify();
  const billingReq: AddressVerifyRequest = {
    streetAddress: street,
    streetAddressLine2: line2 || null,
    city,
    state,
    zipCode: zip,
  };

  const canSave =
    name.trim() !== '' &&
    email.trim() !== '' &&
    EMAIL_RE.test(email.trim()) &&
    street.trim() !== '' &&
    city.trim() !== '' &&
    state.trim() !== '' &&
    zip.trim() !== '';

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Billing address now rides the same PUT as identity (single request, no
      // read-modify-write race) — fold it in only when actually moved so the
      // server leaves the stored address untouched on an identity-only edit.
      const a = customer.billingAddress;
      const addressChanged =
        street !== a.streetAddress ||
        line2 !== (a.streetAddressLine2 ?? '') ||
        city !== a.city ||
        state !== a.state ||
        zip !== a.zipCode;

      // Identity — partial-safe full payload (echo the attribute fields the
      // Account-details card owns so nothing is wiped).
      const request: UpdateCustomerRequest = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        type: customer.type,
        paymentTermsDays: customer.paymentTermsDays,
        requiresPurchaseOrder: customer.requiresPurchaseOrder,
        contractPricingTier: customer.contractPricingTier ?? null,
        taxExempt: customer.taxExempt,
        taxExemptCertificate: customer.taxExemptCertificate ?? null,
        notes: customer.notes ?? null,
        status: customer.status,
        accountManagerUserId: customer.accountManager?.id ?? null,
        industry: customer.industry ?? null,
        ...(addressChanged
          ? {
              billingAddress: {
                streetAddress: street.trim(),
                streetAddressLine2: line2.trim() || null,
                city: city.trim(),
                state,
                zipCode: zip.trim(),
                // Coords from the verify step (if the form still matches what
                // was verified); the server derives + persists the timezone.
                ...(av.coordsFor(billingReq) ?? {}),
              },
            }
          : {}),
      };
      await customerApi.update(customer.id, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      // WO detail/list responses embed the customer name + billing → refetch.
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      showSuccess('Customer updated');
      onDone();
    },
    onError: (err) => {
      if (handleConcurrentEdit(err, queryClient, ['customers'])) return;
      showError("Couldn't save customer", extractApiError(err) ?? undefined);
    },
  });

  const saving = saveMutation.isPending;

  return (
    <div className="mb-3 rounded-[10px] border border-accent-500/40 bg-bg-elev px-4 py-3.5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13px] font-semibold text-fg-strong">Edit {getName('customer').toLowerCase()}</span>
        <span className="text-[11.5px] text-fg-muted">· terms &amp; contacts edit in their own cards below</span>
      </div>

      {/* Identity — name / phone / email */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr_1fr]">
        <Field>
          <Label className="text-xs">{getName('customer')} name *</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field>
          <Label className="text-xs">Phone</Label>
          <PatternFormat
            format="(###) ###-####"
            mask="_"
            customInput={Input}
            type="tel"
            value={phone}
            onValueChange={(values) => setPhone(values.value)}
          />
        </Field>
        <Field>
          <Label className="text-xs">Email *</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
      </div>

      {/* Billing address — street + apt (geocode-verified on blur) */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
        <Field className="sm:col-span-8">
          <Label className="text-xs">Billing address *</Label>
          <Input value={street} onChange={(e) => setStreet(e.target.value)} onBlur={() => av.run(billingReq)} required />
        </Field>
        <Field className="sm:col-span-4">
          <Label className="text-xs">Apt / Ste</Label>
          <Input value={line2} onChange={(e) => setLine2(e.target.value)} placeholder="Apt" />
        </Field>
      </div>

      {/* City / state / zip */}
      <div className="mt-3 grid grid-cols-12 gap-2">
        <Field className="col-span-12 sm:col-span-6">
          <Label className="text-xs">City *</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} onBlur={() => av.run(billingReq)} required />
        </Field>
        <Field className="col-span-6 sm:col-span-2">
          <Label className="text-xs">State *</Label>
          <Select value={state} onChange={(e) => setState(e.target.value)} onBlur={() => av.run(billingReq)} required>
            <option value="">--</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="col-span-6 sm:col-span-4">
          <Label className="text-xs">ZIP *</Label>
          <Input value={zip} onChange={(e) => setZip(e.target.value)} onBlur={() => av.run(billingReq)} inputMode="numeric" required />
        </Field>
      </div>

      <AddressSuggestion
        verify={av}
        typed={billingReq}
        onAccept={(a) => {
          setStreet(a.streetAddress);
          setCity(a.city);
          setState(a.state);
          setZip(a.zipCode);
        }}
      />

      <div className="mt-3.5 flex items-center justify-end gap-1.5">
        <Button plain size="xs" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button color="accent" size="xs" onClick={() => saveMutation.mutate()} disabled={!canSave || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

interface AccountDraft {
  industry: string;
  accountManager: AccountManagerValue | null;
  contractPricingTier: string;
}

function seedAccountDraft(c: Customer): AccountDraft {
  return {
    industry: c.industry ?? '',
    accountManager: c.accountManager ?? null,
    contractPricingTier: c.contractPricingTier ?? '',
  };
}

function isAccountDirty(d: AccountDraft, c: Customer): boolean {
  const seed = seedAccountDraft(c);
  return (
    d.industry.trim() !== seed.industry ||
    (d.accountManager?.id ?? null) !== (seed.accountManager?.id ?? null) ||
    d.contractPricingTier.trim() !== seed.contractPricingTier
  );
}

// Shared by all three variants (customer-add-edit.md): the writable customer-
// level fields — account manager, industry, pricebook, payment terms,
// tax-exempt + cert — flip into inputs with Save/Cancel inside the card.
// Identity/finance-derived rows (ID, lifetime value, since) stay read-only.
// CustomerShape is a render signal, not a displayed customer "type", so there's
// deliberately no Type row here.
export function AccountDetailsCard({
  customer,
  ar,
  canEdit = false,
}: {
  customer: Customer;
  ar?: CustomerArSummaryResponse;
  canEdit?: boolean;
}) {
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AccountDraft>(() => seedAccountDraft(customer));

  const startEdit = () => {
    setDraft(seedAccountDraft(customer));
    setEditing(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const request: UpdateCustomerRequest = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? null,
        type: customer.type,
        // Terms / tax-exempt / PO are edited in Billing & AR — preserve here.
        paymentTermsDays: customer.paymentTermsDays,
        requiresPurchaseOrder: customer.requiresPurchaseOrder,
        contractPricingTier: draft.contractPricingTier.trim() || null,
        taxExempt: customer.taxExempt,
        taxExemptCertificate: customer.taxExemptCertificate ?? null,
        notes: customer.notes ?? null,
        status: customer.status,
        accountManagerUserId: draft.accountManager?.id ?? null,
        industry: draft.industry.trim() || null,
      };
      return customerApi.update(customer.id, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setEditing(false);
      showSuccess('Account details updated');
    },
    onError: (err) => {
      if (handleConcurrentEdit(err, queryClient, ['customers'])) return;
      showError("Couldn't update account details", extractApiError(err) ?? undefined);
    },
  });

  const dirty = isAccountDirty(draft, customer);

  const rows: { k: string; v: React.ReactNode }[] = [
    { k: `${getName('customer')} ID`, v: <span className="font-mono">{customer.customerNumber || customer.id}</span> },
  ];
  if (customer.industry) rows.push({ k: 'Industry', v: customer.industry });
  if (customer.accountManager) rows.push({ k: 'Acct manager', v: customer.accountManager.name });
  // Terms / tax-exempt / PO are AR facts — they live in Billing & AR, not here.
  if (customer.contractPricingTier) rows.push({ k: 'Pricebook', v: customer.contractPricingTier });
  // FIN-1: lifetime value (total received) + most-used payment method.
  if (ar) rows.push({ k: 'Lifetime value', v: <span className="font-mono tabular-nums">{formatMoney(ar.lifetimeValue)}</span> });
  if (ar?.mostUsedPaymentMethod) rows.push({ k: 'Top pay method', v: PAYMENT_METHOD_LABEL[ar.mostUsedPaymentMethod] });
  rows.push({ k: 'Since', v: formatDateShort(customer.createdAt) });

  return (
    <Card
      title="Account details"
      padding="none"
      action={
        !editing && canEdit ? (
          <Button outline size="xs" type="button" onClick={startEdit}>
            Edit
          </Button>
        ) : undefined
      }
      footer={
        editing ? (
          <div className="flex items-center justify-end gap-1.5 rounded-b-[10px] border-t border-border-soft bg-bg-elev-2 px-3.5 py-2.5">
            <Button plain size="xs" type="button" onClick={() => setEditing(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button
              color="accent"
              size="xs"
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={!dirty || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        ) : undefined
      }
    >
      {editing ? (
        <div className="space-y-2.5 p-3.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Field size="xs">
              <Label size="xs">Industry</Label>
              <Input
                size="xs"
                value={draft.industry}
                onChange={(e) => setDraft((d) => ({ ...d, industry: e.target.value }))}
                placeholder="e.g., Restaurant"
              />
            </Field>
            <Field size="xs">
              <Label size="xs">Account manager</Label>
              <AccountManagerPicker
                value={draft.accountManager}
                onChange={(u) => setDraft((d) => ({ ...d, accountManager: u }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Field size="xs">
              <Label size="xs">Pricebook</Label>
              <Input
                size="xs"
                value={draft.contractPricingTier}
                onChange={(e) => setDraft((d) => ({ ...d, contractPricingTier: e.target.value }))}
                placeholder="—"
              />
            </Field>
          </div>
        </div>
      ) : (
        rows.map((r, i) => (
          <div
            key={r.k}
            className={`grid grid-cols-[94px_1fr] gap-2 px-3.5 py-1.5 text-[12px] ${i < rows.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <span className="text-fg-muted">{r.k}</span>
            <span className="font-medium text-fg-strong">{r.v}</span>
          </div>
        ))
      )}
    </Card>
  );
}
