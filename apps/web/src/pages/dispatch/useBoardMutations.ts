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
import {
  errorCode,
  extractApiError,
  isConflict,
  showError,
  showSuccess,
  showUndo,
} from '../../lib/toast';
import { invalidateDispatchBoard } from '../../utils/invalidateRoleConsumers';

interface Window {
  startHour: number;
  endHour: number;
}

/** Fields a provisional block needs to render but a rail card can't supply.
 *  It lives for the round-trip only — the refetch replaces it with the real
 *  row — so these are honest blanks rather than guesses. */
const PROVISIONAL_BASE = {
  seq: 0,
  status: 'SCHEDULED' as const,
  estimatedDuration: null,
  // Drag-assign creates on deck, so the provisional block is hatched exactly
  // like the real one will be.
  releasedAt: null,
  version: 0,
  assignedUserName: null,
  workOrderTypeId: null,
  serviceLocationCity: null,
  serviceLocationState: null,
  latitude: null,
  longitude: null,
  driveMinFromPrev: null,
  arrivedAt: null,
  departedAt: null,
  addressedWorkItemIds: [],
};

/**
 * Apply a change to every board cache at once — the grid and the rail are
 * separate reads under one prefix, and a drag usually moves something between
 * them. Detected by shape rather than by key so this doesn't need to know how
 * either query is keyed.
 */
function patchBoardCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  patch: {
    grid?: (board: { techs: unknown[]; dispatches: BoardDispatch[] }) => unknown;
    rail?: (page: { content: UnscheduledWorkOrder[] }) => unknown;
  },
) {
  queryClient.setQueriesData({ queryKey: ['dispatch-board'] }, (old: unknown) => {
    if (!old || typeof old !== 'object') return old;
    if ('dispatches' in old && patch.grid) {
      return patch.grid(old as { techs: unknown[]; dispatches: BoardDispatch[] });
    }
    if ('content' in old && patch.rail) {
      return patch.rail(old as { content: UnscheduledWorkOrder[] });
    }
    return old;
  });
}

export function useBoardMutations(date: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const refresh = () => invalidateDispatchBoard(queryClient);

  /** Put every board cache back exactly as it was. */
  const restore = (snapshot?: [readonly unknown[], unknown][]) => {
    snapshot?.forEach(([key, data]) => queryClient.setQueryData(key, data));
  };

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
      techName: string;
      windowLabel: string;
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['dispatch-board'] });
      const snapshot = queryClient.getQueriesData({ queryKey: ['dispatch-board'] });

      // A provisional block, so the drop lands where the pointer let go
      // instead of springing back until the server answers. `PENDING` is a
      // `pending-` prefixed so it can never be mistaken for a server row.
      const provisional = {
        ...PROVISIONAL_BASE,
        id: `pending-${input.workOrder.workOrderId}`,
        workOrderId: input.workOrder.workOrderId,
        workOrderNumber: input.workOrder.workOrderNumber,
        workOrderSummary: input.workOrder.workOrderSummary,
        customerId: input.workOrder.customerId,
        customerName: input.workOrder.customerName,
        priority: input.workOrder.priority,
        recurring: input.workOrder.recurring,
        serviceLocationId: input.workOrder.serviceLocationId,
        assignedUserId: input.techId,
        arrivalWindowStart: toIsoAt(date, input.window.startHour),
        arrivalWindowEnd: toIsoAt(date, input.window.endHour),
      } as BoardDispatch;

      patchBoardCaches(queryClient, {
        grid: (board) => ({ ...board, dispatches: [...board.dispatches, provisional] }),
        rail: (page) => ({
          ...page,
          content: page.content.filter((w) => w.workOrderId !== input.workOrder.workOrderId),
        }),
      });
      return { snapshot };
    },
    onSuccess: (created, input) => {
      showUndo(
        t('dispatchBoard.drag.assigned', {
          workOrder: input.workOrder.workOrderNumber,
          tech: input.techName,
          window: input.windowLabel,
        }),
        t('common.undo'),
        () => {
          // The inverse of a create is a delete — not a second write that
          // "puts it back", which would leave an orphan on the board.
          dispatchesApi.delete(created.id).then(refresh).catch(undoFailed);
        },
      );
    },
    onError: (err, _input, context) => {
      restore(context?.snapshot);
      reportFailure(t('dispatchBoard.drag.assignFailed'))(err);
    },
    // Server truth wins either way — on success it replaces the provisional
    // row, on failure it confirms the rollback.
    onSettled: refresh,
  });

  const move = useMutation({
    mutationFn: async (input: {
      dispatch: BoardDispatch;
      techId: string;
      techName: string;
      windowLabel: string;
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
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['dispatch-board'] });
      const snapshot = queryClient.getQueriesData({ queryKey: ['dispatch-board'] });
      patchBoardCaches(queryClient, {
        grid: (board) => ({
          ...board,
          dispatches: board.dispatches.map((d) =>
            d.id === input.dispatch.id
              ? {
                  ...d,
                  assignedUserId: input.techId,
                  arrivalWindowStart: toIsoAt(date, input.window.startHour),
                  arrivalWindowEnd: toIsoAt(date, input.window.endHour),
                }
              : d,
          ),
        }),
      });
      return { snapshot };
    },
    onSuccess: (updated, input) => {
      const before = input.dispatch;
      showUndo(
        t('dispatchBoard.drag.moved', {
          workOrder: before.workOrderNumber,
          tech: input.techName,
          window: input.windowLabel,
        }),
        t('common.undo'),
        () => {
          dispatchesApi
            .update(before.id, {
              assignedUserId: before.assignedUserId,
              arrivalWindowStart: before.arrivalWindowStart,
              arrivalWindowEnd: before.arrivalWindowEnd,
              // The version the SERVER just handed back, not the one we
              // opened with — the move itself bumped it, so replaying the
              // old one would conflict with our own write.
              version: updated.version,
            })
            .then(refresh)
            .catch(undoFailed);
        },
      );
    },
    onError: (err, _input, context) => {
      restore(context?.snapshot);
      reportFailure(t('dispatchBoard.drag.moveFailed'))(err);
    },
    onSettled: refresh,
  });

  /**
   * Remove a dispatch outright.
   *
   * Distinct from cancelling, which the drawer also offers: CANCELLED keeps
   * the visit with a reason, which is what a customer conversation and the
   * audit trail depend on. Delete is for a mistake that never happened — a
   * drop on the wrong tech, a duplicate. Undo on the toast lasts seconds, so
   * this is the durable way to unassign.
   */
  const removeDispatch = useMutation({
    mutationFn: (id: string) => dispatchesApi.delete(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['dispatch-board'] });
      const snapshot = queryClient.getQueriesData({ queryKey: ['dispatch-board'] });
      patchBoardCaches(queryClient, {
        grid: (board) => ({
          ...board,
          dispatches: board.dispatches.filter((d) => d.id !== id),
        }),
      });
      return { snapshot };
    },
    onSuccess: () => showSuccess(t('dispatchBoard.drag.removed')),
    onError: (err, _id, context) => {
      restore(context?.snapshot);
      reportFailure(t('dispatchBoard.drag.removeFailed'))(err);
    },
    onSettled: refresh,
  });

  return {
    assign,
    move,
    removeDispatch,
    pending: assign.isPending || move.isPending || removeDispatch.isPending,
  };
}
