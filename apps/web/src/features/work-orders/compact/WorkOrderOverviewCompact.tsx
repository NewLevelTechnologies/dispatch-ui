// Work Order detail — Overview tab, Compact layout ("job-first").
//
// The service-manager view, picked per user with the switch on the tab row
// (the CSR's attention-first view stays as the Detailed layout):
//   1. attention chips — same derivation as Detailed, one line each
//   2. Work items      — the mainstay; each row leads with its equipment and
//                         expands equipment / units / parts / notes / photos /
//                         history in place (no navigation)
//   3. rail (330)      — Dispatch (who / when / time on site) · Money (rollup +
//                         quotes / invoices / POs / internal cost)
// Location, notes card, activity teaser and the trip strip are intentionally
// absent: gate / access / on-site contact ride in the page header, notes open
// from the Work items head, activity has its own tab, scheduling is the board's.
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  ArchiveBoxIcon,
  ChatBubbleLeftEllipsisIcon,
  MapPinIcon,
  ReceiptPercentIcon,
  TruckIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/16/solid';
import {
  purchaseOrderApi,
  workItemDocumentsApi,
  workOrderFilesApi,
  type DispatchBoardRow,
  type Invoice,
  type PurchaseOrderListItem,
  type Quote,
  type ServiceLocationDetailDto,
  type WorkItemDocument,
  type WorkItemResponse,
  type WorkItemStatus,
  type WorkflowTransition,
  type WorkOrder,
  type WorkOrderFile,
  type WorkOrderFinancialSummary,
} from '../../../api/setup';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { dispatchCoversWorkItem } from '@dispatch/utils';
import { isFinished } from '../../../lib/workItemSteps';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/catalyst/button';
import { useEntityNotes } from '../../../components/useEntityNotes';
import { deriveAttention, type AttentionItem } from '../overviewModel';
import { localDate } from '../../../components/work-items/format';
import CompactItemRow, { type ItemTrip } from './CompactItemRow';
import DispatchRailCard from './DispatchRailCard';
import MoneyRailCard from './MoneyRailCard';

export interface WorkOrderOverviewCompactProps {
  workOrder: WorkOrder;
  statuses: WorkItemStatus[];
  /** The WO type's workflow — what the row status pickers may move to. */
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  location?: ServiceLocationDetailDto;
  financialSummary?: WorkOrderFinancialSummary;
  dispatches: DispatchBoardRow[];
  quotes: Quote[];
  invoices: Invoice[];
  /** Frozen WO or no edit access — rows show, nothing writes. */
  readOnly: boolean;
  /** Pin / edit / delete on job notes. Adding a note needs only view access. */
  canEditNotes: boolean;
  /** Internal cost + margin on the Money card. */
  canSeeCost: boolean;
  onOpenTab: (tab: string) => void;
  onOpenFinancial: (tab: 'invoices' | 'quotes') => void;
  onOpenWorkItem: (workItemId: string) => void;
  onSelectDispatch: (d: DispatchBoardRow) => void;
  onOpenEquipment: (equipment: { id: string; name: string }) => void;
  onAttachEquipment: (wi: WorkItemResponse, equipmentId: string | null) => Promise<void> | void;
  onSetEquipmentNeeded: (wi: WorkItemResponse, needed: boolean) => Promise<void> | void;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSaveDiagnosis: (wi: WorkItemResponse, next: string) => Promise<void>;
  /** Open the dispatch form — with one item preselected, or (no item) blank. */
  onScheduleDispatch?: (wi?: WorkItemResponse) => void;
  /** Page-owned rail cards (callback link / callbacks back) after Money. */
  extraRail?: ReactNode;
}

