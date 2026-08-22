import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  workOrderApi,
  type ProgressCategory,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../api/setup';
import { Pill } from './ui/Pill';
import { PROGRESS_TONE } from '../lib/workItemProgress';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

interface Props {
  workOrderId: string;
  workItem: WorkItemResponse;
  statuses: WorkItemStatus[];
  /** Transitions in the WO's workflow. Presence of a row means the move is
   *  allowed (the old isAllowed flag is gone — undefined rows are denied). */
  transitions: WorkflowTransition[];
  /** When false, all active statuses are allowed transitions. */
  enforceWorkflow: boolean;
  /** Cancelled / archived WOs lock the pill to read-only. */
  readOnly?: boolean;
}

export default function WorkItemStatusPill({
  workOrderId,
  workItem,
  statuses,
  transitions,
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
      // A work-item status change can roll up to a new work-order status, so the
      // embedded list surfaces (location/customer/equipment detail WO cards +
      // Jobs tab) must refetch too — they read the separate 'work-orders-list'
      // key, which the bare 'work-orders' invalidation above doesn't cover.
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      // The status change emits a WORK_ITEM_STATUS_CHANGED event on the backend,
      // which the activity listener writes into work_order_activity. Refetch the
      // activity rail so the new event surfaces without a manual reload.
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
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
  // any active status is a valid target. Otherwise, only statuses reachable
  // via a defined transition from the current state are options.
  const allowedStatuses =
    !enforceWorkflow || !workItem.statusId
      ? activeStatuses.filter((s) => s.id !== workItem.statusId)
      : (() => {
          const allowedIds = new Set(
            transitions
              .filter((tx) => tx.fromStatusId === workItem.statusId)
              .map((tx) => tx.toStatusId)
          );
          return activeStatuses.filter((s) => allowedIds.has(s.id));
        })();

  const isPending = updateStatusMutation.isPending;
  const isInteractive = !readOnly && !isPending && allowedStatuses.length > 0;

  if (!isInteractive) {
    return (
      <Pill tone={PROGRESS_TONE[workItem.statusCategory]} dot>
        {currentLabel}
      </Pill>
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
        <Pill tone={PROGRESS_TONE[workItem.statusCategory]} dot>
          {currentLabel}
        </Pill>
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
