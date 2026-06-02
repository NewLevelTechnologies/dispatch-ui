import { useEffect, useMemo, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  dispatchesApi,
  userApi,
  type Dispatch,
  type DispatchStatus,
  type User,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Badge } from './catalyst/badge';
import { Button } from './catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from './catalyst/dropdown';
import { Table, TableBody, TableCell, TableRow } from './catalyst/table';
import {
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

const STATUS_BADGE: Record<DispatchStatus, 'sky' | 'blue' | 'lime' | 'zinc' | 'amber'> = {
  SCHEDULED: 'sky',
  IN_PROGRESS: 'blue',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
  NO_SHOW: 'amber',
};

// Linear flow per backend: SCHEDULED → IN_PROGRESS sets arrivedAt,
// IN_PROGRESS → COMPLETED sets departedAt.
const NEXT_STATUS: Partial<Record<DispatchStatus, DispatchStatus>> = {
  SCHEDULED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

const PAST_STATES: ReadonlyArray<DispatchStatus> = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
const isPast = (s: DispatchStatus) => PAST_STATES.includes(s);

const DATE_PART = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});
const TIME_PART = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return `${DATE_PART.format(start)} · ${TIME_PART.format(start)} – ${TIME_PART.format(end)}`;
  }
  return `${DATE_PART.format(start)} ${TIME_PART.format(start)} – ${DATE_PART.format(end)} ${TIME_PART.format(end)}`;
}

