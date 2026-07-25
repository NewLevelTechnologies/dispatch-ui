import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  type EquipmentSummary,
  type ProgressCategory,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, extractApiError } from '../lib/toast';
import EquipmentPicker from './EquipmentPicker';
import EditableField from './EditableField';
import WorkItemStatusPill from './WorkItemStatusPill';
import WorkItemEquipmentBlock from './WorkItemEquipmentBlock';
import { workItemLabel } from '../utils/workItemLabel';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Textarea } from './catalyst/textarea';
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

// Props mirror WorkItemsTable so the page swap is drop-in. `onAdd` is replaced
// by the inline composer (designer mock); `serviceLocationId` scopes the
// composer + attach equipment picker.
interface Props {
  workOrderId: string;
  serviceLocationId?: string;
  workItems: WorkItemResponse[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly?: boolean;
  onEdit?: (wi: WorkItemResponse) => void;
  onDelete?: (wi: WorkItemResponse) => void;
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onEditEquipment?: (equipmentId: string) => void;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
  /** Deep-link target from the overview peek: scroll this item into view and
   *  flash a brief highlight. */
  focusWorkItemId?: string | null;
  /** Positional trip numbers per work-item id (from `tripsByWorkItem`). */
  tripsByWorkItem?: Map<string, number[]>;
}

// Work items tab — one rich card per item (the designer's "substance" view):
// complaint + status, the linked-equipment block (sub-units, inline edit,
// thumbnails, notes — reused from WorkItemsTable), diagnosis, and a parts &
// readiness section. Parts/PO and trip↔item linkage are backend-deferred, so
// the parts section renders the mock's empty state and the trips line is
// omitted until those land.
export default function WorkItemsTab({
  workOrderId,
  serviceLocationId,
  workItems,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly = false,
  onEdit,
  onDelete,
  onSaveDescription,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  focusWorkItemId,
  tripsByWorkItem,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [composing, setComposing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const lastFocusedRef = useRef<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

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

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {!readOnly &&
        (composing ? (
          <NewWorkItemComposer
            workOrderId={workOrderId}
            serviceLocationId={serviceLocationId}
            onClose={() => setComposing(false)}
          />
        ) : (
          <Button outline className="self-start" onClick={() => setComposing(true)}>
            <PlusIcon data-slot="icon" />
            {t('common.actions.add', { entity: getName('work_item') })}
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
            wi={wi}
            highlighted={highlightedId === wi.id}
            trips={tripsByWorkItem?.get(wi.id) ?? []}
            statuses={statuses}
            transitions={transitions}
            enforceWorkflow={enforceWorkflow}
            readOnly={readOnly}
            onEdit={onEdit}
            onDelete={onDelete}
            onSaveDescription={onSaveDescription}
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
  wi,
  highlighted = false,
  trips,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly,
  onEdit,
  onDelete,
  onSaveDescription,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
}: {
  workOrderId: string;
  wi: WorkItemResponse;
  highlighted?: boolean;
  trips: number[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly: boolean;
  onEdit?: (wi: WorkItemResponse) => void;
  onDelete?: (wi: WorkItemResponse) => void;
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
}) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const showActions = !readOnly && !!(onEdit || onDelete);
  const diagnosis = wi.diagnosis?.trim();
  const wiId = wi.sequence != null ? workItemLabel(getAbbrev('work_item'), wi.sequence) : null;
  const noneNeeded = !wi.equipment && wi.equipmentNeeded === false;
  const canAttach = !readOnly && !!(onEdit || onAddEquipment);
  const attach = () => {
    if (onEdit) onEdit(wi);
    else if (onAddEquipment) onAddEquipment(wi);
  };

  return (
    <div
      data-work-item-id={wi.id}
      className="overflow-hidden rounded-lg border border-border bg-bg-elev transition-shadow duration-500"
      style={{
        borderLeft: `3px solid ${RAIL[wi.statusCategory]}`,
        boxShadow: highlighted ? '0 0 0 2px var(--accent-500)' : undefined,
      }}
    >
      {/* Head — complaint leads, WI-id demoted, status pill right, kebab. */}
      <div className="flex items-start gap-2.5 border-b border-border-soft px-3.5 py-2.5">
        <div className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[13px] font-semibold text-fg-strong">
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
          <span className="mt-0.5 shrink-0 whitespace-nowrap font-mono text-[10.5px] font-semibold text-fg-dim">
            {wiId}
          </span>
        )}
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
            <DropdownButton plain aria-label={t('common.moreOptions')}>
              <EllipsisHorizontalIcon className="size-5" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              {onEdit && (
                <DropdownItem onClick={() => onEdit(wi)}>
                  <DropdownLabel>{t('common.edit')}</DropdownLabel>
                </DropdownItem>
              )}
              {onDelete && (
                <DropdownItem onClick={() => onDelete(wi)}>
                  <DropdownLabel>{t('common.delete')}</DropdownLabel>
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>
        )}
      </div>

      {/* Body — equipment (3 states) → diagnosis → parts & readiness. */}
      <div className="space-y-3 px-3.5 py-3">
        {wi.equipment ? (
          <WorkItemEquipmentBlock
            equipment={wi.equipment}
            readOnly={readOnly}
            onOpenEquipment={onSelectSubUnit}
            onChange={onEdit ? () => onEdit(wi) : undefined}
            onSelectSubUnit={onSelectSubUnit}
            onAddSubUnit={onAddSubUnit}
          />
        ) : noneNeeded ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-fg-dim">{t('workOrders.workItems.noEquipmentNeeded')}</span>
            {canAttach && (
              <button
                type="button"
                onClick={attach}
                className="inline-flex items-center gap-1 font-semibold text-fg-accent hover:underline"
              >
                <PlusIcon className="size-3.5" />
                {t('workOrders.workItems.attach')}
              </button>
            )}
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed px-3 py-2.5"
            style={{
              borderColor: 'color-mix(in oklch, var(--accent-500) 40%, var(--border))',
              background: 'color-mix(in oklch, var(--accent-500) 4%, var(--bg-elev))',
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12.5px] font-semibold text-fg-accent">
                {t('workOrders.detail.overview.attachEquipment')}
              </span>
              <span className="flex-1" />
              {!readOnly && onEdit && (
                <Button plain onClick={() => onEdit(wi)}>
                  {t('workOrders.workItems.attach')}
                </Button>
              )}
              {!readOnly && onAddEquipment && (
                <button
                  type="button"
                  onClick={() => onAddEquipment(wi)}
                  className="text-[12px] font-semibold text-fg-accent hover:underline"
                >
                  {t('common.actions.add', { entity: getName('equipment') })}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Diagnosis — plain labeled section (mock §3): real text or a prompt. */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {t('workOrders.workItems.diagnosis')}
          </div>
          {diagnosis ? (
            <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-fg-strong">{diagnosis}</p>
          ) : (
            <p className="mt-0.5 text-[12.5px] italic text-fg-muted">
              {t('workOrders.workItems.notDiagnosed')}
            </p>
          )}
        </div>

        {/* Parts & readiness — the parts log + PO linkage are backend-deferred
            (ship with procurement), so render the mock's empty state for now. */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {t('workOrders.workItems.partsReadiness')}
          </div>
          <Text size="sm" tone="muted" className="mt-0.5">
            {t('workOrders.workItems.noPartsYet')}
          </Text>
        </div>
      </div>

      {/* Footer — trips addressing this item + edit. (parts-ready / add-to-quote
          land with the parts backend.) */}
      <div className="flex items-center gap-2 border-t border-border-soft bg-bg-elev-2 px-3.5 py-2 text-[11.5px]">
        <span className="flex items-center gap-1.5 text-fg-muted">
          <TruckIcon className="size-3.5" />
          {trips.length > 0 ? (
            <span className="font-medium text-fg-strong">
              {trips.map((n, i) => (
                <span key={n}>
                  {i > 0 && ', '}
                  {t('workOrders.detail.overview.tripShort', { n })}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-fg-dim">{t('workOrders.detail.notScheduled')}</span>
          )}
        </span>
        <span className="flex-1" />
        {!readOnly && onEdit && (
          <button
            type="button"
            onClick={() => onEdit(wi)}
            className="font-semibold text-fg-accent hover:underline"
          >
            {t('common.edit')}
          </button>
        )}
      </div>
    </div>
  );
}

// Inline add-item composer (designer mock): complaint + optional equipment →
// atomic create. Mirrors intake's shape; status defaults server-side (Triage).
function NewWorkItemComposer({
  workOrderId,
  serviceLocationId,
  onClose,
}: {
  workOrderId: string;
  serviceLocationId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [complaint, setComplaint] = useState('');
  const [equipment, setEquipment] = useState<EquipmentSummary | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      workOrderApi.createWorkItem(workOrderId, {
        description: complaint.trim(),
        equipmentId: equipment?.id ?? undefined,
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
      <div className="border-b border-border-soft px-3.5 py-2.5 text-[13px] font-semibold text-fg-strong">
        {t('workOrders.workItems.newItem', { entity: getName('work_item') })}
      </div>
      <div className="space-y-3 px-3.5 py-3">
        <Field size="xs">
          <Label size="xs" required>
            {t('workOrders.workItems.complaint')}
          </Label>
          <Textarea
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            rows={2}
            autoFocus
            placeholder={t('workOrders.workItems.complaintPlaceholder')}
          />
        </Field>
        {serviceLocationId && (
          <EquipmentPicker
            label={getName('equipment')}
            value={equipment}
            onChange={setEquipment}
            serviceLocationId={serviceLocationId}
          />
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
    </div>
  );
}
