// Work order Overview — derivations shared by both layouts (Detailed and
// Compact). Pure: no React, no fetching; the layouts pass in what they read.
import type {
  WorkOrder,
  WorkOrderFinancialSummary,
  DispatchBoardRow,
  DispatchStatus,
} from '../../api/setup';

export type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

export const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (n: number) => moneyFmt.format(n);
export const num = (s: string | number | null | undefined): number => {
  if (s == null) return 0;
  const n = typeof s === 'number' ? s : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

// Dispatch (trip) status → { tone, label, live }. IN_PROGRESS is the live
// state (tech on site / working); there's no separate en-route state and no
// GPS signal, so the strip leads with self-reported status, never a fake ETA.
export const DISPATCH_PRESENTATION: Record<DispatchStatus, { tone: PillTone; label: string; live?: boolean }> = {
  SCHEDULED: { tone: 'info', label: 'Scheduled' },
  EN_ROUTE: { tone: 'violet', label: 'En route', live: true },
  IN_PROGRESS: { tone: 'violet', label: 'On site', live: true },
  COMPLETED: { tone: 'success', label: 'Completed' },
  NO_SHOW: { tone: 'warning', label: 'No show' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled' },
};

// En route + on site both count as "live now".
export const isLiveDispatch = (s: DispatchStatus) => s === 'EN_ROUTE' || s === 'IN_PROGRESS';

// ── Same-day arrival window: "Fri 8–10 AM"; cross-date degrades to both sides.
export const ETA_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const ETA_TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
export function formatWindow(startIso: string, endIso: string): string {
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
export function warrantyState(expiresAt?: string | null): 'covered' | 'expired' | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime();
  if (Number.isNaN(ms)) return null;
  return ms >= Date.now() ? 'covered' : 'expired';
}

export function firstNameLastInitial(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// ── Attention items — derived, ordered live → blocker → money. Self-hides when
// empty. Mirrors woAttentionItems() from the mock; the PO link on the blocker
// is deferred until work-item parts/PO land (BE ask #1 + procurement).
export interface AttentionItem {
  key: string;
  severity: 'live' | 'warning' | 'money';
  title: string;
  sub: string;
  actionLabel: string;
  onAction: () => void;
}

export function deriveAttention(args: {
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


// Compact Dispatch rail hero. Live first, else the next scheduled, else the most
// recent visit (visits are non-cancelled, in arrival order).
export function pickHeroVisit(visits: DispatchBoardRow[]): DispatchBoardRow | null {
  return (
    visits.find((d) => isLiveDispatch(d.status)) ??
    visits.find((d) => d.status === 'SCHEDULED') ??
    visits[visits.length - 1] ??
    null
  );
}


// Compact Money rail → Cost tab (internal). Derived, never stored:
//   labor    = actual on-site hours (visits with arrived + departed) × the
//              tenant's loaded labor cost rate; null when no rate is set
//   parts    = received POs' cost (parts still on an open PO aren't cost yet)
//   invoiced = issued invoices (not draft / void / cancelled)
//   margin   = 1 − direct / invoiced, whole percent; null until invoiced
export interface JobCost {
  hours: number;
  labor: number | null;
  parts: number;
  direct: number;
  invoiced: number;
  margin: number | null;
}

export function deriveJobCost(args: {
  visits: Pick<DispatchBoardRow, 'arrivedAt' | 'departedAt'>[];
  laborCostRate: number | null;
  purchaseOrders: { status: string; totalCost: number }[];
  invoices: { status: string; totalAmount: number }[];
}): JobCost {
  const hours = args.visits.reduce((sum, d) => {
    if (!d.arrivedAt || !d.departedAt) return sum;
    const ms = new Date(d.departedAt).getTime() - new Date(d.arrivedAt).getTime();
    return ms > 0 ? sum + ms / 3_600_000 : sum;
  }, 0);
  const labor = args.laborCostRate != null ? hours * args.laborCostRate : null;
  const parts = args.purchaseOrders
    .filter((po) => po.status === 'RECEIVED' || po.status === 'BILLED')
    .reduce((sum, po) => sum + num(po.totalCost), 0);
  const direct = (labor ?? 0) + parts;
  const invoiced = args.invoices
    .filter((i) => i.status !== 'DRAFT' && i.status !== 'VOID' && i.status !== 'CANCELLED')
    .reduce((sum, i) => sum + num(i.totalAmount), 0);
  const margin = invoiced > 0 ? Math.round((1 - direct / invoiced) * 100) : null;
  return { hours, labor, parts, direct, invoiced, margin };
}