function formatTimeOnly(iso: string): string {
  return TIME_PART.format(new Date(iso));
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Overdue = SLA window has fully expired and the dispatcher hasn't progressed
 * past SCHEDULED. The window-end (not start) is the tripwire — windowStart-passed
 * is normal "in window" operation. Today's backend has only SCHEDULED in the
 * pre-arrival state set; if NOTIFIED / EN_ROUTE land later, extend here.
 */
function isOverdue(d: Dispatch, now: number): boolean {
  if (d.status !== 'SCHEDULED') return false;
  return new Date(d.arrivalWindowEnd).getTime() < now;
}

/**
 * Two-tier sort for active rows: overdue pinned top (oldest end-of-window
 * first), then everything else chronologically by arrivalWindowStart.
 * Past rows live in their own collapsed section, sorted most-recent-first.
 */
function partitionAndSort(dispatches: Dispatch[], now: number) {
  const past: Dispatch[] = [];
  const overdue: Dispatch[] = [];
  const onTrack: Dispatch[] = [];
  for (const d of dispatches) {
    if (isPast(d.status)) past.push(d);
    else if (isOverdue(d, now)) overdue.push(d);
    else onTrack.push(d);
  }
  past.sort((a, b) => {
    const aTime = a.departedAt ?? a.updatedAt;
    const bTime = b.departedAt ?? b.updatedAt;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
  overdue.sort(
    (a, b) =>
      new Date(a.arrivalWindowEnd).getTime() -
      new Date(b.arrivalWindowEnd).getTime()
  );
  onTrack.sort(
    (a, b) =>
      new Date(a.arrivalWindowStart).getTime() -
      new Date(b.arrivalWindowStart).getTime()
  );
  return { active: [...overdue, ...onTrack], past };
}

function getDotColor(d: Dispatch, now: number): string {
  if (isOverdue(d, now)) return 'bg-rose-500';
  if (d.status === 'IN_PROGRESS') return 'bg-lime-500';
  return 'bg-sky-500';
}

function formatActiveTimestamp(d: Dispatch, t: TFunction): string {
  if (d.status === 'IN_PROGRESS' && d.arrivedAt) {
    return t('workOrders.dispatches.onSiteSince', {
      time: formatTimeOnly(d.arrivedAt),
    });
  }
  return formatWindow(d.arrivalWindowStart, d.arrivalWindowEnd);
}

function formatPastTimestamp(d: Dispatch, t: TFunction): string {
  if (d.status === 'CANCELLED' || d.status === 'NO_SHOW') {
    return t(`workOrders.dispatches.status.${d.status}`);
  }
  if (d.arrivedAt && d.departedAt) {
    const ms =
      new Date(d.departedAt).getTime() - new Date(d.arrivedAt).getTime();
    const dur = formatDuration(Math.max(1, Math.round(ms / 60000)));
    return t('workOrders.dispatches.onSitePast', {
      start: formatTimeOnly(d.arrivedAt),
      end: formatTimeOnly(d.departedAt),
      duration: dur,
    });
  }
  if (d.departedAt) {
    return t('workOrders.dispatches.completedAt', {
      time: formatTimeOnly(d.departedAt),
    });
  }
  return t('workOrders.dispatches.status.COMPLETED');
}

interface Props {
  workOrderId: string;
  /** Cancelled / archived WOs render rows read-only and hide the assign CTA. */
  readOnly?: boolean;
  onAssign: () => void;
  /**
   * Open the dialog in edit mode for the given dispatch. Page-level state
   * owns the selection so the dialog (page-mounted) can prefill from it.
   */
  onEdit: (dispatch: Dispatch) => void;
  /**
   * Row body click → open the detail drawer. Kebab and primary action elements
   * stopPropagation so they don't dual-fire (open drawer AND fire their own
   * handler). Same page-level-state pattern as onEdit.
   */
  onSelect: (dispatch: Dispatch) => void;
}

/**
 * Operational "who is going, when" section directly above WorkItemsTable.
 * Active dispatches render as dense single-line rows; past dispatches collapse
 * into a "Past (N) ▸" trigger so a long-running WO doesn't bury the work item
 * table under historical visits.
 */
export default function DispatchesSection({
  workOrderId,
  readOnly = false,
  onAssign,
  onEdit,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ['dispatches', { workOrderId }],
    // WO-scoped read returns a plain array (listForWorkOrder tolerates both the
    // array and a future paged envelope).
    queryFn: () => dispatchesApi.listForWorkOrder(workOrderId),
    enabled: !!workOrderId,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
  });
  const usersById = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  // Single "now" reference per render. Overdue is a derived predicate; the
  // boundary doesn't shift mid-paint, and recomputing on the next data fetch
  // is more than fast enough for a CSR session.
  const now = Date.now();
  const { active, past } = useMemo(
    () => partitionAndSort(dispatches, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dispatches]
  );

  const [showPast, setShowPast] = useState(false);

  const showAssign = !readOnly;
  const headerBar = (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {getName('dispatch', true)}
      </h2>
      {showAssign && (
        <Button onClick={onAssign}>
          <PlusIcon className="size-4" />
          {t('workOrders.dispatches.assignTechnician')}
        </Button>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <section aria-label={getName('dispatch', true)} className="mt-3 mb-6">
        {headerBar}
        <div className="rounded-lg border border-dashed border-zinc-200 p-3 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          {t('common.actions.loading', { entities: getName('dispatch', true) })}
        </div>
      </section>
    );
  }

  if (active.length === 0 && past.length === 0) {
    return (
      <section aria-label={getName('dispatch', true)} className="mt-3 mb-6">
        {headerBar}
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-200 p-3 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          <CalendarIcon className="size-4 text-zinc-400" />
          <span>
            {t('workOrders.dispatches.empty', { entity: getName('technician') })}
          </span>
        </div>
      </section>
    );
  }

  return (
    <section aria-label={getName('dispatch', true)} className="mt-3 mb-6">
      {headerBar}
      {/* Catalyst Table for cross-row column alignment (name, timestamp,
          pill, action, kebab all line up). Tightened gutter + !py-1 cells +
          dense buttons keep rows ~32px tall — table mechanics give us
          alignment for free, we just have to override the default padding. */}
      <Table dense className="[--gutter:theme(spacing.2)] text-sm">
        <TableBody>
          {active.map((d) => (
            <DispatchRow
              key={d.id}
              dispatch={d}
              tech={usersById.get(d.assignedUserId)}
              readOnly={readOnly}
              now={now}
              onEdit={onEdit}
              onSelect={onSelect}
            />
          ))}
          {past.length > 0 && (
            <TableRow>
              <TableCell colSpan={6} className="!py-1">
                <button
                  type="button"
                  onClick={() => setShowPast((s) => !s)}
                  aria-expanded={showPast}
                  className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                >
                  <ChevronRightIcon
                    className={`size-3 transition-transform ${showPast ? 'rotate-90' : ''}`}
                  />
                  {t('workOrders.dispatches.past', { count: past.length })}
                </button>
              </TableCell>
            </TableRow>
          )}
          {showPast &&
            past.map((d) => (
              <PastDispatchRow
                key={d.id}
                dispatch={d}
                tech={usersById.get(d.assignedUserId)}
                readOnly={readOnly}
                onEdit={onEdit}
                onSelect={onSelect}
              />
            ))}
        </TableBody>
      </Table>
    </section>
  );
}

interface RowProps {
  dispatch: Dispatch;
  tech: User | undefined;
  readOnly: boolean;
  now: number;
  onEdit: (dispatch: Dispatch) => void;
  onSelect: (dispatch: Dispatch) => void;
}

const NOTIFY_SENT_FLASH_MS = 3000;

function DispatchRow({
  dispatch,
  tech,
  readOnly,
  now,
  onEdit,
  onSelect,
}: RowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // Transient "Sent ✓" replaces the Notify button briefly after a successful
  // send. The button reverts because notify is idempotent on the backend —
  // dispatcher can resend (window changed, tech missed it) without state churn.
  const [justNotified, setJustNotified] = useState(false);
  const notifiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (notifiedTimerRef.current) clearTimeout(notifiedTimerRef.current);
    };
  }, []);

  const advanceMutation = useMutation({
    mutationFn: (next: DispatchStatus) =>
      dispatchesApi.update(dispatch.id, { status: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({
        queryKey: ['work-order-activity', dispatch.workOrderId],
      });
      // Dispatch changes shift the resolved on-site/scheduled tech and can move
      // the work order's scheduled/progress state — refresh the location
      // detail's resolved-tech read plus the work-order list/card and detail
      // caches. Prefix keys match every cached variant.
      queryClient.invalidateQueries({ queryKey: ['location-tech'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.statusUpdateError'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => dispatchesApi.delete(dispatch.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({
        queryKey: ['work-order-activity', dispatch.workOrderId],
      });
      // Dispatch changes shift the resolved on-site/scheduled tech and can move
      // the work order's scheduled/progress state — refresh the location
      // detail's resolved-tech read plus the work-order list/card and detail
      // caches. Prefix keys match every cached variant.
      queryClient.invalidateQueries({ queryKey: ['location-tech'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.deleteError'));
    },
  });

  const notifyMutation = useMutation({
    mutationFn: () => dispatchesApi.notify(dispatch.id),
    onSuccess: () => {
      setJustNotified(true);
      if (notifiedTimerRef.current) clearTimeout(notifiedTimerRef.current);
      notifiedTimerRef.current = setTimeout(
        () => setJustNotified(false),
        NOTIFY_SENT_FLASH_MS
      );
      // Drawer reads notification_logs scoped to this dispatch — invalidate
      // so the next mount (or any active query) refetches and shows the new
      // send. Backend creates the log entry asynchronously off the request,
      // so the refetch may race briefly; a subsequent open will always show
      // it. Scoped to this dispatch's key so we don't churn other rows.
      queryClient.invalidateQueries({
        queryKey: [
          'notification-logs',
          { entityType: 'DISPATCH', entityId: dispatch.id },
        ],
      });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.notifyError'));
    },
  });

  const techName = tech
    ? `${tech.firstName} ${tech.lastName}`.trim() || tech.email
    : '—';
  const next = NEXT_STATUS[dispatch.status];
  const overdue = isOverdue(dispatch, now);
  const canManage = !readOnly;

  // State-aware single primary action. SCHEDULED → Notify (Mark arrived lives
  // in the kebab as the secondary path for "tech walked up unannounced");
  // IN_PROGRESS → Mark completed (advances to COMPLETED). Backend doesn't
  // currently track a NOTIFIED state, so post-notify the button reverts —
  // notify is idempotent, dispatcher can resend if needed.
  // Dense inline buttons — Catalyst Button defaults to py-1.5 which lands the
  // row at ~38px. For these inline rows we want ~32px, so tighten padding
  // with !important overrides (Catalyst's own classes use the same specificity
  // tier; without ! they win).
  const denseBtn = '!py-0 !text-sm';
  let primaryAction: React.ReactNode = null;
  if (!readOnly) {
    if (dispatch.status === 'SCHEDULED') {
      primaryAction = justNotified ? (
        <span className="inline-flex items-center gap-1 text-sm text-lime-600 dark:text-lime-400">
          <CheckIcon className="size-4" />
          {t('workOrders.dispatches.notifySent')}
        </span>
      ) : (
        <Button
          plain
          className={denseBtn}
          onClick={() => notifyMutation.mutate()}
          disabled={notifyMutation.isPending}
          title={
            tech?.phoneNumber
              ? undefined
              : t('workOrders.dispatches.notifyMissingPhone')
          }
        >
          {t('workOrders.dispatches.notify')}
        </Button>
      );
    } else if (dispatch.status === 'IN_PROGRESS' && next) {
      primaryAction = (
        <Button
          plain
          className={denseBtn}
          onClick={() => advanceMutation.mutate(next)}
          disabled={advanceMutation.isPending}
        >
          {t('workOrders.dispatches.markCompleted')}
        </Button>
      );
    }
  }

  const handleDelete = () => {
    if (deleteMutation.isPending) return;
    if (!window.confirm(t('workOrders.dispatches.deleteConfirm'))) return;
    deleteMutation.mutate();
  };

  // Row body opens the detail drawer. Action button + kebab stop propagation
  // on their own cell so they don't dual-fire (open drawer AND fire their
  // handler) — the user clicked the *control*, not the row.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <TableRow
      onClick={() => onSelect(dispatch)}
      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5"
    >
      <TableCell className="!py-1 w-px">
        <span
          aria-label={overdue ? t('workOrders.dispatches.overdue') : undefined}
          className={`block size-2 shrink-0 rounded-full ${getDotColor(dispatch, now)}`}
        />
      </TableCell>
      <TableCell className="!py-1 whitespace-nowrap">
        <div className="font-medium text-zinc-950 dark:text-white">
          {techName}
        </div>
        {dispatch.notes && (
          <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {dispatch.notes}
          </div>
        )}
      </TableCell>
      <TableCell className="!py-1 w-full whitespace-nowrap text-zinc-600 dark:text-zinc-300">
        {formatActiveTimestamp(dispatch, t)}
      </TableCell>
      <TableCell className="!py-1 w-px whitespace-nowrap">
        <Badge color={STATUS_BADGE[dispatch.status]}>
          {t(`workOrders.dispatches.status.${dispatch.status}`)}
        </Badge>
      </TableCell>
      <TableCell
        className="!py-1 w-px whitespace-nowrap text-right"
        onClick={stop}
      >
        {primaryAction}
      </TableCell>
      <TableCell className="!py-1 w-px whitespace-nowrap" onClick={stop}>
        {canManage && (
          <Dropdown>
            <DropdownButton
              plain
              aria-label={t('common.moreOptions')}
              className="!py-0"
            >
              <EllipsisVerticalIcon className="size-5" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              {dispatch.status === 'SCHEDULED' && next && (
                <DropdownItem onClick={() => advanceMutation.mutate(next)}>
                  <DropdownLabel>
                    {t('workOrders.dispatches.markArrived')}
                  </DropdownLabel>
                </DropdownItem>
              )}
              <DropdownItem onClick={() => onEdit(dispatch)}>
                <DropdownLabel>{t('common.edit')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={handleDelete}>
                <DropdownLabel>{t('common.delete')}</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        )}
      </TableCell>
    </TableRow>
  );
}

interface PastRowProps {
  dispatch: Dispatch;
  tech: User | undefined;
  readOnly: boolean;
  onEdit: (dispatch: Dispatch) => void;
  onSelect: (dispatch: Dispatch) => void;
}

function PastDispatchRow({
  dispatch,
  tech,
  readOnly,
  onEdit,
  onSelect,
}: PastRowProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => dispatchesApi.delete(dispatch.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({
        queryKey: ['work-order-activity', dispatch.workOrderId],
      });
      // Dispatch changes shift the resolved on-site/scheduled tech and can move
      // the work order's scheduled/progress state — refresh the location
      // detail's resolved-tech read plus the work-order list/card and detail
      // caches. Prefix keys match every cached variant.
      queryClient.invalidateQueries({ queryKey: ['location-tech'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.deleteError'));
    },
  });

  const techName = tech
    ? `${tech.firstName} ${tech.lastName}`.trim() || tech.email
    : '—';
  // CANCELLED and NO_SHOW are both "this visit didn't happen" — strike them.
  const cancelled = dispatch.status === 'CANCELLED' || dispatch.status === 'NO_SHOW';
  const canManage = !readOnly;

  const handleDelete = () => {
    if (deleteMutation.isPending) return;
    if (!window.confirm(t('workOrders.dispatches.deleteConfirm'))) return;
    deleteMutation.mutate();
  };

  // Past rows: muted text + no dot (the Past (N) header carries the section).
  // Cancelled rows add strikethrough so "this didn't happen" reads at a glance
  // without a separate sub-divider.
  const mutedClass =
    'text-zinc-500 dark:text-zinc-400' + (cancelled ? ' line-through' : '');

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <TableRow
      onClick={() => onSelect(dispatch)}
      className="cursor-pointer hover:bg-zinc-50 dark:hover:bg-white/5"
    >
      {/* Empty dot slot — past rows have no dot (Past header carries the
          section). Empty cell preserves column alignment with active rows. */}
      <TableCell className="!py-1 w-px" aria-hidden />
      <TableCell className={`!py-1 whitespace-nowrap ${mutedClass}`}>
        {techName}
      </TableCell>
      <TableCell className={`!py-1 w-full whitespace-nowrap ${mutedClass}`}>
        {formatPastTimestamp(dispatch, t)}
      </TableCell>
      {/* Empty pill + action slots — past rows have neither, but the empty
          cells keep column alignment so kebabs line up with active rows. */}
      <TableCell className="!py-1 w-px" aria-hidden />
      <TableCell className="!py-1 w-px" aria-hidden />
      <TableCell className="!py-1 w-px whitespace-nowrap" onClick={stop}>
        {canManage && (
          <Dropdown>
            <DropdownButton
              plain
              aria-label={t('common.moreOptions')}
              className="!py-0"
            >
              <EllipsisVerticalIcon className="size-5" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem onClick={() => onEdit(dispatch)}>
                <DropdownLabel>{t('common.edit')}</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={handleDelete}>
                <DropdownLabel>{t('common.delete')}</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        )}
      </TableCell>
    </TableRow>
  );
}
