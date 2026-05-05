import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentApi,
  type StatusWorkflowRule,
  type UpdateEquipmentRequest,
  type WorkItemEquipmentSummary,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import EquipmentThumbnail from './EquipmentThumbnail';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './catalyst/table';
import { Text } from './catalyst/text';
import { Button } from './catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';
import {
  ArrowTopRightOnSquareIcon,
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import EditableField from './EditableField';
import WorkItemStatusPill from './WorkItemStatusPill';

interface Props {
  workOrderId: string;
  workItems: WorkItemResponse[];
  statuses: WorkItemStatus[];
  workflows: StatusWorkflowRule[];
  enforceWorkflow: boolean;
  readOnly?: boolean;
  /** When provided, each row gets a per-row menu with an Edit option. Also
   *  drives the "Add equipment" affordance in the empty-state expansion. */
  onEdit?: (wi: WorkItemResponse) => void;
  /** When provided, each row gets a per-row menu with a Delete option. */
  onDelete?: (wi: WorkItemResponse) => void;
  /**
   * When provided, the description cell becomes click-to-edit (textarea via
   * EditableField). Returns a Promise so the field can stay in edit mode on
   * error. Status edits go through the pill, not this callback.
   */
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
  /**
   * When provided, the "Edit all" button in an expanded equipment block calls
   * this with the equipment id. The parent is expected to fetch the full
   * Equipment record and open EquipmentFormDialog over the work order page.
   */
  onEditEquipment?: (equipmentId: string) => void;
}

export default function WorkItemsTable({
  workOrderId,
  workItems,
  statuses,
  workflows,
  enforceWorkflow,
  readOnly = false,
  onEdit,
  onDelete,
  onSaveDescription,
  onEditEquipment,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  // Independent expansion state per row — multiple rows may be expanded at the
  // same time (CSRs comparing two items). Resets on navigation; not persisted.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpansion = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Equipment summaries are embedded on workItems[].equipment in WO responses,
  // so single-field PATCHes have to refresh both work-order query prefixes
  // (single detail and paginated lists). Mirrors the helper on
  // EquipmentDetailPage so cross-surface edits stay coherent.
  const invalidateEquipmentRelatedCaches = (equipmentId: string) => {
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
  };

  const updateEquipmentMutation = useMutation({
    mutationFn: ({
      equipmentId,
      data,
    }: {
      equipmentId: string;
      data: UpdateEquipmentRequest;
    }) => equipmentApi.update(equipmentId, data),
    onSuccess: (_data, vars) => invalidateEquipmentRelatedCaches(vars.equipmentId),
  });

  // Single-field equipment PATCH used by every EditableField in the expanded
  // equipment block. Throws on failure so the field stays in edit mode and the
  // user can retry / Esc to cancel — same pattern as EquipmentDetailPage and
  // WorkOrderDetailPage.
  const handleSaveEquipmentField = async <K extends keyof UpdateEquipmentRequest>(
    equipmentId: string,
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => {
    try {
      await updateEquipmentMutation.mutateAsync({
        equipmentId,
        data: { [field]: next } as UpdateEquipmentRequest,
      });
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('equipment') }));
      throw err;
    }
  };

  if (workItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
        <Text className="text-zinc-500 dark:text-zinc-400">
          {t('workOrders.workItems.empty', {
            children: getName('work_item', true),
            entity: getName('work_order'),
          })}
        </Text>
      </div>
    );
  }

  // Show the actions column only when at least one callback is wired up and the
  // WO isn't frozen — keeps the column out entirely on read-only views.
  const showActions = !readOnly && !!(onEdit || onDelete);
  // chevron + status + description (+ actions). "Last updated" column dropped
  // — its content lives in the muted footer at the bottom of the expansion now,
  // so it doesn't have to fight description for column width.
  const totalCols = 3 + (showActions ? 1 : 0);

  return (
    <Table dense className="[--gutter:theme(spacing.1)] text-sm">
      <TableHead>
        <TableRow>
          <TableHeader className="w-px" aria-hidden />
          <TableHeader className="w-px whitespace-nowrap">{t('workOrders.table.statusHeader')}</TableHeader>
          {/* w-full on this header makes description the "fill" column under
              table-layout: auto, so its width is decided by the layout pass
              rather than the cell's content. Without this, the column shrinks
              when a row swaps from display text to a <textarea>, whose
              intrinsic preferred width (cols=20) is narrower than the wrapped
              text's max-content. */}
          <TableHeader className="w-full">{t('common.form.description')}</TableHeader>
          {showActions && <TableHeader className="w-12" />}
        </TableRow>
      </TableHead>
      <TableBody>
        {workItems.flatMap((wi) => {
          const expanded = expandedIds.has(wi.id);
          const detailsId = `wi-${wi.id}-details`;
          const rows = [
            <TableRow key={wi.id} className="align-top">
              <TableCell className="w-px whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleExpansion(wi.id)}
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  aria-label={
                    expanded
                      ? t('workOrders.workItems.collapseRow')
                      : t('workOrders.workItems.expandRow')
                  }
                  className="inline-flex size-6 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                  <ChevronRightIcon
                    className={
                      'size-4 transition-transform duration-150' +
                      (expanded ? ' rotate-90' : '')
                    }
                  />
                </button>
              </TableCell>
              <TableCell>
                <WorkItemStatusPill
                  workOrderId={workOrderId}
                  workItem={wi}
                  statuses={statuses}
                  workflows={workflows}
                  enforceWorkflow={enforceWorkflow}
                  readOnly={readOnly}
                />
              </TableCell>
              <TableCell>
                {/* Thumbnail + description as a 2-column flex. Thumbnail
                    gives CSRs a visual id when scanning the table — much
                    faster than reading model/serial. */}
                <div className="flex items-start gap-2">
                  {wi.equipment ? (
                    <EquipmentThumbnail
                      url={wi.equipment.profileImageUrl}
                      name={wi.equipment.name}
                      sizeClass="size-8"
                      fit="contain"
                    />
                  ) : (
                    <div className="size-8 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                    {onSaveDescription && !readOnly ? (
                      <EditableField
                        as="textarea"
                        value={wi.description}
                        onSave={(next) => onSaveDescription(wi, next)}
                        rows={3}
                        ariaLabel={t('workOrders.workItems.editDescription')}
                      />
                    ) : (
                      wi.description
                    )}
                    {wi.equipment && (
                      <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        <RouterLink
                          to={`/equipment/${wi.equipment.id}`}
                          className="hover:text-blue-600 hover:underline dark:hover:text-blue-400"
                        >
                          {wi.equipment.name}
                        </RouterLink>
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              {showActions && (
                <TableCell>
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
                </TableCell>
              )}
            </TableRow>,
          ];
          if (expanded) {
            rows.push(
              <TableRow key={detailsId}>
                <TableCell
                  colSpan={totalCols}
                  className="bg-zinc-50/70 dark:bg-zinc-900/40"
                  id={detailsId}
                >
                  <div className="px-3 py-2">
                    <WorkItemDetailSections
                      workItem={wi}
                      readOnly={readOnly}
                      onEdit={onEdit}
                      onEditEquipment={onEditEquipment}
                      onSaveEquipmentField={handleSaveEquipmentField}
                    />
                  </div>
                </TableCell>
              </TableRow>
            );
          }
          return rows;
        })}
      </TableBody>
    </Table>
  );
}

interface DetailSectionsProps {
  workItem: WorkItemResponse;
  readOnly: boolean;
  onEdit?: (wi: WorkItemResponse) => void;
  onEditEquipment?: (equipmentId: string) => void;
  onSaveEquipmentField: <K extends keyof UpdateEquipmentRequest>(
    equipmentId: string,
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => Promise<void>;
}

/**
 * Sections rendered inside an expanded work-item row. The Equipment section is
 * the primary edit surface — most equipment writes happen in WO context, so
 * fields here are inline-editable rather than read-only summaries.
 *
 * Sub-units, photos, equipment notes, and linked-entity chips slot in as
 * follow-up sections nested under the Equipment block once their backends
 * land. The "Updated" footer is OUTSIDE the equipment block — it's the work
 * item's timestamp, not the equipment's.
 */
function WorkItemDetailSections({
  workItem,
  readOnly,
  onEdit,
  onEditEquipment,
  onSaveEquipmentField,
}: DetailSectionsProps) {
  const { t } = useTranslation();
  const equipment = workItem.equipment;

  return (
    <div className="space-y-3">
      <EquipmentBlock
        equipment={equipment}
        workItem={workItem}
        readOnly={readOnly}
        onEditWorkItem={onEdit}
        onEditEquipment={onEditEquipment}
        onSaveEquipmentField={onSaveEquipmentField}
      />

      {/* Work-item metadata footer — OUTSIDE the equipment block. This is the
          work item's updatedAt, not the equipment's; nesting it inside
          Equipment would conflate two entities. */}
      <div className="text-xs italic text-zinc-500 dark:text-zinc-400">
        {t('workOrders.workItems.updatedFooter', {
          time: formatRelativeTime(workItem.updatedAt),
        })}
      </div>
    </div>
  );
}

interface EquipmentBlockProps {
  equipment: WorkItemEquipmentSummary | null;
  workItem: WorkItemResponse;
  readOnly: boolean;
  onEditWorkItem?: (wi: WorkItemResponse) => void;
  onEditEquipment?: (equipmentId: string) => void;
  onSaveEquipmentField: <K extends keyof UpdateEquipmentRequest>(
    equipmentId: string,
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => Promise<void>;
}

function EquipmentBlock({
  equipment,
  workItem,
  readOnly,
  onEditWorkItem,
  onEditEquipment,
  onSaveEquipmentField,
}: EquipmentBlockProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  // Empty state — no equipment linked. Show the section header so the surface
  // is consistent across rows, plus an inline action to attach equipment via
  // the work-item edit dialog (where the equipment picker lives).
  if (!equipment) {
    return (
      <section aria-label={getName('equipment')}>
        <SectionHeader label={getName('equipment')} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Text className="text-zinc-600 dark:text-zinc-400">
            {t('workOrders.workItems.noEquipmentLinked', {
              entity: getName('equipment'),
            })}
          </Text>
          {!readOnly && onEditWorkItem && (
            <button
              type="button"
              onClick={() => onEditWorkItem(workItem)}
              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
            >
              <PlusIcon className="size-4" />
              {t('common.actions.add', { entity: getName('equipment') })}
            </button>
          )}
        </div>
      </section>
    );
  }

  const typeCategoryLine = [equipment.equipmentTypeName, equipment.equipmentCategoryName]
    .filter(Boolean)
    .join(' · ');

  const saveField = <K extends keyof UpdateEquipmentRequest>(
    field: K,
    value: UpdateEquipmentRequest[K]
  ) => onSaveEquipmentField(equipment.id, field, value);

  return (
    <section aria-label={getName('equipment')}>
      <SectionHeader
        label={getName('equipment')}
        actions={
          <>
            {!readOnly && onEditEquipment && (
              <Button plain onClick={() => onEditEquipment(equipment.id)}>
                <PencilIcon className="size-4" />
                {t('workOrders.workItems.editAll')}
              </Button>
            )}
            <Button plain href={`/equipment/${equipment.id}`}>
              <ArrowTopRightOnSquareIcon className="size-4" />
              {t('workOrders.workItems.openPage')}
            </Button>
          </>
        }
      />

      {/* Identity row: thumbnail (48px) + name + type/category subline. */}
      <div className="mt-1 flex items-start gap-3">
        <EquipmentThumbnail
          url={equipment.profileImageUrl}
          name={equipment.name}
          sizeClass="size-12"
          fit="contain"
        />
        <div className="min-w-0 flex-1">
          {readOnly ? (
            <RouterLink
              to={`/equipment/${equipment.id}`}
              className="font-medium text-zinc-950 hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400"
            >
              {equipment.name}
            </RouterLink>
          ) : (
            <EditableField
              value={equipment.name}
              onSave={(v) => saveField('name', v)}
              ariaLabel={t('common.form.name')}
              className="font-medium"
            />
          )}
          {typeCategoryLine && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {typeCategoryLine}
            </div>
          )}
        </div>
      </div>

      {/* Inline-edit grid of currently-projected fields. Make/Model/Serial/
          Location-on-Site cover the day-to-day edits; deeper fields (asset
          tag, install date, warranty, description) live behind "Edit all". */}
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr_max-content_1fr]">
        <FieldRow
          label={t('equipment.form.make')}
          value={equipment.make ?? ''}
          onSave={(v) => saveField('make', v || null)}
          ariaLabel={t('equipment.form.make')}
          readOnly={readOnly}
        />
        <FieldRow
          label={t('equipment.form.model')}
          value={equipment.model ?? ''}
          onSave={(v) => saveField('model', v || null)}
          ariaLabel={t('equipment.form.model')}
          readOnly={readOnly}
        />
        <FieldRow
          label={t('equipment.form.serialNumber')}
          value={equipment.serialNumber ?? ''}
          onSave={(v) => saveField('serialNumber', v || null)}
          ariaLabel={t('equipment.form.serialNumber')}
          readOnly={readOnly}
          className="font-mono"
        />
        <FieldRow
          label={t('equipment.form.locationOnSite')}
          value={equipment.locationOnSite ?? ''}
          onSave={(v) => saveField('locationOnSite', v || null)}
          ariaLabel={t('equipment.form.locationOnSite')}
          readOnly={readOnly}
        />
      </dl>
    </section>
  );
}

interface SectionHeaderProps {
  label: string;
  actions?: React.ReactNode;
}

function SectionHeader({ label, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

interface FieldRowProps {
  label: string;
  value: string;
  onSave: (next: string) => Promise<void>;
  ariaLabel: string;
  readOnly: boolean;
  className?: string;
}

/**
 * Row in the inline-edit grid. Renders a label cell + a value cell; the value
 * cell is an EditableField when not readOnly. The grid lives in the parent
 * (`grid-cols-[max-content_1fr_max-content_1fr]`) so two FieldRows side-by-side
 * fill one visual row.
 */
function FieldRow({ label, value, onSave, ariaLabel, readOnly, className }: FieldRowProps) {
  return (
    <>
      <dt className="self-center text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="self-center">
        {readOnly ? (
          <span className={className}>{value || '—'}</span>
        ) : (
          <EditableField
            value={value}
            onSave={onSave}
            ariaLabel={ariaLabel}
            className={className}
          />
        )}
      </dd>
    </>
  );
}
