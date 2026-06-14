/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/separators/short operational labels stay literal to keep the markup readable (same convention as ServiceLocationDetailPage). */
// MULTI customer Overview — the billing-hub view. Left rail = lookup surfaces
// (Billing & AR · Locations preview · Agreements summary · Notes); right rail =
// identity/reference (Contact · Account details). Tags now live on the header
// (CustomerHeaderTags); a full Activity feed is still absent until its backend
// read exists (see BACKEND_ASKS ACT-1).
//
// Degrade-honestly contract: every surface that depends on the missing finance
// layer (AR aging, outstanding, LTV, ARR, coverage %, per-location next-visit /
// open-jobs / balance) renders a real "—" / pending note rather than a faked
// number. What IS on the customer detail payload (terms, tax, pricebook,
// locations, equipment-by-location, agreements list, notes) is wired for real.
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
  dispatchRegionApi,
  equipmentApi,
  EquipmentStatus,
  type Customer,
  type AgreementSummaryResponse,
} from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { formatPhone } from '../../utils/formatPhone';
import { titleCaseAddress } from '../../utils/titleCaseAddress';
import { Card } from '../catalyst/card';
import { Button } from '../catalyst/button';
import { Pill } from '../ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../ui/DenseTable';
import CustomerNotesCard from './CustomerNotesCard';
import { CardTitle, CardLink } from './shared';
import { formatDateShort } from './format';

const PREVIEW_LIMIT = 8;

// Whole days from now to a YYYY-MM-DD (or ISO) date. App-runtime clock is fine.
function daysUntil(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

type AttentionItem = { key: string; title: string; sub: string; action: string; to: string };

// Only the agreement-renewal rule fires today — it's derivable from the
// agreements list already loaded for the tab count (termEnd on each row). The
// AR-aging (91+ bucket) and overdue-visit rules are part of the design but
// blocked on the finance + scheduling denorm reads; their insertion point is
// here. Quiet (unrendered) when nothing fires — healthy accounts get a clean
// page, not a "nothing to do" stub.
function buildAttentionItems(agreements: AgreementSummaryResponse[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const a of agreements) {
    if (a.status !== 'ACTIVE' || !a.termEnd) continue;
    const days = daysUntil(a.termEnd);
    if (days != null && days > 0 && days < 30) {
      items.push({
        key: `renew-${a.id}`,
        title: `${a.name} renews in ${days} ${days === 1 ? 'day' : 'days'}`,
        sub: a.agreementNumber,
        action: 'Review',
        to: `/agreements/${a.id}?from=customer`,
      });
    }
  }
  return items;
}

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

  const attentionItems = buildAttentionItems(agreements);

  return (
    <div className="flex flex-col gap-3">
      {attentionItems.length > 0 && <AttentionStrip items={attentionItems} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <BillingCard customer={customer} />
          <LocationsPreviewCard
            customer={customer}
            regionMap={regionMap}
            equipByLocation={equipByLocation}
            onViewAll={onViewLocations}
          />
          <AgreementsSummaryCard agreements={agreements} onViewAll={onViewAgreements} />
          <CustomerNotesCard customerId={customer.id} canEdit={canEdit} />
        </div>

        <div className="flex flex-col gap-3">
          <ContactCard customer={customer} onViewAll={onViewContacts} />
          <AccountDetailsCard customer={customer} />
        </div>
      </div>
    </div>
  );
}

function AttentionStrip({ items }: { items: AttentionItem[] }) {
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

// Billing & AR — terms / pricebook / tax are real on the payload; the
// outstanding headline + aging buckets are blocked on the finance-service
// summary read and render an honest pending state (see BACKEND_ASKS FIN-1).
function BillingCard({ customer }: { customer: Customer }) {
  const termsLabel = customer.paymentTermsDays > 0 ? `Net ${customer.paymentTermsDays}` : '—';
  return (
    <Card title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Billing &amp; AR</CardTitle>} padding="none">
      <div className="p-3.5">
        <div>
          <LabelTiny>Outstanding balance</LabelTiny>
          <div className="mt-0.5 font-mono text-[20px] font-bold tabular-nums text-fg-dim">—</div>
          <div className="text-[11px] text-fg-muted">AR aging &amp; balance pending finance integration</div>
        </div>
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
  const { t } = useTranslation();
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
            <th>{getName('dispatch')} {t('entities.region')}</th>
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

// Condensed strategic summary — count + nearest renewal. ARR + coverage % are
// part of the design but need the billing-schedule + coverage reads per
// agreement (see BACKEND_ASKS AG-1); shown as a pending note, not faked.
function AgreementsSummaryCard({
  agreements,
  onViewAll,
}: {
  agreements: AgreementSummaryResponse[];
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
            <div className="text-right text-[11px] text-fg-muted">ARR &amp; coverage pending</div>
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

function AccountDetailsCard({ customer }: { customer: Customer }) {
  const { getName } = useGlossary();
  const rows: { k: string; v: React.ReactNode }[] = [
    { k: `${getName('customer')} ID`, v: <span className="font-mono">{customer.customerNumber || customer.id}</span> },
    { k: 'Type', v: 'Multi-site' },
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
  rows.push({ k: 'Since', v: formatDateShort(customer.createdAt) });

  return (
    <Card title="Account details" padding="none">
      {rows.map((r, i) => (
        <div
          key={r.k}
          className={`grid grid-cols-[94px_1fr] gap-2 px-3.5 py-1.5 text-[12px] ${i < rows.length - 1 ? 'border-b border-border-soft' : ''}`}
        >
          <span className="text-fg-muted">{r.k}</span>
          <span className="font-medium text-fg-strong">{r.v}</span>
        </div>
      ))}
    </Card>
  );
}
