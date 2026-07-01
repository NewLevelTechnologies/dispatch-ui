import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  type EquipmentSummary,
  type ProgressCategory,
  type UpdateEquipmentRequest,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, extractApiError } from '../lib/toast';
import EquipmentThumbnail from './EquipmentThumbnail';
import EquipmentPicker from './EquipmentPicker';
import EditableField from './EditableField';
import WorkItemStatusPill from './WorkItemStatusPill';
import { WorkItemDetailSections } from './WorkItemsTable';
import { useSaveEquipmentField } from './useSaveEquipmentField';
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
import { PlusIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';

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
  onEditEquipment,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const saveEquipmentField = useSaveEquipmentField();
  const [composing, setComposing] = useState(false);

  return (
    <div className="flex flex-col gap-3">
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
            statuses={statuses}
            transitions={transitions}
            enforceWorkflow={enforceWorkflow}
            readOnly={readOnly}
            onEdit={onEdit}
            onDelete={onDelete}
            onSaveDescription={onSaveDescription}
            onEditEquipment={onEditEquipment}
            onAddEquipment={onAddEquipment}
            onSelectSubUnit={onSelectSubUnit}
            onAddSubUnit={onAddSubUnit}
            onSaveEquipmentField={saveEquipmentField}
          />
        ))
      )}
    </div>
  );
}

function WorkItemCard({
  workOrderId,
  wi,
  statuses,
  transitions,
  enforceWorkflow,
  readOnly,
  onEdit,
  onDelete,
  onSaveDescription,
  onEditEquipment,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  onSaveEquipmentField,
}: {
  workOrderId: string;
  wi: WorkItemResponse;
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  readOnly: boolean;
  onEdit?: (wi: WorkItemResponse) => void;
  onDelete?: (wi: WorkItemResponse) => void;
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  onEditEquipment?: (equipmentId: string) => void;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
  onSaveEquipmentField: <K extends keyof UpdateEquipmentRequest>(
    equipmentId: string,
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => Promise<void>;
}) {
  const { t } = useTranslation();
  const showActions = !readOnly && !!(onEdit || onDelete);

  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-bg-elev"
      style={{ borderLeft: `3px solid ${RAIL[wi.statusCategory]}` }}
    >
      {/* Head — complaint + status pill + actions. */}
      <div className="flex items-start gap-2.5 border-b border-border-soft px-3.5 py-2.5">
        {wi.equipment && (
          <EquipmentThumbnail
            url={wi.equipment.profileImageUrl}
            name={wi.equipment.name}
            sizeClass="size-8"
            fit="contain"
          />
        )}
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

      {/* Body — diagnosis + rich equipment block (reused), then parts. */}
      <div className="space-y-3 px-3.5 py-3">
        <WorkItemDetailSections
          workItem={wi}
          readOnly={readOnly}
          onEdit={onEdit}
          onEditEquipment={onEditEquipment}
          onAddEquipment={onAddEquipment}
          onSelectSubUnit={onSelectSubUnit}
          onAddSubUnit={onAddSubUnit}
          onSaveEquipmentField={onSaveEquipmentField}
        />

        {/* Parts & readiness — operational, no pricing. The parts log + PO
            linkage are backend-deferred (ship with procurement), so render
            the mock's empty state for now. */}
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-fg-muted">
            {t('workOrders.workItems.partsReadiness')}
          </div>
          <Text size="sm" tone="muted" className="mt-0.5">
            {t('workOrders.workItems.noPartsYet')}
          </Text>
        </div>
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
