// ─────────────────────────────────────────────────────────────────────
// The board's writes: assign from the rail, move a block.
//
// Both commit IMMEDIATELY — no confirm, no modal. The safety net is Undo,
// and Undo is a real inverse mutation rather than a UI illusion: a create is
// undone by DELETE, a move by a PUT back to the previous tech and window. If
// the inverse itself fails we say so and refetch, because the one thing worse
// than a failed undo is a grid that keeps showing a state the server rejected.
// ─────────────────────────────────────────────────────────────────────
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  dispatchesApi,
  type BoardDispatch,
  type UnscheduledWorkOrder,
} from '../../api/setup';
import { toIsoAt } from '../../lib/arrivalWindows';
import { errorCode, extractApiError, isConflict, showError, showUndo } from '../../lib/toast';
import { invalidateDispatchBoard } from '../../utils/invalidateRoleConsumers';

interface Window {
  startHour: number;
  endHour: number;
}

export function useBoardMutations(date: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const refresh = () => invalidateDispatchBoard(queryClient);

  /** A version conflict is its own failure, not a generic one: the board was
   *  stale, so refetching is the actual remedy and the message should say so
   *  rather than inviting a retry into the same wall. */
  const reportFailure = (fallback: string) => (err: unknown) => {
    refresh();
    if (isConflict(err) && errorCode(err) === 'DISPATCH_VERSION_CONFLICT') {
      showError(t('dispatchBoard.drag.conflict'));
      return;
    }
    showError(fallback, extractApiError(err));
  };

  /** Undo failed. Never leave the grid asserting something the server
   *  refused — say it plainly and reload the truth. */
  const undoFailed = () => {
    refresh();
    showError(t('dispatchBoard.drag.undoFailed'));
  };

  const assign = useMutation({
    mutationFn: async (input: {
      workOrder: UnscheduledWorkOrder;
      techId: string;
      window: Window;
    }) =>
      dispatchesApi.create({
        workOrderId: input.workOrder.workOrderId,
        assignedUserId: input.techId,
        arrivalWindowStart: toIsoAt(date, input.window.startHour),
        arrivalWindowEnd: toIsoAt(date, input.window.endHour),
        // Drag-assign creates ON DECK. Dispatchers stage the morning and
        // release together, so handing the tech their day is a separate,
        // deliberate act — never a side effect of scheduling.
        notifyAssignedUser: false,
      }),
    onSuccess: (created, input) => {
      refresh();
      showUndo(
        t('dispatchBoard.drag.assigned', {
          workOrder: input.workOrder.workOrderNumber,
          tech: input.techId,
        }),
        t('common.undo'),
        () => {
          // The inverse of a create is a delete — not a second write that
          // "puts it back", which would leave an orphan on the board.
          dispatchesApi.delete(created.id).then(refresh).catch(undoFailed);
        },
      );
    },
    onError: reportFailure(t('dispatchBoard.drag.assignFailed')),
  });

  const move = useMutation({
    mutationFn: async (input: {
      dispatch: BoardDispatch;
      techId: string;
      window: Window;
    }) =>
      dispatchesApi.update(input.dispatch.id, {
        assignedUserId: input.techId,
        arrivalWindowStart: toIsoAt(date, input.window.startHour),
        arrivalWindowEnd: toIsoAt(date, input.window.endHour),
        // Always sent: omitting it turns off stale-read detection, and a
        // board someone has been staring at for ten minutes is exactly the
        // case that produces one.
        version: input.dispatch.version,
      }),
    onSuccess: (updated, input) => {
      refresh();
      const before = input.dispatch;
      showUndo(t('dispatchBoard.drag.moved', { workOrder: before.workOrderNumber }), t('common.undo'), () => {
        dispatchesApi
          .update(before.id, {
            assignedUserId: before.assignedUserId,
            arrivalWindowStart: before.arrivalWindowStart,
            arrivalWindowEnd: before.arrivalWindowEnd,
            // The version the SERVER just handed back, not the one we opened
            // with — the move itself bumped it, so replaying the old one
            // would conflict with our own write.
            version: updated.version,
          })
          .then(refresh)
          .catch(undoFailed);
      });
    },
    onError: reportFailure(t('dispatchBoard.drag.moveFailed')),
  });

  return { assign, move, pending: assign.isPending || move.isPending };
}
