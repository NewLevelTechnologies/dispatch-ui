import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  type ProgressCategory,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, extractApiError } from '../lib/toast';
import EquipmentFormDialog from './EquipmentFormDialog';
import WOEquipmentPicker from './WOEquipmentPicker';
import EditableField from './EditableField';
import WorkItemStatusPill from './WorkItemStatusPill';
import WorkItemEquipmentBlock from './WorkItemEquipmentBlock';
import { workItemLabel } from '../utils/workItemLabel';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import { Text } from './catalyst/text';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';
import { PlusIcon, EllipsisHorizontalIcon, TruckIcon } from '@heroicons/react/24/outline';

// Status-category → left-rail accent. Mirrors the overview peek grammar.
const RAIL: Record<ProgressCategory, string> = {
  NOT_STARTED: 'var(--info-500)',
  AWAITING_SCHEDULE: 'var(--info-500)',
  IN_PROGRESS: 'var(--violet-500)',
  BLOCKED: 'var(--warning-500)',
  COMPLETED: 'var(--success-500)',
  CANCELLED: 'var(--fg-dim)',
};

// Props mirror WorkItemsTable so the page swap is drop-in. All editing is
// inline (mock): `onAdd` → the inline composer; complaint/diagnosis →
// EditableField; equipment attach/change → the inline WOEquipmentPicker. There
// is no edit/add modal. `serviceLocationId` scopes the composer + attach picker.
interface Props {
  workOrderId: string;
  serviceLocationId?: string;
  workItems: WorkItemResponse[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly?: boolean;
  onDelete?: (wi: WorkItemResponse) => void;
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onSaveDiagnosis?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onAttachEquipment?: (wi: WorkItemResponse, equipmentId: string | null) => void | Promise<void>;
  /** Set the equipmentNeeded flag: false = "no equipment needed" (also detaches),
   *  true = undo back to needs-attach. */
  onSetEquipmentNeeded?: (wi: WorkItemResponse, needed: boolean) => void | Promise<void>;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
  /** Deep-link target from the overview peek: scroll this item into view and
   *  flash a brief highlight. */
  focusWorkItemId?: string | null;
  /** Positional trip numbers per work-item id (from `tripsByWorkItem`). */
  tripsByWorkItem?: Map<string, number[]>;
  /** Bumped by the page's "Add work item" affordances (header button, overview,
   *  the W shortcut) to open the inline composer, even across a tab switch. */
  openComposerSignal?: number;
}

// Work items tab — one rich card per item (the designer's "substance" view):
// complaint + status + trips, the linked-equipment block (or the inline attach
// picker), diagnosis, and a parts & readiness section. Parts/PO linkage is
// backend-deferred, so the parts section renders the mock's empty state.
export default function WorkItemsTab({
  workOrderId,
  serviceLocationId,
  workItems,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly = false,
  onDelete,
  onSaveDescription,
  onSaveDiagnosis,
  onAttachEquipment,
  onSetEquipmentNeeded,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  focusWorkItemId,
  tripsByWorkItem,
  openComposerSignal,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [composing, setComposing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const lastFocusedRef = useRef<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

  // The page's "Add work item" affordances (header button, overview card, the
  // W shortcut) bump `openComposerSignal` to open the inline composer. This is
  // the only way to drive it from outside — internal Add uses `setComposing`.
  useEffect(() => {
    if (!openComposerSignal) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external add affordance opens the composer across tab mounts
    setComposing(true);
  }, [openComposerSignal]);

  // Deep-link from the overview peek: scroll the targeted item into view and
  // flash a brief highlight. lastFocusedRef guards against re-scrolling on
  // unrelated re-renders (e.g. a background refetch); the timer lives in a ref
  // so a dependency change can't cancel the flash early.
  useEffect(() => {
    if (!focusWorkItemId || lastFocusedRef.current === focusWorkItemId) return;
    if (!workItems.some((wi) => wi.id === focusWorkItemId)) return;
    lastFocusedRef.current = focusWorkItemId;
    const el = containerRef.current?.querySelector<HTMLElement>(
      `[data-work-item-id="${focusWorkItemId}"]`
    );
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Transient deep-link highlight synchronized from the URL (?item=) — not
    // derivable render state, and it must auto-clear after the flash, so the
    // effect is the right home for it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHighlightedId(focusWorkItemId);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightedId(null), 1600);
  }, [focusWorkItemId, workItems]);

  useEffect(
    () => () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    },
    []
  );

  // Predicted next sequence for the composer's WI-id badge (server assigns the
  // real one on create; max existing + 1, matching the mock's head).
  const nextSequence = workItems.reduce((max, w) => Math.max(max, w.sequence ?? 0), 0) + 1;

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {!readOnly &&
        (composing ? (
          <NewWorkItemComposer
            workOrderId={workOrderId}
            serviceLocationId={serviceLocationId}
            nextSequence={nextSequence}
            onClose={() => setComposing(false)}
          />
        ) : (
          <Button
            outline
            // outline is transparent in light mode → it washes into the page
            // grey. The mock's .btn sits on --bg-elev (the card fill). Inline so
            // it wins the resting + hover state in both themes.
            className="self-start shadow-sm"
            style={{ backgroundColor: 'var(--bg-elev)' }}
            onClick={() => setComposing(true)}
          >
            <PlusIcon data-slot="icon" />
            {`${t('common.add')} ${getName('work_item').toLowerCase()}`}
          </Button>
        ))}

      {workItems.length === 0 && !composing ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <Text tone="muted">
            {t('workOrders.workItems.empty', {
              children: getName('work_item', true),
              entity: getName('work_order'),
            })}
          </Text>
        </div>
      ) : (
        workItems.map((wi) => (
          <WorkItemCard
            key={wi.id}
            workOrderId={workOrderId}
            serviceLocationId={serviceLocationId}
            wi={wi}
            highlighted={highlightedId === wi.id}
            trips={tripsByWorkItem?.get(wi.id) ?? []}
            statuses={statuses}
            transitions={transitions}
            enforceWorkflow={enforceWorkflow}
            readOnly={readOnly}
            onDelete={onDelete}
            onSaveDescription={onSaveDescription}
            onSaveDiagnosis={onSaveDiagnosis}
            onAttachEquipment={onAttachEquipment}
            onSetEquipmentNeeded={onSetEquipmentNeeded}
            onAddEquipment={onAddEquipment}
            onSelectSubUnit={onSelectSubUnit}
            onAddSubUnit={onAddSubUnit}
          />
        ))
      )}
    </div>
  );
}

