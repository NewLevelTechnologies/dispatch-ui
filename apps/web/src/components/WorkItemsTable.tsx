import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  equipmentFiltersApi,
  equipmentImagesApi,
  EquipmentStatus,
  type EquipmentFilter,
  type EquipmentImage,
  type EquipmentNote,
  type WorkflowTransition,
  type UpdateEquipmentRequest,
  type WorkItemEquipmentSummary,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api/setup';
import { formatFilterSize } from '../utils/formatFilterSize';
import { useGlossary } from '../contexts/GlossaryContext';
import EquipmentNotesSection from './EquipmentNotesSection';
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
import { useSaveEquipmentField } from './useSaveEquipmentField';

interface Props {
  workOrderId: string;
  workItems: WorkItemResponse[];
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
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
  /**
   * Renders a "+ Work Item" button at the top of the table (and inside the
   * empty state). Replaces the page-level action bar's "+ Work Item" entry
   * point per §5d — actions live next to the data they affect. Suppressed
   * when omitted or when readOnly.
   */
  onAdd?: () => void;
}

export default function WorkItemsTable({
  workOrderId,
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
  onAdd,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const handleSaveEquipmentField = useSaveEquipmentField();

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

  // "+ Work Item" lives next to the table head per §5d. Only renders when the
  // parent supplied an onAdd handler and the WO isn't frozen — readOnly hides
  // every Edit / Add / Delete affordance on the page.
  const showAddButton = !readOnly && !!onAdd;
  const headerBar = showAddButton ? (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {getName('work_item', true)}
      </h2>
      <Button onClick={onAdd}>
        <PlusIcon className="size-4" />
        {t('common.actions.add', { entity: getName('work_item') })}
      </Button>
    </div>
  ) : null;

  if (workItems.length === 0) {
    return (
      <div>
        {headerBar}
        <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
          <Text className="text-zinc-500 dark:text-zinc-400">
            {t('workOrders.workItems.empty', {
              children: getName('work_item', true),
              entity: getName('work_order'),
            })}
          </Text>
        </div>
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
    <div>
      {headerBar}
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
                  transitions={transitions}
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
                      type={wi.equipment.equipmentTypeName}
                      monogram
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
    </div>
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
export function WorkItemDetailSections({
  workItem,
  readOnly,
  onEdit,
  onEditEquipment,
  onAddEquipment,
  onSelectSubUnit,
  onAddSubUnit,
  onSaveEquipmentField,
}: DetailSectionsProps) {
  const { t } = useTranslation();
  const equipment = workItem.equipment;
  const diagnosis = workItem.diagnosis?.trim();

  return (
    <div className="space-y-3">
      {/* Diagnosis — the tech's on-site assessment (distinct from the
          customer's complaint in `description`). Edited via the work-item
          dialog; shown here read-only with an empty state. */}
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
    // Explicit "none needed" state (equipmentNeeded === false): a calm, dismissed
    // line rather than the accent attach prompt — some items never attach a unit
    // (a drain clog, general labor). A compact "Attach" still lets a tech link one
    // on site. Toggling back to needed is a backend ask (equipmentNeeded isn't on
    // the work-item PATCH yet), so this is display-only for now.
    const noneNeeded = workItem.equipmentNeeded === false;
    return (
      <section aria-label={getName('equipment')}>
        <SectionHeader label={getName('equipment')} />
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {noneNeeded ? (
            <Text className="text-fg-dim">{t('workOrders.workItems.noEquipmentNeeded')}</Text>
          ) : (
            <Text className="text-zinc-600 dark:text-zinc-400">
              {t('workOrders.workItems.noEquipmentLinked', {
                entity: getName('equipment'),
              })}
            </Text>
          )}
          {canAdd && (
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
            >
              <PlusIcon className="size-4" />
              {noneNeeded
                ? t('workOrders.workItems.attach')
                : t('common.actions.add', { entity: getName('equipment') })}
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

  // Lazy-fetch filters for the same reason — the WorkItemEquipmentSummary
  // projection doesn't carry them, but they're often consulted in the
  // repair flow ("what filter size do I need to pick up?"). Same cache key
  // shape as EquipmentDetailPage's filter list so the two surfaces stay
  // in lockstep.
  const { data: filters = [] } = useQuery({
    queryKey: ['equipment-filters', equipment.id],
    queryFn: () => equipmentFiltersApi.getAll(equipment.id),
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
      type={equipment.equipmentTypeName}
      monogram
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
          shared lightbox at index 0 (the profile image, by sort contract).
          Photo strip lives at the right end of this row (when 2+ photos
          exist) so visual identity content clusters together rather than
          stacking a labeled PHOTOS section below — saves vertical and
          reads as "here's the unit, and here are more views of it." */}
      <div className="mt-1 flex items-start gap-3">
        {/* The thumbnail peeks the equipment RECORD in the quickview drawer —
            the same drawer sub-unit chips open (mock: thumb is a click target).
            The name stays inline-editable; "Open page" escalates to the full
            screen; the photo strip still opens the lightbox. Falls back to the
            lightbox when the drawer isn't wired (e.g. the legacy table). */}
        {onSelectSubUnit ? (
          <button
            type="button"
            onClick={() => onSelectSubUnit({ id: equipment.id, name: equipment.name })}
            aria-label={t('workOrders.workItems.openRecord')}
            className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {heroThumbnail}
          </button>
        ) : heroClickable ? (
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
        <PhotoStrip
          images={orderedImages}
          onSelect={(i) => setLightboxIndex(i)}
        />
      </div>

      {/* Inline-edit grid (Make/Serial pair + Model/Location pair) on the
          left, a compact Filters summary on the right when filters exist —
          flex row so the three share the available width without a new
          vertical band (filters are 0–3 values, they earn an inline spot,
          not a separate row). Split into two 2-col grids instead of one
          4-col so label-to-value pairing is tight (gap-x-3) while the gap
          between the two pairs stays generous (flex gap-x-6). Value-column
          min dropped from 7rem to 4rem — short values like "GOODMAN" no
          longer carry wide trailing whitespace before the next label, and
          the click-to-edit input still has 64px to render into. Wraps
          stacked on narrow screens. Deeper fields (asset tag, install
          date, warranty, description) live behind "Edit all". */}
      <div className="mt-2 flex flex-wrap items-start gap-x-6 gap-y-2">
        <dl className="grid grid-cols-[max-content_minmax(4rem,auto)] gap-x-3 gap-y-1 text-sm">
          <FieldRow
            label={t('equipment.form.make')}
            value={equipment.make ?? ''}
            onSave={(v) => saveField('make', v || null)}
            ariaLabel={t('equipment.form.make')}
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
        </dl>
        <dl className="grid grid-cols-[max-content_minmax(4rem,auto)] gap-x-3 gap-y-1 text-sm">
          <FieldRow
            label={t('equipment.form.model')}
            value={equipment.model ?? ''}
            onSave={(v) => saveField('model', v || null)}
            ariaLabel={t('equipment.form.model')}
            readOnly={readOnly}
          />
          <FieldRow
            label={t('equipment.form.locationOnSite')}
            value={equipment.locationOnSite ?? ''}
            onSave={(v) => saveField('locationOnSite', v || null)}
            ariaLabel={t('equipment.form.locationOnSite')}
            readOnly={readOnly}
          />
        </dl>
        <FiltersInline filters={filters} />
      </div>

      <SubUnitsRow
        descendants={equipment.descendants}
        descendantCount={equipment.descendantCount}
        equipmentId={equipment.id}
        equipmentName={equipment.name}
        readOnly={readOnly}
        onSelectSubUnit={onSelectSubUnit}
        onAddSubUnit={onAddSubUnit}
      />

      {/* recentNotes shape on WorkItemEquipmentSummary is inlined (not the
          EquipmentNote type) to avoid a circular import in workOrderApi.
          The fields match exactly, so the cast is structural equality.
          collapsible=true: notes are second-pass reference content here,
          not first-scan — collapsed-by-default with a one-line preview
          keeps the row dense without losing access. */}
      <EquipmentNotesSection
        equipmentId={equipment.id}
        recentNotes={(equipment.recentNotes ?? []) as EquipmentNote[]}
        noteCount={equipment.noteCount ?? 0}
        readOnly={readOnly}
        collapsible
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
              monogram
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
              monogram
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

interface FiltersInlineProps {
  filters: EquipmentFilter[];
}

/**
 * Compact read-only summary of the equipment's filter sizes, rendered to
 * the right of the inline-edit grid (flex sibling) so it occupies space
 * that would otherwise be empty rather than burning a vertical row.
 * Surfaced here because techs / CSRs often coordinate filter changes
 * during repairs ("what size do I need to pick up?"). Hidden when no
 * filters; full management still lives on the equipment detail page's
 * Filters tab.
 *
 * Sizes stack vertically (one per line) — filters are a list, and the
 * left side of the equipment block already runs 2 grid rows tall so the
 * stack fills available vertical real estate without growing the block.
 * "×N" suffix appears only when quantity > 1. Wraps below the grid on
 * narrow screens via the parent's flex-wrap.
 */
function FiltersInline({ filters }: FiltersInlineProps) {
  const { t } = useTranslation();
  if (filters.length === 0) return null;
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="whitespace-nowrap text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {t('equipment.tabs.filters')}:
      </span>
      <ul className="flex flex-col gap-0.5 text-zinc-700 dark:text-zinc-300">
        {filters.map((f) => (
          <li key={f.id}>
            {f.quantity > 1
              ? `${formatFilterSize(f)} ×${f.quantity}`
              : formatFilterSize(f)}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PhotoStripProps {
  images: EquipmentImage[];
  /** Click handler — receives the index in `images`. The +N overflow chip
   *  jumps to the first hidden index so the lightbox can flip through the
   *  rest of the set. */
  onSelect: (index: number) => void;
}

/**
 * Compact photo row pinned to the right of the equipment identity row.
 * Replaces the labeled PHOTOS sub-section below the equipment block on
 * dense WO row expansions — hero thumb + this strip cover the same visual
 * ground without burning a labeled section's worth of vertical space.
 *
 * Hidden when there's 0 or 1 image because the hero thumbnail already
 * surfaces the only photo via click-to-lightbox. Cap is 3 (vs the section
 * variant's 6) — the right column has narrow space and the +N chip routes
 * to the lightbox for full browsing.
 */
function PhotoStrip({ images, onSelect }: PhotoStripProps) {
  const { t } = useTranslation();
  if (images.length <= 1) return null;
  const cap = 3;
  const visible = images.slice(0, cap);
  const overflow = images.length - visible.length;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1">
      {visible.map((img, i) => (
        <button
          key={img.id}
          type="button"
          onClick={() => onSelect(i)}
          // 32px (size-8) — distinctly smaller than the 48px hero so the
          // identity hierarchy reads as "this is the unit, these are more
          // views." object-contain + bg keeps non-square photos uncropped.
          className="block size-8 overflow-hidden rounded bg-zinc-100 ring-1 ring-zinc-950/10 hover:ring-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-zinc-800 dark:ring-white/10"
          title={img.caption ?? t('equipment.images.openFullSize')}
        >
          <img
            src={img.thumbnailUrl ?? img.url}
            alt={img.caption ?? ''}
            className="size-full object-contain"
            loading="lazy"
          />
        </button>
      ))}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => onSelect(visible.length)}
          className="flex size-8 items-center justify-center rounded text-xs font-medium text-zinc-700 ring-1 ring-zinc-950/10 hover:bg-zinc-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-zinc-300 dark:ring-white/10 dark:hover:bg-white/5 dark:hover:text-blue-400"
        >
          +{overflow}
        </button>
      )}
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
