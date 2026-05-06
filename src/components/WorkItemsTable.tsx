import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentApi,
  equipmentImagesApi,
  EquipmentStatus,
  type EquipmentNote,
  type StatusWorkflowRule,
  type UpdateEquipmentRequest,
  type WorkItemEquipmentSummary,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import EquipmentNotesSection from './EquipmentNotesSection';
import EquipmentPhotosSection from './EquipmentPhotosSection';
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
import { Badge } from './catalyst/badge';
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
import EquipmentImageUploadDialog from './EquipmentImageUploadDialog';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';
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
  /**
   * When provided, the empty-state "+ Add Equipment" affordance opens a
   * focused create flow (EquipmentFormDialog with the WO's service location
   * pre-locked) instead of the generic Edit Work Item dialog. The parent
   * patches the work item with the new equipment id on success.
   */
  onAddEquipment?: (wi: WorkItemResponse) => void;
  /**
   * Sub-unit chip click → parent opens the equipment quickview drawer with
   * the chosen sub-unit. When omitted, chips fall back to RouterLink
   * navigation (legacy behavior).
   */
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  /**
   * "+ Add unit" click → parent opens EquipmentFormDialog with the supplied
   * equipment locked as the parent. The new sub-unit's parentId is set on
   * create; serviceLocationId is inherited (same location as the parent).
   */
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
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
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
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
                      onAddEquipment={onAddEquipment}
                      onSelectSubUnit={onSelectSubUnit}
                      onAddSubUnit={onAddSubUnit}
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
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
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
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  onSaveEquipmentField,
}: DetailSectionsProps) {
  const equipment = workItem.equipment;

  return (
    <div className="space-y-3">
      <EquipmentBlock
        equipment={equipment}
        workItem={workItem}
        readOnly={readOnly}
        onEditWorkItem={onEdit}
        onAddEquipment={onAddEquipment}
        onEditEquipment={onEditEquipment}
        onSelectSubUnit={onSelectSubUnit}
        onAddSubUnit={onAddSubUnit}
        onSaveEquipmentField={onSaveEquipmentField}
      />
    </div>
  );
}

