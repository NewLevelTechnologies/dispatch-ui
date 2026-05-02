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
import { Text } from './catalyst/text';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
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

  if (workItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 p-6 text-center dark:border-zinc-800">
        <Text className="text-zinc-500 dark:text-zinc-400">
          {t('workOrders.workItems.empty', { entity: getName('work_order') })}
        </Text>
      </div>
    );
  }

  // Show the actions column only when at least one callback is wired up and the
  // WO isn't frozen — keeps the column out entirely on read-only views.
  const showActions = !readOnly && !!(onEdit || onDelete);

  return (
    <Table dense className="[--gutter:theme(spacing.1)] text-sm">
      <TableHead>
        <TableRow>
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
        {workItems.map((wi) => (
          <TableRow key={wi.id} className="align-top">
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
                  {wi.equipment.name}
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
