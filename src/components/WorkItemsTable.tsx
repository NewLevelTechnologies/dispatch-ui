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
import WorkItemStatusPill from './WorkItemStatusPill';

interface Props {
  workOrderId: string;
  workItems: WorkItemResponse[];
  statuses: WorkItemStatus[];
  workflows: StatusWorkflowRule[];
  enforceWorkflow: boolean;
  readOnly?: boolean;
}

export default function WorkItemsTable({
  workOrderId,
  workItems,
  statuses,
  workflows,
  enforceWorkflow,
  readOnly = false,
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

  return (
    <Table dense className="[--gutter:theme(spacing.1)] text-sm">
      <TableHead>
        <TableRow>
          <TableHeader>{t('workOrders.table.statusHeader')}</TableHeader>
          <TableHeader>{t('common.form.description')}</TableHeader>
          <TableHeader>{t('workOrders.workItems.lastUpdated')}</TableHeader>
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
              {wi.description}
            </TableCell>
            <TableCell className="whitespace-nowrap text-zinc-600 dark:text-zinc-400">
              {formatRelativeTime(wi.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