interface EquipmentBlockProps {
  equipment: WorkItemEquipmentSummary | null;
  workItem: WorkItemResponse;
  readOnly: boolean;
  onEditWorkItem?: (wi: WorkItemResponse) => void;
  onAddEquipment?: (wi: WorkItemResponse) => void;
  onEditEquipment?: (equipmentId: string) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
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
  onAddEquipment,
  onEditEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  onSaveEquipmentField,
}: EquipmentBlockProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  // Empty state — no equipment linked. Prefer the focused create flow
  // (onAddEquipment → EquipmentFormDialog with the WO's location pre-locked +
  // auto-link on save). Fall back to the generic Edit Work Item dialog when
  // the parent didn't wire onAddEquipment, so picking an existing equipment
  // is still reachable.
  if (!equipment) {
    const canAdd = !readOnly && (onAddEquipment || onEditWorkItem);
    const handleAdd = () => {
      if (onAddEquipment) onAddEquipment(workItem);
      else if (onEditWorkItem) onEditWorkItem(workItem);
    };
    return (
      <section aria-label={getName('equipment')}>
        <SectionHeader label={getName('equipment')} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Text className="text-zinc-600 dark:text-zinc-400">
            {t('workOrders.workItems.noEquipmentLinked', {
              entity: getName('equipment'),
            })}
          </Text>
          {canAdd && (
            <button
              type="button"
              onClick={handleAdd}
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

  return (
    <EquipmentBlockBody
      equipment={equipment}
      readOnly={readOnly}
      onEditEquipment={onEditEquipment}
      onSelectSubUnit={onSelectSubUnit}
      onAddSubUnit={onAddSubUnit}
      onSaveEquipmentField={onSaveEquipmentField}
    />
  );
}

interface EquipmentBlockBodyProps {
  equipment: WorkItemEquipmentSummary;
  readOnly: boolean;
  onEditEquipment?: (equipmentId: string) => void;
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
  onSaveEquipmentField: <K extends keyof UpdateEquipmentRequest>(
    equipmentId: string,
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => Promise<void>;
}

function EquipmentBlockBody({
  equipment,
  readOnly,
  onEditEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  onSaveEquipmentField,
}: EquipmentBlockBodyProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);

  // Lazy-fetch the image list for this equipment when the row is expanded.
  // Cache key matches EquipmentDetailPage so uploads on the dedicated page
  // invalidate this surface in lockstep. The hero thumbnail and PhotosSection
  // both feed into a single lightbox owned here.
  const { data: images = [] } = useQuery({
    queryKey: ['equipment-images', equipment.id],
    queryFn: () => equipmentImagesApi.list(equipment.id),
  });

  // Sort defensively: profile-first then sortOrder. Same contract the
  // PhotosSection used to enforce internally.
  const orderedImages = [...images].sort((a, b) => {
    if (a.isProfile && !b.isProfile) return -1;
    if (!a.isProfile && b.isProfile) return 1;
    return a.sortOrder - b.sortOrder;
  });

  const hasImages = orderedImages.length > 0;
  const heroClickable = hasImages && !!equipment.profileImageUrl;

  const typeCategoryLine = [equipment.equipmentTypeName, equipment.equipmentCategoryName]
    .filter(Boolean)
    .join(' · ');

  const saveField = <K extends keyof UpdateEquipmentRequest>(
    field: K,
    value: UpdateEquipmentRequest[K]
  ) => onSaveEquipmentField(equipment.id, field, value);

  const heroThumbnail = (
    <EquipmentThumbnail
      url={equipment.profileImageUrl}
      name={equipment.name}
      sizeClass="size-12"
      fit="contain"
    />
  );

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
            {!readOnly && (
              <Button plain onClick={() => setIsImageUploadOpen(true)}>
                <PlusIcon className="size-4" />
                {t('equipment.images.addPhoto')}
              </Button>
            )}
            <Button plain href={`/equipment/${equipment.id}`}>
              <ArrowTopRightOnSquareIcon className="size-4" />
              {t('workOrders.workItems.openPage')}
            </Button>
          </>
        }
      />

      {/* Identity row: thumbnail (48px) + name + status pill + type/category subline.
          Hero thumbnail becomes a click target when images exist — opens the
          shared lightbox at index 0 (the profile image, by sort contract). */}
      <div className="mt-1 flex items-start gap-3">
        {heroClickable ? (
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            aria-label={t('equipment.images.openFullSize')}
            className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {heroThumbnail}
          </button>
        ) : (
          heroThumbnail
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
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
            {equipment.status && (
              <EquipmentStatusPill
                status={equipment.status}
                readOnly={readOnly}
                onSave={(next) => saveField('status', next)}
              />
            )}
          </div>
          {typeCategoryLine && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {typeCategoryLine}
            </div>
          )}
        </div>
      </div>

      {/* Inline-edit grid: Make / Model on row 1, Serial / Location on
          row 2. Deeper fields (asset tag, install date, warranty,
          description) live behind "Edit all" — asset tag in particular is
          a tech/scanner field, not a CSR scan field, so it doesn't earn
          the inline real estate. */}
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

      <SubUnitsRow
        descendants={equipment.descendants}
        descendantCount={equipment.descendantCount}
        equipmentId={equipment.id}
        equipmentName={equipment.name}
        readOnly={readOnly}
        onSelectSubUnit={onSelectSubUnit}
        onAddSubUnit={onAddSubUnit}
      />

      <EquipmentPhotosSection
        images={orderedImages}
        onSelectImage={(i) => setLightboxIndex(i)}
      />

      {/* recentNotes shape on WorkItemEquipmentSummary is inlined (not the
          EquipmentNote type) to avoid a circular import in workOrderApi.
          The fields match exactly, so the cast is structural equality. */}
      <EquipmentNotesSection
        equipmentId={equipment.id}
        recentNotes={(equipment.recentNotes ?? []) as EquipmentNote[]}
        noteCount={equipment.noteCount ?? 0}
        readOnly={readOnly}
      />

      <EquipmentPhotoLightbox
        equipmentId={equipment.id}
        images={orderedImages}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        readOnly={readOnly}
      />

      <EquipmentImageUploadDialog
        isOpen={isImageUploadOpen}
        onClose={() => setIsImageUploadOpen(false)}
        equipmentId={equipment.id}
        defaultSetProfile={!hasImages}
      />
    </section>
  );
}

interface EquipmentStatusPillProps {
  status: 'ACTIVE' | 'RETIRED';
  readOnly: boolean;
  onSave: (next: EquipmentStatus) => Promise<void>;
}

/**
 * Renders an attention-grabbing badge when (and only when) the linked
 * equipment is RETIRED — a WO scheduled against a retired unit is a real
 * signal CSRs should notice. Clicking the badge offers a one-click
 * un-retire (RETIRED → ACTIVE). Going the other direction (ACTIVE →
 * RETIRED) is intentionally NOT reachable inline — that's a destructive
 * lifecycle change that routes through the "Edit all" dialog where the
 * full equipment context is visible. Returns null for the ACTIVE case so
 * the common-path UI stays uncluttered.
 */
function EquipmentStatusPill({ status, readOnly, onSave }: EquipmentStatusPillProps) {
  const { t } = useTranslation();
  if (status === EquipmentStatus.ACTIVE) return null;

  const retiredBadge = <Badge color="amber">{t('equipment.status.retired')}</Badge>;
  if (readOnly) return retiredBadge;

  return (
    <EditableField
      as="select"
      value={status}
      options={[
        { value: EquipmentStatus.ACTIVE, label: t('equipment.status.active') },
        { value: EquipmentStatus.RETIRED, label: t('equipment.status.retired') },
      ]}
      onSave={(v) => onSave(v as EquipmentStatus)}
      ariaLabel={t('common.form.status')}
      renderDisplay={() => retiredBadge}
    />
  );
}

interface SubUnitsRowProps {
  descendants?: Array<{ id: string; name: string; profileImageUrl?: string | null }>;
  descendantCount?: number;
  equipmentId: string;
  equipmentName: string;
  readOnly: boolean;
  /** Click on a chip → push onto the drawer stack to peek at the sub-unit. */
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  /** Click on "+ Add" → open EquipmentFormDialog with this equipment locked
   *  as the parent. Suppressed in readOnly mode. */
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
}

/**
 * Direct sub-units rendered as compact chips with thumbnails for visual
 * scan id. Always renders even when empty so the "+ Add" affordance is
 * discoverable — sub-unit creation happens ~100% in WO context per CSR
 * workflow. Chip click hands off to the drawer stack (onSelectSubUnit)
 * so the user can drill in without leaving the WO; "+ Add" hands off to
 * the parent's EquipmentFormDialog with the parent equipment locked.
 *
 * When the backend truncates the descendants list (descendantCount >
 * descendants.length), a trailing "+N more" link routes to the equipment
 * detail page where the full Components tab lives — this case ships
 * unchanged from the previous version.
 */
function SubUnitsRow({
  descendants,
  descendantCount,
  equipmentId,
  equipmentName,
  readOnly,
  onSelectSubUnit,
  onAddSubUnit,
}: SubUnitsRowProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const list = descendants ?? [];
  const total = descendantCount ?? list.length;
  const remainder = Math.max(0, total - list.length);
  const canAdd = !readOnly && onAddSubUnit;

  // Hide the row entirely only when there's nothing to show AND no add
  // affordance — keeps the row out of readOnly views with empty units.
  if (list.length === 0 && !canAdd) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {t('workOrders.workItems.subUnits', { entities: getName('equipment_component', true), count: total })}
      </span>
      {list.map((d) =>
        onSelectSubUnit ? (
          <button
            key={d.id}
            type="button"
            onClick={() => onSelectSubUnit({ id: d.id, name: d.name })}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-0.5 pl-1 pr-2.5 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-200 hover:text-blue-600 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-blue-400"
          >
            <EquipmentThumbnail
              url={d.profileImageUrl}
              name={d.name}
              sizeClass="size-5"
              fit="cover"
            />
            <span>{d.name}</span>
            <ChevronRightIcon className="size-3" aria-hidden />
          </button>
        ) : (
          <RouterLink
            key={d.id}
            to={`/equipment/${d.id}`}
            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-0.5 pl-1 pr-2.5 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-200 hover:text-blue-600 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-blue-400"
          >
            <EquipmentThumbnail
              url={d.profileImageUrl}
              name={d.name}
              sizeClass="size-5"
              fit="cover"
            />
            <span>{d.name}</span>
            <ChevronRightIcon className="size-3" aria-hidden />
          </RouterLink>
        )
      )}
      {canAdd && (
        <button
          type="button"
          onClick={() => onAddSubUnit({ id: equipmentId, name: equipmentName })}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:ring-blue-900 dark:hover:bg-blue-950/30"
        >
          <PlusIcon className="size-3.5" />
          {t('common.actions.add', { entity: getName('equipment_component') })}
        </button>
      )}
      {remainder > 0 && (
        <RouterLink
          to={`/equipment/${equipmentId}`}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          {t('workOrders.workItems.subUnitsMore', { count: remainder })}
        </RouterLink>
      )}
    </div>
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
