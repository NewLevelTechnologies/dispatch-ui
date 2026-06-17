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
  PhoneIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/outline';
import {
  agreementApi,
  customerApi,
  dispatchRegionApi,
  equipmentApi,
  invoicesApi,
  userApi,
  EquipmentStatus,
  type Customer,
  type AgreementSummaryResponse,
  type CustomerArSummaryResponse,
  type CustomerAgreementSummaryResponse,
  type ArPaymentMethod,
  type UpdateCustomerRequest,
  type AddressVerifyRequest,
} from '../../api';
import { PatternFormat } from 'react-number-format';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError, showSuccess, extractApiError } from '../../lib/toast';
import { formatPhone } from '../../utils/formatPhone';
import { titleCaseAddress } from '../../utils/titleCaseAddress';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { Checkbox } from '../catalyst/checkbox';
import { Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { US_STATES } from '../../constants/states';
import { useAddressVerify } from '../../hooks/useAddressVerify';
import { AddressSuggestion } from '../AddressSuggestion';
import { Pill } from '../ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../ui/DenseTable';
import CustomerNotesCard from './CustomerNotesCard';
import { CardTitle, CardLink } from './shared';
import { formatDateShort, formatMoney } from './format';
import { buildAttentionItems, daysUntil, type AttentionItem } from './attention';

const PREVIEW_LIMIT = 8;

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
  const { data: equipmentPage } = useQuery({
    queryKey: ['equipment', { customerId: customer.id }],
    queryFn: () => equipmentApi.list({ customerId: customer.id, status: EquipmentStatus.ACTIVE, size: 100 }),
    enabled: !!customer.id,
  });
  const { data: regions } = useQuery({
    queryKey: ['dispatch-regions'],
    queryFn: () => dispatchRegionApi.getAll(true),
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

  const equipByLocation = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of equipmentPage?.content ?? []) {
      if (e.serviceLocationId) acc[e.serviceLocationId] = (acc[e.serviceLocationId] ?? 0) + 1;
    }
    return acc;
  }, [equipmentPage]);

  const regionMap = useMemo(() => {
    const list = (regions ?? []) as Array<{ id: string; name: string; abbreviation?: string | null }>;
    const m: Record<string, string> = {};
    for (const r of list) m[r.id] = r.abbreviation || r.name;
    return m;
  }, [regions]);

  const attentionItems = buildAttentionItems(agreements, arSummary, agreementSummary, customer.id);

  return (
    <div className="flex flex-col gap-3">
      {attentionItems.length > 0 && <AttentionStrip items={attentionItems} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <BillingCard customer={customer} ar={arSummary} />
          <LocationsPreviewCard
            customer={customer}
            regionMap={regionMap}
            equipByLocation={equipByLocation}
            onViewAll={onViewLocations}
          />
          <AgreementsSummaryCard agreements={agreements} summary={agreementSummary} onViewAll={onViewAgreements} />
          <CustomerNotesCard customerId={customer.id} canEdit={canEdit} />
        </div>

        <div className="flex flex-col gap-3">
          <ContactCard customer={customer} onViewAll={onViewContacts} />
          <AccountDetailsCard customer={customer} ar={arSummary} canEdit={canEdit} />
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

// Billing & AR — terms / pricebook / tax ride the detail payload; the
// outstanding headline + 5-bucket aging come from the FIN-1 summary (honest
// "—" until it resolves). Exported for reuse by SingleCustomerDetail.
export function BillingCard({ customer, ar }: { customer: Customer; ar?: CustomerArSummaryResponse }) {
  const termsLabel = customer.paymentTermsDays > 0 ? `Net ${customer.paymentTermsDays}` : '—';
  const buckets: { k: string; b: CustomerArSummaryResponse['current']; danger?: boolean }[] = ar
    ? [
        { k: 'Current', b: ar.current },
        { k: '1–30', b: ar.days1To30 },
        { k: '31–60', b: ar.days31To60 },
        { k: '61–90', b: ar.days61To90 },
        { k: '91+', b: ar.days91Plus, danger: true },
      ]
    : [];
  return (
    <Card title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Billing &amp; AR</CardTitle>} padding="none">
      <div className="p-3.5">
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
          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {buckets.map(({ k, b, danger }) => {
              const hot = danger && b.amount > 0;
              return (
                <div
                  key={k}
                  className="rounded-md border border-border-soft px-1.5 py-1.5 text-center"
                  style={hot ? { background: 'color-mix(in oklch, var(--danger-500) 8%, transparent)', borderColor: 'color-mix(in oklch, var(--danger-500) 30%, transparent)' } : undefined}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-fg-muted">{k}</div>
                  <div
                    className="mt-0.5 font-mono text-[12px] font-bold tabular-nums"
                    style={{ color: hot ? 'var(--danger-500)' : b.amount > 0 ? 'var(--fg-strong)' : 'var(--fg-dim)' }}
                  >
                    {formatMoney(b.amount)}
                  </div>
                  <div className="text-[10px] text-fg-dim">{b.count} inv</div>
                </div>
              );
            })}
          </div>
        )}

        {ar && ar.days91Plus.count > 0 && ar.oldestPastDueInvoiceDate && (
          <div className="mt-2 text-[11px]" style={{ color: 'var(--danger-500)' }}>
            Oldest past due {formatDateShort(ar.oldestPastDueInvoiceDate)}
          </div>
        )}

        <div className="my-3.5 h-px bg-border-soft" />
        <div className="grid grid-cols-3 gap-5">
          <div>
            <LabelTiny>Terms</LabelTiny>
            <div className="mt-0.5 text-[13px] font-semibold text-fg-strong">{termsLabel}</div>
            {customer.requiresPurchaseOrder && <div className="text-[11px] text-fg-muted">PO required</div>}
          </div>
          <div>
            <LabelTiny>Pricebook</LabelTiny>
            <div className="mt-0.5 text-[13px] font-semibold text-fg-strong">
              {customer.contractPricingTier || '—'}
            </div>
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
      </div>
    </Card>
  );
}

