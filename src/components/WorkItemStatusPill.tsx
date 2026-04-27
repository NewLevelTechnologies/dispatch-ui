import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  type ProgressCategory,
  type StatusWorkflowRule,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api';
import { Badge } from './catalyst/badge';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';

const PROGRESS_COLORS: Record<ProgressCategory, 'zinc' | 'sky' | 'blue' | 'amber' | 'lime'> = {
  NOT_STARTED: 'zinc',
  IN_PROGRESS: 'blue',
  BLOCKED: 'amber',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

interface Props {
  workOrderId: string;
  workItem: WorkItemResponse;
  statuses: WorkItemStatus[];
  workflows: StatusWorkflowRule[];
  /** When false, all active statuses are allowed transitions. */
  enforceWorkflow: boolean;
  /** Cancelled / archived WOs lock the pill to read-only. */
  readOnly?: boolean;
}

export default function WorkItemStatusPill({
  workOrderId,
  workItem,
  statuses,
  workflows,
  enforceWorkflow,
  readOnly = false,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const updateStatusMutation = useMutation({
    mutationFn: (statusId: string) =>
      workOrderApi.updateWorkItemStatus(workOrderId, workItem.id, { statusId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('workOrders.workItems.statusUpdateError'));
    },
  });

  const currentStatus = statuses.find((s) => s.id === workItem.statusId);
  const currentLabel =
    currentStatus?.name ||
    t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[workItem.statusCategory]}`);

  const activeStatuses = statuses.filter((s) => s.isActive);

  // If workflow isn't enforced (or there's no current status to transition from),
  // any active status is a valid target. Otherwise, only statuses with an explicit
  // allow-rule from the current state are options.
  const allowedStatuses =
    !enforceWorkflow || !workItem.statusId
      ? activeStatuses.filter((s) => s.id !== workItem.statusId)
      : (() => {
          const allowedIds = new Set(
            workflows
              .filter((w) => w.fromStatusId === workItem.statusId && w.isAllowed)
              .map((w) => w.toStatusId)
          );
          return activeStatuses.filter((s) => allowedIds.has(s.id));
        })();

  const isPending = updateStatusMutation.isPending;
  const isInteractive = !readOnly && !isPending && allowedStatuses.length > 0;

  if (!isInteractive) {
    return (
      <Badge color={PROGRESS_COLORS[workItem.statusCategory]}>{currentLabel}</Badge>
    );
  }

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        type="button"
        className="cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={t('workOrders.workItems.changeStatus', { current: currentLabel })}
      >
        <Badge color={PROGRESS_COLORS[workItem.statusCategory]}>{currentLabel}</Badge>
      </DropdownButton>
      <DropdownMenu anchor="bottom start">
        {allowedStatuses.map((s) => (
          <DropdownItem
            key={s.id}
            onClick={() => updateStatusMutation.mutate(s.id)}
          >
            <DropdownLabel>{s.name}</DropdownLabel>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  );
}
