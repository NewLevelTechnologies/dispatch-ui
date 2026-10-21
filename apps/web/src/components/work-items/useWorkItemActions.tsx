import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  workOrderApi,
  type PurchaseOrderListItem,
  type WorkflowTransition,
  type WorkItemResponse,
  type WorkItemStatus,
} from '../../api/setup';
import { showError, extractApiError } from '../../lib/toast';
import {
  allowedTargetStatuses,
  completeTarget,
  partsArrivedTarget,
  PENDING_PARTS_CODE,
} from '../../lib/workItemStatusTargets';
import { isFinished, openPurchaseOrders, primaryAction } from '../../lib/workItemSteps';
import ConfirmDialog from '../ConfirmDialog';

/**
 * A work item's status moves and its one next step — the same rules wherever
 * an item can be worked (the Work items tab, the Compact overview rows):
 * which status is "complete" / "parts arrived" under the workflow, the
 * confirm before completing with parts still on order, and `primaryAction`.
 * Render `confirmDialog` once alongside the button.
 */
export function useWorkItemActions({
  workOrderId,
  wi,
  statuses,
  transitions,
  enforceWorkflow,
  purchaseOrders,
  hasDispatches,
  canSchedule,
}: {
  workOrderId: string;
  wi: WorkItemResponse;
  statuses: WorkItemStatus[];
  transitions: WorkflowTransition[];
  enforceWorkflow: boolean;
  /** POs raised for this item. */
  purchaseOrders: PurchaseOrderListItem[];
  /** A visit covers this item. */
  hasDispatches: boolean;
  /** Scheduling is offered (a handler exists and the user may write). */
  canSchedule: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmComplete, setConfirmComplete] = useState<(() => void) | null>(null);

  const status = statuses.find((s) => s.id === wi.statusId) ?? null;
  const allowed = allowedTargetStatuses(wi, statuses, transitions, enforceWorkflow);
  const finished = isFinished(wi);
  const openPOs = openPurchaseOrders(purchaseOrders);
  const toComplete = completeTarget(allowed);
  const toPartsArrived = partsArrivedTarget(allowed);
  const awaitingParts = status?.code === PENDING_PARTS_CODE;

  const action = primaryAction({
    finished,
    awaitingParts,
    hasDispatches,
    hasFindings: !!wi.diagnosis?.trim(),
    canPartsArrived: !!toPartsArrived,
    canSchedule,
    canComplete: !!toComplete,
  });

  const setStatus = useMutation({
    mutationFn: (statusId: string) => workOrderApi.updateWorkItemStatus(workOrderId, wi.id, { statusId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    },
    onError: (err) => showError(t('workOrders.workItems.statusUpdateError'), extractApiError(err) ?? undefined),
  });

  // Completing while parts are still on order is allowed, but asked first.
  const guardComplete = (proceed: () => void) => {
    if (openPOs.length > 0) setConfirmComplete(() => proceed);
    else proceed();
  };
  const markComplete = () => toComplete && guardComplete(() => setStatus.mutate(toComplete.id));
  const partsArrived = () => toPartsArrived && setStatus.mutate(toPartsArrived.id);

  const confirmDialog = (
    <ConfirmDialog
      isOpen={!!confirmComplete}
      onClose={() => setConfirmComplete(null)}
      onConfirm={() => {
        confirmComplete?.();
        setConfirmComplete(null);
      }}
      title={t('workOrders.workItems.completeWithPartsTitle')}
      message={t('workOrders.workItems.completeWithPartsMessage', {
        pos: openPOs.map((po) => po.poNumber).join(', '),
      })}
      confirmLabel={t('workOrders.workItems.markComplete')}
    />
  );

  return {
    action,
    pending: setStatus.isPending,
    finished,
    awaitingParts,
    openPOs,
    toComplete,
    guardComplete,
    markComplete,
    partsArrived,
    confirmDialog,
  };
}