export default function WorkOrderOverviewCompact(props: WorkOrderOverviewCompactProps) {
  const { workOrder, dispatches, onOpenTab, onOpenFinancial } = props;
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const workOrderId = workOrder.id;

  const attention = deriveAttention({
    workOrder,
    dispatches,
    summary: props.financialSummary,
    onOpenTab,
    onOpenFinancial,
    t,
    getName,
  });

  // Visits in arrival order, non-cancelled — positional numbers are index + 1,
  // the same numbering as the Dispatches and Work items tabs.
  const visits = useMemo(
    () =>
      dispatches
        .filter((d) => d.status !== 'CANCELLED')
        .sort((a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime()),
    [dispatches],
  );

  // Same queries (and keys) as the Work items / Purchasing tabs, so switching
  // between them is free.
  const { data: poPage } = useQuery({
    queryKey: ['purchase-orders', workOrderId],
    queryFn: () => purchaseOrderApi.list({ workOrderId, size: 100 }),
  });
  const purchaseOrders = useMemo(() => poPage?.content ?? [], [poPage]);
  const { data: itemDocuments = [] } = useQuery({
    queryKey: ['work-item-documents', workOrderId],
    queryFn: () => workItemDocumentsApi.getByWorkOrder(workOrderId),
  });
  // The job's photos/videos, grouped per item below.
  const { data: filesPage } = useQuery({
    queryKey: ['work-order-files', workOrderId, { limit: 100 }],
    queryFn: () => workOrderFilesApi.list(workOrderId, { limit: 100 }),
  });
  const media = (filesPage?.content ?? []).filter((f) => f.kind !== 'DOCUMENT' && f.status !== 'FAILED');

  // A scheduled visit waiting on parts says so: the soonest open PO's ETA.
  const openPOs = purchaseOrders.filter((po) => po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED');
  const nextEta = openPOs
    .map((po) => po.eta)
    .filter((eta): eta is string => !!eta)
    .sort()[0];
  const partsBlocker =
    openPOs.length === 0
      ? null
      : nextEta
        ? t('workOrders.detail.compact.partsEta', { date: localDate(nextEta) })
        : t('workOrders.workItems.waitingOnParts');

  return (
    <div className="ovc">
      {attention.length > 0 && <AttentionChips items={attention} />}

      <div className="ovc-grid">
        <WorkItemsBoard
          {...props}
          visits={visits}
          purchaseOrders={purchaseOrders}
          itemDocuments={itemDocuments}
          media={media}
        />
        <div className="flex min-w-0 flex-col gap-3">
          <DispatchRailCard
            visits={visits}
            partsBlocker={partsBlocker}
            onSelect={props.onSelectDispatch}
            workItems={workOrder.workItems ?? []}
            media={media}
            onSchedule={props.readOnly || !props.onScheduleDispatch ? undefined : () => props.onScheduleDispatch?.()}
            onOpenDispatchesTab={() => onOpenTab('trips')}
          />
          <MoneyRailCard
            workOrder={workOrder}
            summary={props.financialSummary}
            quotes={props.quotes}
            invoices={props.invoices}
            purchaseOrders={purchaseOrders}
            visits={visits}
            canSeeCost={props.canSeeCost}
            onOpenDocuments={onOpenFinancial}
          />
          {props.extraRail}
        </div>
      </div>
    </div>
  );
}

const CHIP_COLOR: Record<AttentionItem['severity'], { rail: string; fg: string }> = {
  live: { rail: 'var(--violet-500)', fg: 'var(--violet-500)' },
  warning: { rail: 'var(--warning-500)', fg: 'var(--warning-fg)' },
  money: { rail: 'var(--accent-500)', fg: 'var(--fg-accent)' },
};

function AttentionChips({ items }: { items: AttentionItem[] }) {
  return (
    <div className="ovc-attn">
      {items.map((it) => {
        const c = CHIP_COLOR[it.severity];
        const Icon = it.severity === 'live' ? TruckIcon : it.severity === 'warning' ? ArchiveBoxIcon : ReceiptPercentIcon;
        return (
          <button
            key={it.key}
            type="button"
            className="ovc-chip"
            style={{ '--ovc-chip': c.rail } as CSSProperties}
            title={it.sub}
            onClick={it.onAction}
          >
            <span className="ovc-chipicon" style={{ color: c.fg }}>
              <Icon className="size-3.5" />
            </span>
            <span
              className="ovc-chiptitle"
              style={{ color: it.severity === 'warning' ? 'var(--warning-fg)' : 'var(--fg-strong)' }}
            >
              {it.title}
            </span>
            <span className="ovc-chipaction">{it.actionLabel} →</span>
          </button>
        );
      })}
    </div>
  );
}

function WorkItemsBoard(
  props: WorkOrderOverviewCompactProps & {
    visits: DispatchBoardRow[];
    purchaseOrders: PurchaseOrderListItem[];
    itemDocuments: WorkItemDocument[];
    media: WorkOrderFile[];
  },
) {
  const { workOrder, location, statuses, visits } = props;
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [showDone, setShowDone] = useState(false);

  const notes = useEntityNotes({
    entityType: 'work_order',
    entityId: workOrder.id,
    canEdit: props.canEditNotes,
    canAdd: true,
  });
  // Location's pinned site note first, then the job's own pinned notes.
  const pins = [
    ...(location?.notes ?? []).filter((n) => n.pinned).map((n) => n.body),
    ...notes.notes.filter((n) => n.pinned).map((n) => n.body),
  ];

  const items = workOrder.workItems ?? [];
  const open = items.filter((wi) => !isFinished(wi));
  const done = items.filter(isFinished);

  const row = (wi: WorkItemResponse) => {
    const trips: ItemTrip[] = visits
      .map((d, i) => ({ dispatch: d, seq: i + 1 }))
      .filter(({ dispatch }) => dispatchCoversWorkItem(dispatch, wi.id));
    return (
      <CompactItemRow
        key={wi.id}
        workOrderId={workOrder.id}
        serviceLocationId={workOrder.serviceLocationId || workOrder.serviceLocation?.id}
        customerId={workOrder.customer?.id}
        wi={wi}
        statuses={statuses}
        transitions={props.transitions}
        enforceWorkflow={props.enforceWorkflow}
        readOnly={props.readOnly}
        media={props.media.filter((m) => m.workItemId === wi.id)}
        purchaseOrders={props.purchaseOrders.filter((po) => po.workItemId === wi.id)}
        documents={props.itemDocuments.filter((d) => d.workItemId === wi.id)}
        trips={trips}
        onSelectDispatch={props.onSelectDispatch}
        onOpenWorkItem={props.onOpenWorkItem}
        onOpenEquipment={props.onOpenEquipment}
        onAttachEquipment={props.onAttachEquipment}
        onSetEquipmentNeeded={props.onSetEquipmentNeeded}
        onAddEquipment={props.readOnly ? undefined : props.onAddEquipment}
        onSaveDiagnosis={props.onSaveDiagnosis}
        onScheduleDispatch={props.readOnly ? undefined : props.onScheduleDispatch}
      />
    );
  };

  return (
    <Card className="min-w-0">
      <CardHead>
        <CardTitle icon={<WrenchScrewdriverIcon className="size-3.5" />}>{getName('work_item', true)}</CardTitle>
        <CardSub>{t('workOrders.detail.compact.openTotal', { open: open.length, total: items.length })}</CardSub>
        <span className="flex-1" />
        <Button plain size="xs" onClick={notes.openDrawer}>
          <ChatBubbleLeftEllipsisIcon data-slot="icon" />
          {t('workOrders.workItems.notes')}
          <span className="ovc-n">{notes.notes.length}</span>
        </Button>
      </CardHead>
      {pins.length > 0 && (
        <button type="button" className="ovc-pins" onClick={notes.openDrawer} title={t('workOrders.detail.compact.openNotes')}>
          <MapPinIcon className="size-3" />
          <span className="min-w-0 flex-1">{pins.join('  ·  ')}</span>
        </button>
      )}
      <CardBody flush>
        {items.length === 0 && (
          <div className="px-3.5 py-6 text-center text-[12.5px] text-fg-muted">
            {t('common.actions.noEntitiesYet', { entities: getName('work_item', true) })}
          </div>
        )}
        {open.map(row)}
        {done.length > 0 && (
          <button type="button" className="ovc-donebar" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
            <span>{t('workOrders.detail.compact.doneCount', { count: done.length })}</span>
            <span className="flex-1" />
            <span>{showDone ? t('workOrders.detail.compact.hide') : t('workOrders.detail.compact.show')}</span>
          </button>
        )}
        {showDone && done.map(row)}
      </CardBody>
      {notes.overlays}
    </Card>
  );
}