function LocationsPreviewCard({
  customer,
  regionMap,
  equipByLocation,
  onViewAll,
}: {
  customer: Customer;
  regionMap: Record<string, string>;
  equipByLocation: Record<string, number>;
  onViewAll: () => void;
}) {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const total = customer.serviceLocations.length;
  const top = customer.serviceLocations.slice(0, PREVIEW_LIMIT);
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
            <th>{getName('dispatch_region')}</th>
            {enriched && <th className="right">Open</th>}
            <th className="right">{getName('equipment')}</th>
            <th>Status</th>
          </tr>
        </DenseTHead>
        <tbody>
          {top.map((l) => {
            const region = l.dispatchRegionName ?? regionMap[l.dispatchRegionId];
            const equip = equipByLocation[l.id] ?? 0;
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
                <td className="muted">{region || '—'}</td>
                {enriched && (
                  <td className="right num strong">
                    {l.openJobsCount && l.openJobsCount > 0 ? (
                      l.openJobsCount
                    ) : (
                      <span className="text-fg-dim">—</span>
                    )}
                  </td>
                )}
                <td className="right num strong">{equip > 0 ? equip : <span className="text-fg-dim">—</span>}</td>
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
function AgreementsSummaryCard({
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
          <div className="flex items-center justify-between gap-4 border-b border-border-soft px-3.5 py-2.5">
            <div>
              <LabelTiny>Active</LabelTiny>
              <div className="mt-0.5 text-[15px] font-bold text-fg-strong">
                {active.length}
                <span className="ml-1 text-[12px] font-medium text-fg-muted">
                  of {agreements.length} {getName('agreement', true).toLowerCase()}
                </span>
              </div>
            </div>
            {summary ? (
              <div className="text-right">
                <div className="font-mono text-[15px] font-bold tabular-nums text-fg-strong">
                  {formatMoney(summary.arr)}
                  <span className="ml-0.5 text-[11px] font-medium text-fg-muted">/yr</span>
                </div>
                <div className="text-[11px] text-fg-muted">
                  {summary.coveragePct}% covered · {summary.coveredLocations}/{summary.totalLocations} {getName('service_location', true).toLowerCase()}
                </div>
              </div>
            ) : (
              <div className="text-right text-[11px] text-fg-muted">ARR &amp; coverage loading…</div>
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

function ContactCard({ customer, onViewAll }: { customer: Customer; onViewAll: () => void }) {
  const extraContacts = customer.additionalContacts.length;
  return (
    <Card
      title={<CardTitle icon={<UserIcon className="size-3.5" />}>Contact</CardTitle>}
      action={extraContacts > 0 ? <CardLink onClick={onViewAll}>View all →</CardLink> : undefined}
      padding="none"
    >
      <div className="space-y-2 px-3.5 py-3">
        {customer.email && (
          <a
            href={`mailto:${customer.email}`}
            className="flex items-center gap-2 text-[12.5px] text-fg-accent hover:underline"
          >
            <EnvelopeIcon className="size-3.5 shrink-0 text-fg-muted" />
            <span className="break-all">{customer.email}</span>
          </a>
        )}
        {customer.phone ? (
          <a
            href={`tel:${customer.phone.replace(/\D/g, '')}`}
            className="flex items-center gap-2 font-mono text-[12.5px] text-fg-accent hover:underline"
          >
            <PhoneIcon className="size-3.5 shrink-0 text-fg-muted" />
            {formatPhone(customer.phone)}
          </a>
        ) : null}
        {extraContacts > 0 && (
          <div className="pt-1 text-[11px] text-fg-muted">
            {extraContacts} additional {extraContacts === 1 ? 'contact' : 'contacts'}
          </div>
        )}
        {!customer.email && !customer.phone && extraContacts === 0 && (
          <div className="text-[12px] text-fg-muted">No contact on file.</div>
        )}
      </div>
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
      };
      await customerApi.update(customer.id, request);

      // Billing address rides a separate endpoint — only call it when moved.
      const a = customer.billingAddress;
      const addressChanged =
        street !== a.streetAddress ||
        line2 !== (a.streetAddressLine2 ?? '') ||
        city !== a.city ||
        state !== a.state ||
        zip !== a.zipCode;
      if (addressChanged) {
        await customerApi.updateBillingAddress(customer.id, {
          billingAddress: {
            streetAddress: street.trim(),
            streetAddressLine2: line2.trim() || null,
            city: city.trim(),
            state,
            zipCode: zip.trim(),
            ...(av.coordsFor(billingReq) ?? {}),
          },
        });
      }
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
    onError: (err) => showError("Couldn't save customer", extractApiError(err) ?? undefined),
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
  accountManagerUserId: string;
  contractPricingTier: string;
  paymentTermsDays: number;
  taxExempt: boolean;
  taxExemptCertificate: string;
}

function seedAccountDraft(c: Customer): AccountDraft {
  return {
    industry: c.industry ?? '',
    accountManagerUserId: c.accountManager?.id ?? '',
    contractPricingTier: c.contractPricingTier ?? '',
    paymentTermsDays: c.paymentTermsDays,
    taxExempt: c.taxExempt,
    taxExemptCertificate: c.taxExemptCertificate ?? '',
  };
}

function isAccountDirty(d: AccountDraft, c: Customer): boolean {
  const seed = seedAccountDraft(c);
  return (
    d.industry.trim() !== seed.industry ||
    d.accountManagerUserId !== seed.accountManagerUserId ||
    d.contractPricingTier.trim() !== seed.contractPricingTier ||
    d.paymentTermsDays !== seed.paymentTermsDays ||
    d.taxExempt !== seed.taxExempt ||
    (d.taxExempt && d.taxExemptCertificate.trim() !== seed.taxExemptCertificate)
  );
}

// Exported (+ `typeLabel`) for reuse by SingleCustomerDetail ("Single-site")
// and PayerDetail ("Payer"). Editable in place (customer-add-edit.md): the
// writable customer-level fields — account manager, industry, pricebook,
// payment terms, tax-exempt + cert — flip into inputs with Save/Cancel inside
// the card. Identity/finance-derived rows (ID, type, lifetime value, since)
// stay read-only. Shared, so the editor lands on all three variants at once.
export function AccountDetailsCard({
  customer,
  ar,
  typeLabel = 'Multi-site',
  canEdit = false,
}: {
  customer: Customer;
  ar?: CustomerArSummaryResponse;
  typeLabel?: string;
  canEdit?: boolean;
}) {
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AccountDraft>(() => seedAccountDraft(customer));

  // Account-manager picker source — only fetched once the card enters edit mode.
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll(), enabled: editing });
  const managerOptions = useMemo(
    () =>
      (users ?? [])
        .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`.trim() || u.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [users],
  );

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
        paymentTermsDays: draft.paymentTermsDays,
        requiresPurchaseOrder: customer.requiresPurchaseOrder,
        contractPricingTier: draft.contractPricingTier.trim() || null,
        taxExempt: draft.taxExempt,
        taxExemptCertificate: draft.taxExempt ? draft.taxExemptCertificate.trim() || null : null,
        notes: customer.notes ?? null,
        status: customer.status,
        accountManagerUserId: draft.accountManagerUserId || null,
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
    onError: (err) => showError("Couldn't update account details", extractApiError(err) ?? undefined),
  });

  const dirty = isAccountDirty(draft, customer);

  const rows: { k: string; v: React.ReactNode }[] = [
    { k: `${getName('customer')} ID`, v: <span className="font-mono">{customer.customerNumber || customer.id}</span> },
    { k: 'Type', v: typeLabel },
  ];
  if (customer.industry) rows.push({ k: 'Industry', v: customer.industry });
  if (customer.accountManager) rows.push({ k: 'Acct manager', v: customer.accountManager.name });
  rows.push({ k: 'Terms', v: customer.paymentTermsDays > 0 ? `Net ${customer.paymentTermsDays}` : '—' });
  if (customer.contractPricingTier) rows.push({ k: 'Pricebook', v: customer.contractPricingTier });
  rows.push({
    k: 'Tax exempt',
    v: customer.taxExempt
      ? customer.taxExemptCertificate
        ? <span>Yes · <span className="font-mono text-fg-muted">{customer.taxExemptCertificate}</span></span>
        : 'Yes'
      : 'No',
  });
  if (customer.requiresPurchaseOrder) rows.push({ k: 'PO', v: 'Required' });
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
              <Select
                value={draft.accountManagerUserId}
                onChange={(e) => setDraft((d) => ({ ...d, accountManagerUserId: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
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
