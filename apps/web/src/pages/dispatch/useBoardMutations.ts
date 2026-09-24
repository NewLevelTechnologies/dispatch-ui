// ─────────────────────────────────────────────────────────────────────
// The board's writes: assign from the rail, move a block, release a visit.
//
// Both commit IMMEDIATELY — no confirm, no modal. The safety net is Undo,
// and Undo is a real inverse mutation rather than a UI illusion: a create is
// undone by DELETE, a move by a PUT back to the previous tech and window. If
// the inverse itself fails we say so and refetch, because the one thing worse
// than a failed undo is a grid that keeps showing a state the server rejected.
// ─────────────────────────────────────────────────────────────────────
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { useGlossary } from '../../contexts/GlossaryContext';
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
import { invalidateDispatchConsumers } from '../../utils/invalidateRoleConsumers';

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
  // A create has never had its window changed.
  windowChangedAt: null,
  assignedUserName: null,
  workOrderTypeId: null,
  // Site fields are copied from the rail card at construction, not nulled
  // here: the card already knows the address and the coordinates, so a
  // provisional block that claimed otherwise would render a pin-less job the
  // dispatcher could see was on the map a second earlier.
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

export function useBoardMutations(date: string, timeZone: string) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  // A dispatch write reaches the work order too — its visit list, progress
  // and activity — not just the board's own read.
  const refresh = () => invalidateDispatchConsumers(queryClient);

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
        arrivalWindowStart: toIsoAt(date, input.window.startHour, timeZone),
        arrivalWindowEnd: toIsoAt(date, input.window.endHour, timeZone),
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
        // Carried so the provisional block dims correctly under an active
        // division filter, rather than reading as in-scope for a moment.
        divisionId: input.workOrder.divisionId,
        serviceLocationName: input.workOrder.serviceLocationName,
        serviceLocationStreet: input.workOrder.serviceLocationStreet,
        serviceLocationCity: input.workOrder.serviceLocationCity,
        serviceLocationState: input.workOrder.serviceLocationState,
        serviceLocationZip: input.workOrder.serviceLocationZip,
        latitude: input.workOrder.latitude,
        longitude: input.workOrder.longitude,
        assignedUserId: input.techId,
        arrivalWindowStart: toIsoAt(date, input.window.startHour, timeZone),
        arrivalWindowEnd: toIsoAt(date, input.window.endHour, timeZone),
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
        arrivalWindowStart: toIsoAt(date, input.window.startHour, timeZone),
        arrivalWindowEnd: toIsoAt(date, input.window.endHour, timeZone),
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
                  arrivalWindowStart: toIsoAt(date, input.window.startHour, timeZone),
                  arrivalWindowEnd: toIsoAt(date, input.window.endHour, timeZone),
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
   * Move a visit to another DAY — same tech, same window, new date (§3.6).
   *
   * What it costs is decided by who has already been told, and the caller
   * resolves that before calling (the customer half needs a read the board
   * doesn't carry):
   *
   *   quiet         unreleased — nobody knows. Commit + Undo, like any drag.
   *   techTold      released, customer not told. Same, but the toast names
   *                 the tech: their day changed under them.
   *   notify        the customer was told and the dispatcher chose to tell
   *                 them again. NO Undo — an Undo that can't un-send a text
   *                 is a lie.
   *   customerStale the customer was told and the dispatcher declined to
   *                 notify. Undoable, and the toast says the customer still
   *                 expects the old date.
   *
   * The visit leaves this day's board on the click: a moved dispatch belongs
   * to exactly one day.
   */
  const moveDay = useMutation({
    mutationFn: async (input: {
      dispatch: BoardDispatch;
      toDate: string;
      toDateLabel: string;
      window: Window;
      windowLabel: string;
      techName: string;
      mode: 'quiet' | 'techTold' | 'notify' | 'customerStale';
    }) => {
      const updated = await dispatchesApi.update(input.dispatch.id, {
        arrivalWindowStart: toIsoAt(input.toDate, input.window.startHour, timeZone),
        arrivalWindowEnd: toIsoAt(input.toDate, input.window.endHour, timeZone),
        version: input.dispatch.version,
      });
      // The date is moved either way; a failed text is reported on its own
      // rather than rolling back a move the dispatcher did want.
      let notifyFailed = false;
      if (input.mode === 'notify') {
        await dispatchesApi.notify(input.dispatch.id, 'CUSTOMER').catch(() => {
          notifyFailed = true;
        });
      }
      return { updated, notifyFailed };
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['dispatch-board'] });
      const snapshot = queryClient.getQueriesData({ queryKey: ['dispatch-board'] });
      patchBoardCaches(queryClient, {
        grid: (board) => ({
          ...board,
          dispatches: board.dispatches.filter((d) => d.id !== input.dispatch.id),
        }),
      });
      return { snapshot };
    },
    onSuccess: ({ updated, notifyFailed }, input) => {
      const before = input.dispatch;
      // The PUT moved windowChangedAt, so every earlier customer notice now
      // reads as "not about this date" — the drawer has to re-read the log
      // rather than keep a cached "notified".
      queryClient.invalidateQueries({
        queryKey: ['notification-logs', { entityType: 'DISPATCH', entityId: before.id }],
      });
      const workOrder = before.workOrderNumber ?? before.workOrderSummary ?? '';
      const where = { workOrder, day: input.toDateLabel, window: input.windowLabel };

      if (input.mode === 'notify') {
        if (notifyFailed) {
          showError(t('dispatchBoard.move.notifyFailed', where));
          return;
        }
        showSuccess(
          t('dispatchBoard.move.notified', {
            ...where,
            customer: before.customerName ?? getName('customer').toLowerCase(),
          }),
        );
        return;
      }

      const message =
        input.mode === 'techTold'
          ? t('dispatchBoard.move.movedTechTold', { ...where, tech: input.techName })
          : input.mode === 'customerStale'
            ? t('dispatchBoard.move.movedCustomerStale', where)
            : t('dispatchBoard.move.moved', where);

      showUndo(message, t('common.undo'), () => {
        dispatchesApi
          .update(before.id, {
            arrivalWindowStart: before.arrivalWindowStart,
            arrivalWindowEnd: before.arrivalWindowEnd,
            // The move bumped it; replaying the old one would conflict with
            // our own write.
            version: updated.version,
          })
          .then(refresh)
          .catch(undoFailed);
      });
    },
    onError: (err, _input, context) => {
      restore(context?.snapshot);
      reportFailure(t('dispatchBoard.move.failed'))(err);
    },
    onSettled: refresh,
  });

  /**
   * Take work back off the board. Always allowed — a dispatcher pulling a job
   * back is a decision, not a mistake to be guarded against, and the same
   * "warn and allow" rule that lets them double-book applies here.
   *
   * WHAT it writes depends on whether anyone knows about the visit yet:
   *
   *   unreleased  → DELETE. Nobody was told, so there is nothing to explain
   *                 and nothing worth keeping.
   *   released    → CANCEL. A technician has an SMS about this job; deleting
   *                 it would leave them holding a notification for a visit
   *                 that no longer exists anywhere. Cancelling puts the work
   *                 back in the rail just the same — "unscheduled" means no
   *                 LIVE dispatch — while leaving a record that explains the
   *                 message they already got.
   *
   * Either way the work order returns to the rail, which is what the gesture
   * means.
   */
  const unschedule = useMutation({
    mutationFn: async (dispatch: BoardDispatch) => {
      if (dispatch.releasedAt == null) {
        await dispatchesApi.delete(dispatch.id);
        return { cancelled: false };
      }
      await dispatchesApi.update(dispatch.id, {
        status: 'CANCELLED',
        notes: 'Unscheduled from the dispatch board',
        version: dispatch.version,
      });
      return { cancelled: true };
    },
    onMutate: async (dispatch) => {
      await queryClient.cancelQueries({ queryKey: ['dispatch-board'] });
      const snapshot = queryClient.getQueriesData({ queryKey: ['dispatch-board'] });
      patchBoardCaches(queryClient, {
        grid: (board) => ({
          ...board,
          dispatches: board.dispatches.filter((d) => d.id !== dispatch.id),
        }),
      });
      return { snapshot };
    },
    onSuccess: ({ cancelled }, dispatch) => {
      // Name what moved and where, like every other board toast — a bare
      // state announcement can't confirm it was the one you meant.
      const workOrder = dispatch.workOrderNumber ?? dispatch.workOrderSummary ?? '';
      if (!cancelled) {
        showSuccess(t('dispatchBoard.drag.removed', { workOrder }));
        return;
      }
      // A cancel is reversible, so it gets an Undo where a delete can't.
      showUndo(t('dispatchBoard.drag.cancelled', { workOrder }), t('common.undo'), () => {
        dispatchesApi
          .update(dispatch.id, { status: 'SCHEDULED' })
          .then(refresh)
          .catch(undoFailed);
      });
    },
    onError: (err, _dispatch, context) => {
      restore(context?.snapshot);
      reportFailure(t('dispatchBoard.drag.removeFailed'))(err);
    },
    onSettled: refresh,
  });

  /**
   * Release ONE dispatch — the right-click verb, and the single-visit sibling
   * of the band-1 bulk release.
   *
   * No Undo here, unlike every other board write: release texts the
   * technician and there is no un-send, so the inverse this toast would
   * promise does not exist. The server is idempotent, so a double-click
   * cannot double-notify.
   */
  const release = useMutation({
    mutationFn: (dispatch: BoardDispatch) => dispatchesApi.release(dispatch.id),
    onMutate: async (dispatch) => {
      await queryClient.cancelQueries({ queryKey: ['dispatch-board'] });
      const snapshot = queryClient.getQueriesData({ queryKey: ['dispatch-board'] });
      // The hatch clears on the click, not on the round-trip: release is the
      // one board write whose whole point is a change of appearance.
      const releasedAt = new Date().toISOString();
      patchBoardCaches(queryClient, {
        grid: (board) => ({
          ...board,
          dispatches: board.dispatches.map((d) =>
            d.id === dispatch.id ? { ...d, releasedAt } : d,
          ),
        }),
      });
      return { snapshot };
    },
    onSuccess: (_result, dispatch) => {
      const workOrder = dispatch.workOrderNumber ?? dispatch.workOrderSummary ?? '';
      showSuccess(
        t('dispatchBoard.release.one', { workOrder, tech: getName('technician') }),
      );
    },
    onError: (err, _dispatch, context) => {
      restore(context?.snapshot);
      reportFailure(t('dispatchBoard.release.oneFailed', { entity: getName('dispatch') }))(err);
    },
    onSettled: refresh,
  });

  return {
    assign,
    move,
    moveDay,
    unschedule,
    release,
    pending:
      assign.isPending ||
      move.isPending ||
      moveDay.isPending ||
      unschedule.isPending ||
      release.isPending,
  };
}
