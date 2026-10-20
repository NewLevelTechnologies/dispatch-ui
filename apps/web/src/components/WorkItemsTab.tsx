import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { PlusIcon } from '@heroicons/react/16/solid';
import {
  purchaseOrderApi,
  workOrderApi,
  workOrderFilesApi,
  type DispatchBoardRow,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasAnyCapability } from '../hooks/useCurrentUser';
import { showError, extractApiError } from '../lib/toast';
import { dispatchCoversWorkItem, workItemLabel } from '@dispatch/utils';
import { isFinished } from '../lib/workItemSteps';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import WorkItemRail from './work-items/WorkItemRail';
import WorkItemDetail from './work-items/WorkItemDetail';

// Work items tab — list | detail. The list is the job's items (open first,
// then done); the detail is the selected item as a service record. All editing
// is inline and section-scoped; the page owns the writes that other surfaces
// share (description, findings, equipment, duplicate, delete) and the dispatch
// form/drawer.
interface Props {
  workOrderId: string;
  serviceLocationId?: string;
  workItems: WorkItemResponse[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  /** Frozen WO (cancelled / archived). Users without EDIT_WORK_ORDERS are read-only too. */
  readOnly?: boolean;
  /** The WO's dispatches (non-cancelled ones address items). */
  dispatches?: DispatchBoardRow[];
  onDelete?: (wi: WorkItemResponse) => void;
  onDuplicate?: (wi: WorkItemResponse) => void;
  onSaveDescription: (wi: WorkItemResponse, next: string) => Promise<void>;
  onSaveDiagnosis: (wi: WorkItemResponse, next: string) => Promise<void>;
  onAttachEquipment: (wi: WorkItemResponse, equipmentId: string | null) => void | Promise<void>;
  /** false = "no equipment needed" (also detaches); true = back to needs-attach. */
  onSetEquipmentNeeded: (wi: WorkItemResponse, needed: boolean) => void | Promise<void>;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onOpenEquipment: (equipment: { id: string; name: string }) => void;
  /** Open the dispatch form with this item preselected. */
  onScheduleDispatch?: (wi: WorkItemResponse) => void;
  onSelectDispatch: (d: DispatchBoardRow) => void;
  /** Deep-link target from the overview peek (?item=<id>). */
  focusWorkItemId?: string | null;
  /** Positional trip numbers per work-item id (from `tripsByWorkItem`). */
  tripsByWorkItem?: Map<string, number[]>;
  /** Bumped by the page's "Add work item" affordances (header button, overview,
   *  the W shortcut) to open the inline composer, even across a tab switch. */
  openComposerSignal?: number;
}

export default function WorkItemsTab({
  workOrderId,
  serviceLocationId,
  workItems,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly: frozen = false,
  dispatches = [],
  onDelete,
  onDuplicate,
  onSaveDescription,
  onSaveDiagnosis,
  onAttachEquipment,
  onSetEquipmentNeeded,
  onAddEquipment,
  onOpenEquipment,
  onScheduleDispatch,
  onSelectDispatch,
  focusWorkItemId,
  tripsByWorkItem,
  openComposerSignal,
}: Props) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const canEdit = useHasAnyCapability('EDIT_WORK_ORDERS');
  // Read-only hides every edit affordance (not disabled): frozen WO or no edit right.
  const readOnly = frozen || !canEdit;
  const [composing, setComposing] = useState(false);

  // Open first, then done; server order (sequence) within each group.
  const ordered = useMemo(
    () => [...workItems.filter((w) => !isFinished(w)), ...workItems.filter(isFinished)],
    [workItems],
  );

