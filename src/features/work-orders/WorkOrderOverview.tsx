// Work Order detail — Overview tab (redesign anchor).
//
// Reads top-to-bottom as the answer to "what's happening with this job":
//   1. attention strip   — derived, ordered live → blocker → money; self-hides
//   2. left column        — work-items peek · trip strip · notes · activity teaser
//   3. right rail (340)   — Location card (site/access) · Money card (payer rollup)
//
// Per the WO cluster handoff: location-led, customer-as-payer; the WO owns no
// line items — Money is a DERIVED rollup over documents. Built to the same
// shell conventions as MultiOverviewTab (CardTitle/CardLink headers, .label-tiny,
// Pill/Tag/Avatar). Fields not yet on the wire degrade gracefully:
//   • work_item diagnosis/parts/laborHrs/tripIds  → readiness line omitted
//   • dispatch addressedWorkItemIds / live GPS     → no addressed tags / no ETA bar
//   • financial documents[] / approved             → rollup only, no doc list
//   • payer membership tier                        → badge omitted
//
// i18n: entity names route through getName(); a follow-up pass extracts the
// remaining literal microcopy into workOrders.detail.overview.* keys.
import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  MapPinIcon,
  CurrencyDollarIcon,
  WrenchScrewdriverIcon,
  TruckIcon,
  PhoneIcon,
  ClockIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import {
  activityApi,
  type WorkOrder,
  type WorkItemResponse,
  type WorkOrderFinancialSummary,
  type Dispatch,
  type DispatchBoardRow,
  type DispatchStatus,
  type ServiceLocationDetailDto,
  type ProgressCategory,
} from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Card } from '../../components/catalyst/card';
import { CardTitle, CardLink } from '../../components/customer-detail/shared';
import { Pill, Tag } from '../../components/ui/Pill';
import { workItemLabel } from '../../utils/workItemLabel';
import { Avatar } from '../../components/ui/Avatar';
import NotesCard from '../../components/NotesCard';
import EquipmentThumbnail from '../../components/EquipmentThumbnail';
import { ActivityRow } from '../../components/ActivityStream';
import { formatPhone } from '../../utils/formatPhone';
import { titleCaseAddress } from '../../utils/titleCaseAddress';
import { tripsByWorkItem } from '../../utils/tripsByWorkItem';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = (n: number) => moneyFmt.format(n);
const num = (s: string | number | null | undefined): number => {
  if (s == null) return 0;
  const n = typeof s === 'number' ? s : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

// statusCategory → Pill tone. Mirrors the header progress pill mapping; the
// work-item peek and the WO progress share one visual grammar.
const PROGRESS_TONE: Record<ProgressCategory, PillTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'violet',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

// Dispatch (trip) status → { tone, label, live }. IN_PROGRESS is the live
// state (tech on site / working); there's no separate en-route state and no
// GPS signal, so the strip leads with self-reported status, never a fake ETA.
const DISPATCH_PRESENTATION: Record<DispatchStatus, { tone: PillTone; label: string; live?: boolean }> = {
  SCHEDULED: { tone: 'info', label: 'Scheduled' },
  EN_ROUTE: { tone: 'violet', label: 'En route', live: true },
  IN_PROGRESS: { tone: 'violet', label: 'On site', live: true },
  COMPLETED: { tone: 'success', label: 'Completed' },
  NO_SHOW: { tone: 'warning', label: 'No show' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

// En route + on site both count as "live now".
const isLiveDispatch = (s: DispatchStatus) => s === 'EN_ROUTE' || s === 'IN_PROGRESS';

// ── Same-day arrival window: "Fri 8–10 AM"; cross-date degrades to both sides.
const ETA_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const ETA_TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return `${ETA_DATE.format(start)} ${ETA_TIME.format(start)}–${ETA_TIME.format(end)}`;
  return `${ETA_DATE.format(start)} ${ETA_TIME.format(start)} – ${ETA_DATE.format(end)} ${ETA_TIME.format(end)}`;
}

// Warranty pill state from the equipment summary's parts-coverage expiry
// (equipment.warrantyExpiresAt — already on the wire). Future = covered, past =
// expired, absent/unparseable = no pill (never fabricate coverage).
function warrantyState(expiresAt?: string | null): 'covered' | 'expired' | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return null;
  return ms >= Date.now() ? 'covered' : 'expired';
}

function firstNameLastInitial(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// ── Attention items — derived, ordered live → blocker → money. Self-hides when
// empty. Mirrors woAttentionItems() from the mock; the PO link on the blocker
// is deferred until work-item parts/PO land (BE ask #1 + procurement).
interface AttentionItem {
  key: string;
  severity: 'live' | 'warning' | 'money';
  title: string;
  sub: string;
  actionLabel: string;
  onAction: () => void;
}

function deriveAttention(args: {
  workOrder: WorkOrder;
  dispatches: DispatchBoardRow[];
  summary?: WorkOrderFinancialSummary;
  onOpenTab: (tab: string) => void;
  onOpenFinancial: (tab: 'invoices' | 'quotes') => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  getName: (code: string, plural?: boolean) => string;
}): AttentionItem[] {
  const { workOrder, dispatches, summary, onOpenTab, onOpenFinancial, t, getName } = args;
  const items: AttentionItem[] = [];

  const live = dispatches.find((d) => isLiveDispatch(d.status));
  if (live) {
    items.push({
      key: 'live',
      severity: 'live',
      title: t('workOrders.detail.overview.attnLive', { name: firstNameLastInitial(live.assignedUserName) }),
      sub: formatWindow(live.arrivalWindowStart, live.arrivalWindowEnd),
      actionLabel: t('workOrders.detail.overview.view', { entity: getName('dispatch') }),
      onAction: () => onOpenTab('trips'),
    });
  }

  const blocked = (workOrder.workItems ?? []).find((wi) => wi.statusCategory === 'BLOCKED');
  if (blocked) {
    items.push({
      key: 'blocked',
      severity: 'warning',
      title: t('workOrders.progress.blocked'),
      sub: blocked.description,
      actionLabel: t('workOrders.detail.overview.view', { entity: getName('work_item') }),
      onAction: () => onOpenTab('items'),
    });
  }

  const balance = num(summary?.balance);
  if (balance > 0) {
    const paid = num(summary?.paid);
    items.push({
      key: 'money',
      severity: 'money',
      title: t('workOrders.detail.overview.balanceDue', { amount: money(balance) }),
      sub:
        paid > 0
          ? t('workOrders.detail.overview.collectedAmount', { amount: money(paid) })
          : t('workOrders.detail.overview.quoteApproved', { entity: getName('quote') }),
      actionLabel: t('workOrders.detail.overview.view', { entity: getName('invoice', true) }),
      onAction: () => onOpenFinancial('invoices'),
    });
  }

  return items;
}

function AttentionStrip({ items }: { items: AttentionItem[] }) {
  const { t } = useTranslation();
  return (
    <Card padding="none">
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2">
        <span className="label-tiny text-fg">{t('workOrders.detail.overview.needsAttention')}</span>
        <Tag>{items.length}</Tag>
      </div>
      <div>
        {items.map((it, i) => {
          const rail =
            it.severity === 'warning'
              ? 'var(--warning-500)'
              : it.severity === 'money'
                ? 'var(--accent-500)'
                : 'var(--info-500)';
          return (
            <div
              key={it.key}
              className="relative flex items-center gap-2.5 py-2.5 pl-3.5 pr-3"
              style={{ borderBottom: i === items.length - 1 ? 'none' : '1px solid var(--border-soft)' }}
            >
              <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-sm" style={{ background: rail }} />
              {it.severity === 'live' && <Pill tone="info" dot live>LIVE</Pill>}
              <div className="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                  className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold"
                  style={{ color: it.severity === 'warning' ? 'var(--warning-fg)' : 'var(--fg-strong)' }}
                >
                  {it.title}
                </span>
                <span className="truncate text-[11.5px] text-fg-muted">{it.sub}</span>
              </div>
              <CardLink onClick={it.onAction}>{it.actionLabel} →</CardLink>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Work-items peek — one compact row per item, built to the mock's
// ItemOverviewRow: EQUIPMENT is the anchor (or the attach prompt when none is
// linked), the complaint reads as the calm note beneath, and a footer carries
// readiness + which trips cover it. Full diagnosis/parts table is on the Work
// items tab. Fields not yet on the wire degrade: no warranty pill, no repeat-
// repair line, no parts/labor readiness (BE ask #1), no explicit "no equipment
// needed" state (needs a work_item.eqNeeded flag).
function WorkItemsPeek({
  workOrder,
  tripsByWorkItem,
  onAdd,
  onOpenItems,
}: {
  workOrder: WorkOrder;
  tripsByWorkItem: Map<string, number[]>;
  onAdd: () => void;
  onOpenItems: (workItemId: string) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const items = workOrder.workItems ?? [];
  return (
    <Card
      title={<CardTitle icon={<WrenchScrewdriverIcon className="size-3.5" />}>{getName('work_item', true)}</CardTitle>}
      action={<CardLink onClick={onAdd}>{`+ ${getName('work_item')}`}</CardLink>}
      padding="none"
    >
      {items.length === 0 ? (
        <div className="px-3.5 py-6 text-center text-[12.5px] text-fg-muted">
          {t('common.actions.noEntitiesYet', { entities: getName('work_item', true) })}
        </div>
      ) : (
        items.map((wi, i) => (
          <WorkItemPeekRow
            key={wi.id}
            wi={wi}
            trips={tripsByWorkItem.get(wi.id) ?? []}
            last={i === items.length - 1}
            onClick={() => onOpenItems(wi.id)}
          />
        ))
      )}
    </Card>
  );
}

function WorkItemPeekRow({
  wi,
  trips,
  last,
  onClick,
}: {
  wi: WorkItemResponse;
  trips: number[];
  last: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const { getAbbrev } = useGlossary();
  const tone = PROGRESS_TONE[wi.statusCategory];
  const rail =
    tone === 'warning'
      ? 'var(--warning-500)'
      : tone === 'violet'
        ? 'var(--violet-500)'
        : tone === 'success'
          ? 'var(--success-500)'
          : 'var(--info-500)';
  const eq = wi.equipment;
  const wiId = wi.sequence != null ? workItemLabel(getAbbrev('work_item'), wi.sequence) : null;
  const makeModel = eq ? [eq.make, eq.model].filter(Boolean).join(' ') : '';
  const warranty = warrantyState(eq?.warrantyExpiresAt);
  // Equipment tri-state (only when no unit is linked): needs-attachment (the
  // default — accent prompt) vs. explicitly none-needed (calm "No equipment").
  // `equipmentNeeded === false` is the dismissed state; undefined → true.
  const noneNeeded = !eq && wi.equipmentNeeded === false;
  // Readiness: parts/labor aren't on the wire yet, so the only honest signal is
  // whether a tech has assessed it. Show the "not yet diagnosed" prompt until
  // diagnosis lands; once diagnosed, omit (the parts/labor rollup fills this
  // slot when BE ask #1 ships).
  const diagnosed = !!wi.diagnosis?.trim();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-start gap-3 py-3 pl-3.5 pr-4 text-left hover:bg-bg-hover"
      style={{ borderBottom: last ? 'none' : '1px solid var(--border-soft)', borderLeft: `3px solid ${rail}` }}
    >
      {/* Equipment recognition anchor — profile photo or type monogram, shown
          only when a unit is attached (48px), matching the mock's overview row. */}
      {eq && (
        <EquipmentThumbnail
          url={eq.profileImageUrl}
          name={eq.name}
          type={eq.equipmentTypeName}
          monogram
          sizeClass="size-12"
          fit="contain"
          className="mt-0.5"
        />
      )}
      <div className="min-w-0 flex-1">
        {/* Anchor line — equipment identity, attach affordance, or (when no unit
            is needed) the complaint itself + WI-id + status. The scannable frame;
            the raw complaint reads calm beneath it, except in the none-needed
            state where it's already serving as the anchor. */}
        <div className="flex items-baseline gap-2">
          {eq ? (
            <span className="min-w-0 text-[13px] font-semibold text-fg-strong">
              {eq.name}
              {makeModel && <span className="font-normal text-fg-muted"> · {makeModel}</span>}
            </span>
          ) : noneNeeded ? (
            <span className="min-w-0 line-clamp-2 text-[13px] font-semibold text-fg-strong">{wi.description}</span>
          ) : (
            <span className="flex items-center gap-1 text-[12.5px] font-semibold text-fg-accent">
              <PlusIcon className="size-3" />
              {t('workOrders.detail.overview.attachEquipment')}
            </span>
          )}
          {wiId && (
            <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] font-semibold text-fg-dim">{wiId}</span>
          )}
          <span className="flex-1" />
          {warranty && (
            <Pill tone={warranty === 'covered' ? 'success' : 'neutral'} dot>
              {warranty === 'covered'
                ? t('workOrders.detail.overview.warrantyCovered')
                : t('workOrders.detail.overview.warrantyExpired')}
            </Pill>
          )}
          {noneNeeded && (
            <span className="shrink-0 whitespace-nowrap text-[11px] text-fg-dim">
              {t('workOrders.detail.overview.noEquipment')}
            </span>
          )}
          <Pill tone={tone} dot>{wi.statusCategory.replace(/_/g, ' ').toLowerCase()}</Pill>
        </div>
        {/* The complaint — regular weight, calm, clamped to 2 lines so a long
            dictated dump never dominates. Full text on the Work items tab.
            Suppressed in the none-needed state (it's already the anchor). */}
        {!noneNeeded && (
          <div className="mt-[5px] line-clamp-2 text-[12.5px] leading-normal text-fg">{wi.description}</div>
        )}
        {/* Footer — readiness · trips covering this item · Details. */}
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-fg-muted">
          {!diagnosed && (
            <>
              <span>{t('workOrders.detail.overview.notYetDiagnosed')}</span>
              <span className="text-fg-dim" aria-hidden>·</span>
            </>
          )}
          <span className="flex items-center gap-1">
            <TruckIcon className="size-3" />
            {trips.length > 0 ? (
              trips.map((n, i) => (
                <span key={n}>
                  {i > 0 && ', '}
                  {t('workOrders.detail.overview.tripShort', { n })}
                </span>
              ))
            ) : (
              <span className="text-fg-dim">{t('workOrders.detail.notScheduled')}</span>
            )}
          </span>
          <span className="flex-1" />
          <span className="font-semibold text-fg-accent">{t('workOrders.detail.overview.details')}</span>
        </div>
      </div>
    </button>
  );
}

// ── Trip strip — compact assignment rail, live-first → upcoming → completed.
// Horizontal-scroll so many trips slide rather than crush.
function TripStrip({
  dispatches,
  wiLabelById,
  onSchedule,
  onSelect,
}: {
  dispatches: DispatchBoardRow[];
  wiLabelById: Map<string, string>;
  onSchedule: () => void;
  onSelect: (d: Dispatch) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const visible = dispatches.filter((d) => d.status !== 'CANCELLED');
  const ordered = [...visible].sort((a, b) => {
    const rank = (d: Dispatch) => (isLiveDispatch(d.status) ? 0 : d.status === 'COMPLETED' ? 2 : 1);
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    const ta = new Date(a.arrivalWindowStart).getTime();
    const tb = new Date(b.arrivalWindowStart).getTime();
    return ra === 2 ? tb - ta : ta - tb; // completed: most recent first; else soonest first
  });

  const done = visible.filter((d) => d.status === 'COMPLETED').length;
  const inFlight = visible.filter((d) => isLiveDispatch(d.status)).length;
  const scheduled = visible.filter((d) => d.status === 'SCHEDULED').length;

  return (
    <Card
      title={<CardTitle icon={<TruckIcon className="size-3.5" />}>{getName('dispatch', true)}</CardTitle>}
      action={
        visible.length > 0 ? (
          // Designer places the done/in-flight/scheduled count inline on the
          // header row, just left of the schedule action (not a body line).
          <div className="flex items-center gap-2 text-[11px] text-fg-muted">
            <span>{t('workOrders.detail.overview.tripCounts', { done, inFlight, scheduled })}</span>
            <span aria-hidden>·</span>
            <CardLink onClick={onSchedule}>{t('workOrders.detail.overview.scheduleTrip')}</CardLink>
          </div>
        ) : (
          <CardLink onClick={onSchedule}>{t('workOrders.detail.overview.scheduleTrip')}</CardLink>
        )
      }
    >
      {visible.length === 0 ? (
        <div className="py-2 text-center text-[12.5px] text-fg-muted">
          {t('common.actions.noEntitiesYet', { entities: getName('dispatch', true) })}
        </div>
      ) : (
        <div className="flex items-stretch gap-2 overflow-x-auto pb-0.5">
          {ordered.map((d) => (
            <TripCell key={d.id} d={d} wiLabelById={wiLabelById} onSelect={onSelect} />
          ))}
        </div>
      )}
    </Card>
  );
}

function TripCell({
  d,
  wiLabelById,
  onSelect,
}: {
  d: DispatchBoardRow;
  wiLabelById: Map<string, string>;
  onSelect: (d: Dispatch) => void;
}) {
  const p = DISPATCH_PRESENTATION[d.status];
  const accent =
    d.status === 'COMPLETED' ? 'var(--success-500)' : p.live ? 'var(--violet-500)' : 'var(--info-500)';
  const name = d.assignedUserName;
  // Which work items this trip covers, as "WI-01" chips (empty = whole WO).
  const addressedLabels = (d.addressedWorkItemIds ?? [])
    .map((id) => wiLabelById.get(id))
    .filter((l): l is string => !!l);
  // Cap the cell width so a lone dispatch stays card-sized + left-aligned
  // rather than stretching full-width like a banner; several cells share the
  // row and scroll (mock: flex 1 1 200px, max-width 320).
  return (
    <button
      type="button"
      onClick={() => onSelect(d)}
      className="min-w-0 shrink-0 grow basis-[200px] max-w-[320px] cursor-pointer rounded-sm border border-border p-2.5 text-left hover:bg-bg-hover"
      style={{
        borderLeft: `3px solid ${accent}`,
        background: p.live ? 'color-mix(in oklch, var(--violet-500) 6%, var(--bg-elev))' : 'var(--bg-elev)',
      }}
    >
      <div className="flex items-center gap-1.5">
        <Pill tone={p.tone} dot live={p.live}>{p.label}</Pill>
        <span className="flex-1" />
        <span className="whitespace-nowrap text-[10.5px] text-fg-muted">
          {ETA_DATE.format(new Date(d.arrivalWindowStart))}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5">
        {name && <Avatar name={name} size="sm" />}
        <span className="truncate text-[11.5px] font-medium text-fg-strong">{firstNameLastInitial(name)}</span>
        <span className="flex-1" />
        <span className="whitespace-nowrap text-[10.5px] text-fg-muted">
          {ETA_TIME.format(new Date(d.arrivalWindowStart))}–{ETA_TIME.format(new Date(d.arrivalWindowEnd))}
        </span>
      </div>
      {addressedLabels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {addressedLabels.slice(0, 3).map((label) => (
            <span
              key={label}
              className="rounded-xs bg-bg-active px-1 py-px font-mono text-[9.5px] font-semibold text-fg-muted"
            >
              {label}
            </span>
          ))}
          {addressedLabels.length > 3 && (
            <span className="text-[9.5px] text-fg-dim">+{addressedLabels.length - 3}</span>
          )}
        </div>
      )}
    </button>
  );
}

// ── Location card — the operational anchor (site address + access + on-site
// contact + pinned site note). Reads the full ServiceLocationDetailDto, same
// source as the Location detail page; degrades per field when absent.
function LocationCard({
  location,
  fallbackContact,
}: {
  location: ServiceLocationDetailDto;
  fallbackContact?: { name?: string; phone?: string; email?: string };
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const addr = location.address;
  const gate = (location.arrivalFacts ?? []).find((f) =>
    /gate|code|lockbox/i.test(f.label),
  );
  const access = location.accessInstructions;
  const pinned = (location.notes ?? []).find((n) => n.pinned);

  const contactName = location.siteContactName || fallbackContact?.name;
  const contactPhone = location.siteContactPhone || fallbackContact?.phone;

  return (
    <Card
      title={<CardTitle icon={<MapPinIcon className="size-3.5" />}>{getName('service_location')}</CardTitle>}
      action={
        <CardLink to={`/service-locations/${location.id}`}>
          {t('workOrders.detail.overview.openLocation', { entity: getName('service_location') })}
        </CardLink>
      }
      padding="none"
    >
      <div className="border-b border-border-soft px-3.5 py-3">
        <div className="text-[13px] font-semibold text-fg-strong">{titleCaseAddress(addr.streetAddress)}</div>
        <div className="text-[12px] text-fg-muted">
          {titleCaseAddress(addr.city)}, {addr.state} {addr.zipCode}
        </div>
      </div>

      {(gate || access) && (
        <div className="grid grid-cols-[60px_1fr] items-center gap-x-2.5 gap-y-1.5 border-b border-border-soft px-3.5 py-2.5">
          {gate && (
            <>
              <span className="label-tiny">{gate.label}</span>
              <span className="justify-self-start rounded-xs bg-bg-active px-1.5 py-0.5 font-mono text-[12px] font-bold tracking-wide text-fg-strong">
                {gate.value}
              </span>
            </>
          )}
          {access && (
            <>
              <span className="label-tiny">{t('workOrders.detail.overview.access')}</span>
              <span className="text-[12px] text-fg-strong">{access}</span>
            </>
          )}
        </div>
      )}

      {(contactName || contactPhone) && (
        <div className="flex items-center gap-2.5 border-b border-border-soft px-3.5 py-2.5">
          {contactName && <Avatar name={contactName} size="sm" />}
          <div className="min-w-0 flex-1">
            {contactName && <div className="text-[12.5px] font-semibold text-fg-strong">{contactName}</div>}
            {contactPhone && (
              <a href={`tel:${contactPhone.replace(/\D/g, '')}`} className="font-mono text-[12px] font-semibold text-fg-accent no-underline">
                {formatPhone(contactPhone)}
              </a>
            )}
          </div>
          {contactPhone && (
            <a
              href={`tel:${contactPhone.replace(/\D/g, '')}`}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] text-fg-strong no-underline hover:bg-bg-hover"
            >
              <PhoneIcon className="size-3" /> {t('workOrders.detail.overview.call')}
            </a>
          )}
        </div>
      )}

      {pinned && (
        <div
          className="px-3.5 py-2.5"
          style={{
            background: 'color-mix(in oklch, var(--warning-500) 9%, var(--bg-elev))',
            borderLeft: '3px solid var(--warning-500)',
          }}
        >
          <div className="mb-1 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--warning-fg)' }}>
            <MapPinIcon className="size-3" /> {t('workOrders.detail.overview.pinned')}
          </div>
          <div className="text-[12px] leading-relaxed text-fg">{pinned.body}</div>
        </div>
      )}
    </Card>
  );
}

// ── Money card — derived rollup over the job's documents (the WO owns no line
// items). "Bills to" surfaces the payer; Quoted / Collected / Balance read off
// financialSummary. Membership badge + document list land with BE asks #2/#4.
function MoneyCard({
  workOrder,
  summary,
  onOpenInvoices,
  onOpenQuotes,
}: {
  workOrder: WorkOrder;
  summary?: WorkOrderFinancialSummary;
  onOpenInvoices: () => void;
  onOpenQuotes: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const customer = workOrder.customer;
  const quoted = num(summary?.quoted);
  const collected = num(summary?.paid);
  const balance = num(summary?.balance);

  return (
    <Card
      title={<CardTitle icon={<CurrencyDollarIcon className="size-3.5" />}>{t('workOrders.detail.overview.money')}</CardTitle>}
      action={
        <CardLink onClick={onOpenInvoices}>
          {t('workOrders.detail.overview.docsLink', {
            invoices: getName('invoice', true),
            quotes: getName('quote', true),
          })}
        </CardLink>
      }
    >
      {customer && (
        <div className="mb-2.5 flex items-center gap-2.5 border-b border-border-soft pb-2.5">
          <Avatar name={customer.name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="label-tiny">{t('workOrders.detail.overview.billsTo')}</div>
            <div className="text-[12.5px] font-semibold text-fg-strong">{customer.name}</div>
          </div>
          <CardLink to={`/customers/${customer.id}`}>{t('workOrders.detail.overview.profile')}</CardLink>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <RollupStat label={getName('quote')} value={money(quoted)} onClick={quoted > 0 ? onOpenQuotes : undefined} />
        <RollupStat label={t('workOrders.detail.overview.collected')} value={money(collected)} tone="success" />
        <RollupStat label={t('workOrders.detail.money.balance')} value={money(balance)} emphasis onClick={onOpenInvoices} />
      </div>
    </Card>
  );
}

function RollupStat({
  label,
  value,
  tone,
  emphasis,
  onClick,
}: {
  label: string;
  value: string;
  tone?: 'success';
  emphasis?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="label-tiny mb-0.5">{label}</div>
      <div
        className="font-mono text-[14px] font-bold tabular-nums"
        style={{ color: tone === 'success' ? 'var(--success-500)' : 'var(--fg-strong)' }}
      >
        {value}
      </div>
    </>
  );
  const cls = 'rounded-sm px-2 py-1.5 text-left';
  const style: React.CSSProperties = emphasis
    ? {
        background: 'color-mix(in oklch, var(--accent-500) 8%, var(--bg-elev))',
        border: '1px solid color-mix(in oklch, var(--accent-500) 30%, var(--border))',
      }
    : { background: 'var(--bg-elev-2)', border: '1px solid var(--border-soft)' };
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer transition-colors hover:brightness-95`} style={style}>
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}

// ── Activity teaser — last few audit events + "View all → Activity tab".
// Reuses ActivityStream's ActivityRow so formatting stays identical.
function ActivityTeaser({ workOrderId, onViewAll }: { workOrderId: string; onViewAll: () => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['work-order-activity', workOrderId, 'teaser'],
    queryFn: () => activityApi.list(workOrderId, { limit: 3 }),
    enabled: !!workOrderId,
  });
  const events = data?.content ?? [];
  if (events.length === 0) return null;
  return (
    <Card
      title={<CardTitle icon={<ClockIcon className="size-3.5" />}>{t('workOrders.detail.overview.recentActivity')}</CardTitle>}
      action={<CardLink onClick={onViewAll}>{t('workOrders.detail.overview.viewAll')}</CardLink>}
      padding="none"
    >
      <ol className="flex flex-col px-3.5 py-1">
        {events.map((e) => (
          <ActivityRow key={e.id} event={e} />
        ))}
      </ol>
    </Card>
  );
}

export interface WorkOrderOverviewProps {
  workOrder: WorkOrder;
  location?: ServiceLocationDetailDto;
  financialSummary?: WorkOrderFinancialSummary;
  dispatches: DispatchBoardRow[];
  onOpenTab: (tab: string) => void;
  onAddWorkItem: () => void;
  /** Deep-link a specific work item: switch to the Items tab and focus it. */
  onOpenWorkItem: (workItemId: string) => void;
  onOpenFinancial: (tab: 'invoices' | 'quotes') => void;
  onSelectDispatch: (d: Dispatch) => void;
  onScheduleDispatch: () => void;
  // Page-owned right-rail card (Job details: inline-edit PO# / NTE / created).
  // Rendered after the Money card; wiring stays in the page.
  extraRail?: ReactNode;
}

export default function WorkOrderOverview({
  workOrder,
  location,
  financialSummary,
  dispatches,
  onOpenTab,
  onAddWorkItem,
  onOpenWorkItem,
  onOpenFinancial,
  onSelectDispatch,
  onScheduleDispatch,
  extraRail,
}: WorkOrderOverviewProps) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  // Resolve addressed work-item ids → "WI-01" chips for the trip cells.
  const wiLabelById = useMemo(() => {
    const m = new Map<string, string>();
    (workOrder.workItems ?? []).forEach((wi) => {
      if (wi.sequence != null) m.set(wi.id, workItemLabel(getAbbrev('work_item'), wi.sequence));
    });
    return m;
  }, [workOrder.workItems, getAbbrev]);
  // For each work item, which positional trip numbers address it (shared util,
  // also used by the Work items tab so the two surfaces never drift).
  const wiTripsById = useMemo(() => tripsByWorkItem(dispatches), [dispatches]);
  const attention = deriveAttention({
    workOrder,
    dispatches,
    summary: financialSummary,
    onOpenTab,
    onOpenFinancial,
    t,
    getName,
  });
  const customerContact = workOrder.customer
    ? { name: workOrder.customer.name, phone: workOrder.customer.phone, email: workOrder.customer.email }
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      {attention.length > 0 && <AttentionStrip items={attention} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-3">
          <WorkItemsPeek
            workOrder={workOrder}
            tripsByWorkItem={wiTripsById}
            onAdd={onAddWorkItem}
            onOpenItems={onOpenWorkItem}
          />
          <TripStrip
            dispatches={dispatches}
            wiLabelById={wiLabelById}
            onSchedule={onScheduleDispatch}
            onSelect={onSelectDispatch}
          />
          <NotesCard entityType="work_order" entityId={workOrder.id} />
          <ActivityTeaser workOrderId={workOrder.id} onViewAll={() => onOpenTab('activity')} />
        </div>

        <div className="flex flex-col gap-3">
          {location && <LocationCard location={location} fallbackContact={customerContact} />}
          <MoneyCard
            workOrder={workOrder}
            summary={financialSummary}
            onOpenInvoices={() => onOpenFinancial('invoices')}
            onOpenQuotes={() => onOpenFinancial('quotes')}
          />
          {extraRail}
        </div>
      </div>
    </div>
  );
}