function WorkItemCard({
  workOrderId,
  serviceLocationId,
  wi,
  highlighted = false,
  trips,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly,
  onDelete,
  onSaveDescription,
  onSaveDiagnosis,
  onAttachEquipment,
  onSetEquipmentNeeded,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
}: {
  workOrderId: string;
  serviceLocationId?: string;
  wi: WorkItemResponse;
  highlighted?: boolean;
  trips: number[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly: boolean;
  onDelete?: (wi: WorkItemResponse) => void;
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onSaveDiagnosis?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onAttachEquipment?: (wi: WorkItemResponse, equipmentId: string | null) => void | Promise<void>;
  onSetEquipmentNeeded?: (wi: WorkItemResponse, needed: boolean) => void | Promise<void>;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const showActions = !readOnly && !!onDelete;
  const diagnosis = wi.diagnosis?.trim();
  const wiId = wi.sequence != null ? workItemLabel(getAbbrev('work_item'), wi.sequence) : null;

  const attached = !!wi.equipment;
  const noneNeeded = !attached && wi.equipmentNeeded === false;
  const [picking, setPicking] = useState(false);
  // Needs-attach is the resting state: the picker shows by default (editable)
  // until equipment is attached. "Change" and "Attach" (from none-needed) flip
  // `picking` to bring the picker up over the resolved states.
  const showPicker = picking || (!readOnly && !attached && !noneNeeded);

  return (
    <div
      data-work-item-id={wi.id}
      className="overflow-hidden rounded-lg border border-border bg-bg-elev transition-shadow duration-500"
      style={{
        borderLeft: `3px solid ${RAIL[wi.statusCategory]}`,
        boxShadow: highlighted ? '0 0 0 2px var(--accent-500)' : undefined,
      }}
    >
      {/* Head — two groups on one centered row (mock card-head): complaint +
          WI-id (left, baseline) · trips + status + kebab (right, centered). */}
      <div className="flex items-center gap-3 border-b border-border-soft px-3.5 py-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          {/* Complaint — 13px/600 --fg-strong, no clamp (mock §3). Inline-editable. */}
          <div className="min-w-0 flex-1 text-[13px] font-semibold text-fg-strong">
            {onSaveDescription && !readOnly ? (
              <EditableField
                as="textarea"
                value={wi.description}
                onSave={(next) => onSaveDescription(wi, next)}
                rows={2}
                ariaLabel={t('workOrders.workItems.editDescription')}
              />
            ) : (
              wi.description
            )}
          </div>
          {wiId && (
            <span className="shrink-0 whitespace-nowrap font-mono text-[10.5px] font-semibold text-fg-dim">
              {wiId}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Trips addressing this item (mock JSX lines 216–222). */}
          <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-fg-muted">
            <TruckIcon className="size-3" />
            {trips.length > 0 ? (
              <span>
                {`${trips.length > 1 ? getName('dispatch', true) : getName('dispatch')} `}
                <span className="font-semibold text-fg-strong">{trips.join(', ')}</span>
              </span>
            ) : (
              <span className="text-fg-dim">{t('workOrders.detail.notScheduled')}</span>
            )}
          </span>
          <WorkItemStatusPill
            workOrderId={workOrderId}
            workItem={wi}
            statuses={statuses}
            transitions={transitions}
            enforceWorkflow={enforceWorkflow}
            readOnly={readOnly}
          />
          {showActions && (
            <Dropdown>
              <DropdownButton plain className="size-6 justify-center p-0" aria-label={t('common.moreOptions')}>
                <EllipsisHorizontalIcon className="size-3.5" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                {onDelete && (
                  <DropdownItem onClick={() => onDelete(wi)}>
                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                  </DropdownItem>
                )}
              </DropdownMenu>
            </Dropdown>
          )}
        </div>
      </div>

      {/* Body — equipment (3 states) → diagnosis → parts & readiness. */}
      <div className="space-y-3 px-3.5 py-3">
        {attached && !picking ? (
          <WorkItemEquipmentBlock
            equipment={wi.equipment!}
            readOnly={readOnly}
            onOpenEquipment={onSelectSubUnit}
            onChange={!readOnly ? () => setPicking(true) : undefined}
            onSelectSubUnit={onSelectSubUnit}
            onAddSubUnit={onAddSubUnit}
          />
        ) : showPicker ? (
          <WOEquipmentPicker
            serviceLocationId={serviceLocationId}
            value={wi.equipment?.id ?? null}
            onPick={(equipmentId) => {
              void onAttachEquipment?.(wi, equipmentId);
              // Clear (null) leaves the picker open so they can pick another;
              // a real pick collapses back to the attached block.
              if (equipmentId) setPicking(false);
            }}
            onAddNew={onAddEquipment ? () => onAddEquipment(wi) : undefined}
            onCancel={attached || noneNeeded ? () => setPicking(false) : undefined}
            onNotNeeded={
              onSetEquipmentNeeded
                ? () => {
                    void onSetEquipmentNeeded(wi, false);
                    setPicking(false);
                  }
                : undefined
            }
          />
        ) : noneNeeded ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-fg-dim">{t('workOrders.workItems.noEquipmentNeeded')}</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  // Undo not-needed → back to needs-attach, and open the picker.
                  void onSetEquipmentNeeded?.(wi, true);
                  setPicking(true);
                }}
                className="inline-flex items-center gap-1 text-[11.5px] leading-none !font-semibold text-fg-accent hover:underline"
              >
                <PlusIcon className="size-3" />
                {t('workOrders.workItems.attach')}
              </button>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-fg-dim">
            {t('workOrders.workItems.noEquipmentLinked', { entity: getName('equipment') })}
          </span>
        )}

        {/* Diagnosis — tinted panel (mock §5): label-tiny + 12px body, --fg.
            Inline-editable; empty state prompts the tech (no italics). */}
        <div
          className="px-[11px] py-[9px]"
          style={{
            background: 'var(--bg-elev-2)',
            borderRadius: 'var(--r-sm)',
            borderLeft: '2px solid var(--border-strong)',
          }}
        >
          <div className="mb-[3px] text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
            {t('workOrders.workItems.diagnosis')}
          </div>
          {!readOnly && onSaveDiagnosis ? (
            <EditableField
              as="textarea"
              value={wi.diagnosis ?? ''}
              onSave={(next) => onSaveDiagnosis(wi, next)}
              rows={3}
              placeholder={t('workOrders.workItems.diagnosisPlaceholder')}
              ariaLabel={t('workOrders.workItems.diagnosis')}
              className="block w-full"
              renderDisplay={(v) => (
                <span className="block whitespace-pre-wrap text-[12px] leading-normal text-fg">
                  {v || t('workOrders.workItems.notDiagnosed')}
                </span>
              )}
            />
          ) : (
            <p className="whitespace-pre-wrap text-[12px] leading-normal text-fg">
              {diagnosis || t('workOrders.workItems.notDiagnosed')}
            </p>
          )}
        </div>

        {/* Parts & readiness — the parts log + PO linkage are backend-deferred
            (ship with procurement), so render the mock's empty state for now. */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
            {t('workOrders.workItems.partsReadiness')}
          </div>
          <p className="mt-0.5 text-[12.5px] text-fg-dim">{t('workOrders.workItems.noPartsYet')}</p>
        </div>
      </div>
    </div>
  );
}

// Inline add-item composer (mock NewWorkItemComposer): predicted WI-id head,
// complaint, and the same inline WOEquipmentPicker the card uses (candidate list
// + Clear + add-new). Atomic create; status defaults server-side (Triage).
function NewWorkItemComposer({
  workOrderId,
  serviceLocationId,
  nextSequence,
  onClose,
}: {
  workOrderId: string;
  serviceLocationId?: string;
  nextSequence: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const queryClient = useQueryClient();
  const [complaint, setComplaint] = useState('');
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const [addEquipmentOpen, setAddEquipmentOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: () =>
      workOrderApi.createWorkItem(workOrderId, {
        description: complaint.trim(),
        equipmentId: equipmentId ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
      onClose();
    },
    onError: (err) =>
      showError(t('common.form.errorCreate', { entity: getName('work_item') }), extractApiError(err) ?? undefined),
  });

  const canSave = complaint.trim().length > 0 && !createMutation.isPending;

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-bg-elev"
      style={{ borderLeft: '3px solid var(--accent-500)' }}
    >
      {/* Head — predicted WI-id + "New work item" (mock composer head). */}
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2.5">
        <span className="font-mono text-[11.5px] font-semibold text-fg-dim">
          {workItemLabel(getAbbrev('work_item'), nextSequence)}
        </span>
        <span className="text-[13px] font-semibold text-fg-strong">
          {t('workOrders.workItems.newItem', { entity: getName('work_item') })}
        </span>
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <div>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
            {t('workOrders.workItems.complaintSummary')}
          </div>
          <Input
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            autoFocus
            aria-label={t('workOrders.workItems.complaintSummary')}
            placeholder={t('workOrders.workItems.complaintPlaceholder')}
          />
        </div>
        {serviceLocationId && (
          <div>
            <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
              {getName('equipment')}
            </div>
            <WOEquipmentPicker
              serviceLocationId={serviceLocationId}
              value={equipmentId}
              onPick={setEquipmentId}
              onAddNew={() => setAddEquipmentOpen(true)}
            />
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button plain onClick={onClose} disabled={createMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button color="accent" onClick={() => createMutation.mutate()} disabled={!canSave}>
            <PlusIcon data-slot="icon" />
            {createMutation.isPending
              ? t('common.saving')
              : t('common.actions.add', { entity: getName('work_item') })}
          </Button>
        </div>
      </div>

      {/* "Add new equipment on site" → create with the location locked; on
          success the picker's list refetches and we preselect the new unit. */}
      <EquipmentFormDialog
        isOpen={addEquipmentOpen}
        onClose={() => setAddEquipmentOpen(false)}
        equipment={null}
        lockedServiceLocationId={serviceLocationId}
        onCreated={(created) => setEquipmentId(created.id)}
      />
    </div>
  );
}
