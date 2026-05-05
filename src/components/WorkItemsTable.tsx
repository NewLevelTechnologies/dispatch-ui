import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  type StatusWorkflowRule,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { formatRelativeTime } from '../utils/formatRelativeTime';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './catalyst/table';
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from './catalyst/description-list';
import { Text } from './catalyst/text';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';
import {
  ChevronRightIcon,
  EllipsisHorizontalIcon,
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
  /** When provided, each row gets a per-row menu with an Edit option. */
  onEdit?: (wi: WorkItemResponse) => void;
  /** When provided, each row gets a per-row menu with a Delete option. */
  onDelete?: (wi: WorkItemResponse) => void;
  /**
   * When provided, the description cell becomes click-to-edit (textarea via
   * EditableField). Returns a Promise so the field can stay in edit mode on
   * error. Status edits go through the pill, not this callback.
   */
  onSaveDescription?: (wi: WorkItemResponse, next: string) => Promise<void>;
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
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

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
  // chevron + status + description + lastUpdated (+ actions)
  const totalCols = 4 + (showActions ? 1 : 0);

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
          <TableHeader className="w-px whitespace-nowrap">{t('workOrders.workItems.lastUpdated')}</TableHeader>
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
              <TableCell className="whitespace-pre-wrap break-words">
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
              </TableCell>
              <TableCell className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                {formatRelativeTime(wi.updatedAt)}
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
                {/* Subtle muted bg signals "detail of the row above". The
                    Catalyst dense cell uses gutter (1) for horizontal
                    padding, which is too tight for the section content;
                    inner div restores breathable padding without fighting
                    Tailwind important overrides. */}
                <TableCell
                  colSpan={totalCols}
                  className="bg-zinc-50/70 dark:bg-zinc-900/40"
                  id={detailsId}
                >
                  <div className="px-3 py-1">
                    <WorkItemDetailSections
                      workItem={wi}
                      readOnly={readOnly}
                      onEdit={onEdit}
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
}

/**
 * Sections rendered inside an expanded work-item row. Today only the
 * Equipment section has data; notes / files / linked entities slot in here
 * as separate sections when their backends ship (see WORK_ORDER_DETAIL_DESIGN.md
 * §3.3 / §7).
 */
function WorkItemDetailSections({ workItem, readOnly, onEdit }: DetailSectionsProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const equipment = workItem.equipment;

  const typeCategoryLine = equipment
    ? [equipment.equipmentTypeName, equipment.equipmentCategoryName]
        .filter(Boolean)
        .join(' · ')
    : '';
  const makeModel = equipment
    ? [equipment.make, equipment.model].filter(Boolean).join(' ')
    : '';

  return (
    <section aria-label={getName('equipment')}>
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {getName('equipment')}
      </div>

      {equipment ? (
        <div className="mt-2">
          <RouterLink
            to={`/equipment/${equipment.id}`}
            className="font-medium text-zinc-950 hover:text-blue-600 hover:underline dark:text-white dark:hover:text-blue-400"
          >
            {equipment.name}
          </RouterLink>
          {typeCategoryLine && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {typeCategoryLine}
            </div>
          )}
          {(makeModel || equipment.serialNumber || equipment.locationOnSite) && (
            <DescriptionList className="mt-2">
              {makeModel && (
                <>
                  <DescriptionTerm>{t('equipment.table.makeModel')}</DescriptionTerm>
                  <DescriptionDetails>{makeModel}</DescriptionDetails>
                </>
              )}
              {equipment.serialNumber && (
                <>
                  <DescriptionTerm>{t('equipment.form.serialNumber')}</DescriptionTerm>
                  <DescriptionDetails className="font-mono">
                    {equipment.serialNumber}
                  </DescriptionDetails>
                </>
              )}
              {equipment.locationOnSite && (
                <>
                  <DescriptionTerm>{t('equipment.form.locationOnSite')}</DescriptionTerm>
                  <DescriptionDetails>{equipment.locationOnSite}</DescriptionDetails>
                </>
              )}
            </DescriptionList>
          )}
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Text className="text-zinc-600 dark:text-zinc-400">
            {t('workOrders.workItems.noEquipmentLinked', {
              entity: getName('equipment'),
            })}
          </Text>
          {!readOnly && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(workItem)}
              className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
            >
              <PlusIcon className="size-4" />
              {t('common.actions.add', { entity: getName('equipment') })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