  const abbrev = getAbbrev('work_item');
  const labelOf = useCallback(
    (wi: WorkItemResponse) => (wi.sequence != null ? workItemLabel(abbrev, wi.sequence) : null),
    [abbrev],
  );
  // `#WI-02` deep link → that item's id.
  const fromHash = useCallback(() => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (!hash) return null;
    return workItems.find((w) => labelOf(w) === hash)?.id ?? null;
  }, [workItems, labelOf]);

  const [selectedId, setSelectedId] = useState<string | null>(() => fromHash() ?? focusWorkItemId ?? null);
  const selected =
    ordered.find((w) => w.id === selectedId) ?? ordered.find((w) => !isFinished(w)) ?? ordered[0] ?? null;

  // Back/forward or an edited hash re-selects.
  useEffect(() => {
    const onHash = () => {
      const id = fromHash();
      if (id) setSelectedId(id);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [fromHash]);

  const select = (id: string) => {
    setSelectedId(id);
    const wi = workItems.find((w) => w.id === id);
    const label = wi && labelOf(wi);
    // Keep the selection shareable without adding history entries.
    if (label) window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${label}`);
  };

  useEffect(() => {
    if (!openComposerSignal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external add affordance opens the composer across tab mounts
    setComposing(true);
  }, [openComposerSignal]);

  // Per-item POs: the WO's PO list (the Purchasing tab's query), grouped here
  // by each row's workItemId.
  const { data: poPage } = useQuery({
    queryKey: ['purchase-orders', workOrderId],
    queryFn: () => purchaseOrderApi.list({ workOrderId, size: 100 }),
  });
  const purchaseOrders = poPage?.content ?? [];
  // The job's media — same query the Dispatches tab reads; filtered per item.
  const { data: filesPage } = useQuery({
    queryKey: ['work-order-files', workOrderId, 'dispatch-media'],
    queryFn: () => workOrderFilesApi.list(workOrderId, { limit: 100 }),
  });

  const visits = useMemo(
    () =>
      dispatches
        .filter((d) => d.status !== 'CANCELLED')
        .sort((a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime()),
    [dispatches],
  );
  const seqById = useMemo(() => new Map(visits.map((d, i) => [d.id, i + 1])), [visits]);

  const addButton = !readOnly && !composing && (
    <Button outline size="xxs" onClick={() => setComposing(true)}>
      <PlusIcon data-slot="icon" />
      {t('common.actions.add', { entity: getName('work_item') })}
    </Button>
  );

  const composer = composing && !readOnly && (
    <NewWorkItemComposer
      workOrderId={workOrderId}
      onClose={() => setComposing(false)}
      onCreated={(id) => {
        setComposing(false);
        setSelectedId(id);
      }}
    />
  );

  if (workItems.length === 0) {
    return (
      <div className="flex flex-col gap-3.5">
        {composer}
        {!composing && (
          <div className="wit-empty justify-center py-8">
            <span>{t('workOrders.workItems.emptyShort', { entities: getName('work_item', true).toLowerCase() })}</span>
            {addButton}
          </div>
        )}
      </div>
    );
  }

  const single = workItems.length === 1;
  const detail = selected && (
    <WorkItemDetail
      key={selected.id}
      workOrderId={workOrderId}
      serviceLocationId={serviceLocationId}
      wi={selected}
      statuses={statuses}
      transitions={transitions}
      enforceWorkflow={enforceWorkflow}
      readOnly={readOnly}
      purchaseOrders={purchaseOrders.filter((po) => po.workItemId === selected.id)}
      media={(filesPage?.content ?? []).filter(
        (f) => f.workItemId === selected.id && f.kind !== 'DOCUMENT' && f.status !== 'FAILED',
      )}
      dispatches={visits.filter((d) => dispatchCoversWorkItem(d, selected.id))}
      seqById={seqById}
      onSaveDescription={onSaveDescription}
      onSaveDiagnosis={onSaveDiagnosis}
      onAttachEquipment={onAttachEquipment}
      onSetEquipmentNeeded={onSetEquipmentNeeded}
      onAddEquipment={onAddEquipment}
      onOpenEquipment={onOpenEquipment}
      onSchedule={readOnly ? undefined : onScheduleDispatch}
      onSelectDispatch={onSelectDispatch}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  );

  return (
    <div className={'wit' + (single ? ' single' : '')}>
      {!single && (
        <WorkItemRail
          items={ordered}
          statuses={statuses}
          selectedId={selected?.id ?? null}
          onSelect={select}
          tripsByWorkItem={tripsByWorkItem}
          onAdd={readOnly || composing ? undefined : () => setComposing(true)}
        />
      )}
      <div className="wit-detail flex flex-col gap-3.5">
        {single && addButton && (
          <div className="flex items-center gap-2">
            {addButton}
            <span className="text-[11.5px] text-fg-muted">
              {t('workOrders.workItems.oneOnJob', {
                entity: getName('work_item').toLowerCase(),
                job: getName('work_order').toLowerCase(),
              })}
            </span>
          </div>
        )}
        {composer}
        {detail}
      </div>
    </div>
  );
}

// Inline add-item composer at the top of the detail: the complaint only.
// Equipment and scheduling happen on the new item once it exists.
function NewWorkItemComposer({
  workOrderId,
  onClose,
  onCreated,
}: {
  workOrderId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [complaint, setComplaint] = useState('');

  const create = useMutation({
    mutationFn: () => workOrderApi.createWorkItem(workOrderId, { description: complaint.trim() }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
      onCreated(created.id);
    },
    onError: (err) =>
      showError(t('common.form.errorCreate', { entity: getName('work_item') }), extractApiError(err) ?? undefined),
  });
  const canSave = complaint.trim().length > 0 && !create.isPending;

  return (
    <section className="card" style={{ borderLeft: '3px solid var(--accent-500)' }}>
      <div className="card-head">
        <div className="card-title">{t('workOrders.workItems.newItem', { entity: getName('work_item') })}</div>
      </div>
      <div className="card-body flex flex-col gap-2.5">
        <Input
          autoFocus
          value={complaint}
          maxLength={500}
          onChange={(e) => setComplaint(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) create.mutate();
            if (e.key === 'Escape') onClose();
          }}
          aria-label={t('workOrders.workItems.complaintSummary')}
          placeholder={t('workOrders.workItems.complaintPlaceholder')}
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-fg-muted">
            {t('workOrders.workItems.composerHint', {
              equipment: getName('equipment').toLowerCase(),
            })}
          </span>
          <span className="flex-1" />
          <Button plain size="xs" onClick={onClose} disabled={create.isPending}>
            {t('common.cancel')}
          </Button>
          <Button color="accent" size="xs" onClick={() => create.mutate()} disabled={!canSave}>
            {create.isPending ? t('common.saving') : t('common.actions.add', { entity: getName('work_item') })}
          </Button>
        </div>
      </div>
    </section>
  );
}
