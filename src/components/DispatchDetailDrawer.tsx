import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpTrayIcon,
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  PlayIcon,
  PlusIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  notificationApi,
  type NotificationLogDto,
  type NotificationStatus,
  type PageableResponse,
} from '../api/notificationApi';
import {
  dispatchesApi,
  dispatchNotesApi,
  userApi,
  workOrderFilesApi,
  type Dispatch,
  type DispatchLifecycle,
  type DispatchStatus,
  type ProgressCategory,
  type User,
  type WorkItemResponse,
  type WorkOrderFile,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Avatar } from './ui/Avatar';
import { Pill, Tag } from './ui/Pill';
import { Button } from './catalyst/button';
import { SlideOver } from './catalyst/slideover';
import WorkOrderFileUploadDialog from './WorkOrderFileUploadDialog';
import { FileLightbox } from './WorkOrderFilesTab';
import { formatPhone } from '../utils/formatPhone';
import { workItemLabel } from '../utils/workItemLabel';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

// Status → { tone, live, accent }. EN_ROUTE + IN_PROGRESS are both "live"
// (violet); the drawer leads with self-reported status (no GPS/ETA bar).
const PRESENTATION: Record<DispatchStatus, { tone: PillTone; live?: boolean; accent: string }> = {
  SCHEDULED: { tone: 'info', accent: 'var(--info-500)' },
  EN_ROUTE: { tone: 'violet', live: true, accent: 'var(--violet-500)' },
  IN_PROGRESS: { tone: 'violet', live: true, accent: 'var(--violet-500)' },
  COMPLETED: { tone: 'success', accent: 'var(--success-500)' },
  NO_SHOW: { tone: 'warning', accent: 'var(--warning-500)' },
  CANCELLED: { tone: 'neutral', accent: 'var(--border-strong)' },
};

const NOTIF_TONE: Record<NotificationStatus, PillTone> = {
  DELIVERED: 'success',
  SENT: 'info',
  PENDING: 'neutral',
  BOUNCED: 'danger',
  FAILED: 'danger',
};

// Work-item statusCategory → Pill tone (shared grammar with the overview peek).
const PROGRESS_TONE: Record<ProgressCategory, PillTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'violet',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const MONTH_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const TIME_ONLY = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
// "May 10 · 7:27 PM" — no weekday, middot separator (matches the mock).
const stamp = (iso: string): string => `${MONTH_DAY.format(new Date(iso))} · ${TIME_ONLY.format(new Date(iso))}`;
const titleCase = (s: string): string => s.charAt(0) + s.slice(1).toLowerCase();

// The Tech/Customer-notified timeline steps derive from the notification log
// (the earliest actually-sent row for that audience), NOT trip.lifecycle —
// only the four operational steps come from lifecycle.
function earliestNotified(logs: NotificationLogDto[], audience: 'TECH' | 'CUSTOMER'): string | null {
  const times = logs
    .filter((n) => n.audience === audience && (n.status === 'SENT' || n.status === 'DELIVERED'))
    .map((n) => n.sentAt ?? n.createdAt)
    .filter((s): s is string => Boolean(s))
    .sort();
  return times[0] ?? null;
}

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) return `${MONTH_DAY.format(start)} · ${TIME_ONLY.format(start)} – ${TIME_ONLY.format(end)}`;
  return `${stamp(startIso)} – ${stamp(endIso)}`;
}

interface Props {
  /** When non-null, the drawer is open and shows this dispatch. Null closes it
   *  (parent owns open state — same pattern as EquipmentQuickViewDrawer). */
  dispatch: Dispatch | null;
  /** The work order's dispatches, used to derive this visit's sequence number
   *  (Trip 1 = earliest arrival). Optional; the badge degrades without it. */
  dispatches?: Dispatch[];
  /** The work order's work items, used to resolve this visit's
   *  addressedWorkItemIds → complaint + status. Optional. */
  workItems?: WorkItemResponse[];
  readOnly?: boolean;
  onClose: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onDelete: (dispatch: Dispatch) => void;
  /** Link out from an addressed work item (opens the Work items tab). */
  onViewWorkItems?: () => void;
}

/**
 * Right-edge drawer for a single dispatch (visit). Redesign of the legacy
 * contact-only drawer per `claude_designs/screen-wo-trip-drawer.jsx`:
 * status-aware header · tech + call/text · visit timeline · captured media ·
 * customer notifications · state-aware footer transitions.
 *
 * Consumes the trip-lifecycle backend (FE_HANDOFF_trip_lifecycle.md): the
 * timeline + header label read from the by-id `lifecycle`/`label`, transitions
 * step SCHEDULED → EN_ROUTE → IN_PROGRESS → COMPLETED. Still deferred: per-visit
 * addressed work-items, collected payment, and the live ETA bar (no GPS signal).
 */
export default function DispatchDetailDrawer({
  dispatch,
  dispatches,
  workItems,
  readOnly = false,
  onClose,
  onEdit,
  onDelete,
  onViewWorkItems,
}: Props) {
  return (
    <SlideOver open={dispatch !== null} onClose={onClose} className="!max-w-[480px]">
      {dispatch && (
        <DispatchDetailContent
          dispatch={dispatch}
          dispatches={dispatches}
          workItems={workItems}
          readOnly={readOnly}
          onClose={onClose}
          onEdit={onEdit}
          onDelete={onDelete}
          onViewWorkItems={onViewWorkItems}
        />
      )}
    </SlideOver>
  );
}

interface ContentProps {
  dispatch: Dispatch;
  dispatches?: Dispatch[];
  workItems?: WorkItemResponse[];
  readOnly: boolean;
  onClose: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onDelete: (dispatch: Dispatch) => void;
  onViewWorkItems?: () => void;
}

function DispatchDetailContent({
  dispatch,
  dispatches,
  workItems,
  readOnly,
  onClose,
  onEdit,
  onDelete,
  onViewWorkItems,
}: ContentProps) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  // Index into `media` for the fullscreen viewer; null = closed.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // The board row lacks lifecycle/label — fetch the by-id read for those.
  const { data: detail } = useQuery({
    queryKey: ['dispatch', dispatch.id],
    queryFn: () => dispatchesApi.getById(dispatch.id),
  });
  const full = detail ?? dispatch;
  const p = PRESENTATION[full.status];
  const done = full.status === 'COMPLETED';

  // Trip sequence — 1-indexed by arrival, across non-cancelled visits.
  const seq = useMemo(() => {
    const ordered = (dispatches ?? [])
      .filter((d) => d.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime());
    const i = ordered.findIndex((d) => d.id === dispatch.id);
    return i >= 0 ? i + 1 : null;
  }, [dispatches, dispatch.id]);

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll() });
  const tech: User | undefined = users.find((u) => u.id === full.assignedUserId);
  const techName = tech ? `${tech.firstName} ${tech.lastName}`.trim() || tech.email : '—';
  const techDigits = tech?.phoneNumber?.replace(/\D/g, '') ?? '';

  const { data: notifPage, isLoading: notifLoading, isError: notifError } = useQuery({
    queryKey: ['notification-logs', { entityType: 'DISPATCH', entityId: dispatch.id }],
    queryFn: () =>
      notificationApi.getNotificationLogs({
        entityType: 'DISPATCH',
        entityId: dispatch.id,
        size: 25,
        sort: 'createdAt,desc',
      }),
  });
  const notifications = useMemo<NotificationLogDto[]>(() => notifPage?.content ?? [], [notifPage]);
  const techNotifiedAt = useMemo(() => earliestNotified(notifications, 'TECH'), [notifications]);
  const customerNotifiedAt = useMemo(() => earliestNotified(notifications, 'CUSTOMER'), [notifications]);

  // Captured this visit — media keyed by dispatchId (same source + key as the tab).
  const { data: filesPage } = useQuery({
    queryKey: ['work-order-files', dispatch.workOrderId, 'dispatch-media'],
    queryFn: () => workOrderFilesApi.list(dispatch.workOrderId, { limit: 100 }),
  });
  const media = useMemo(
    () =>
      (filesPage?.content ?? []).filter(
        (f) => f.dispatchId === dispatch.id && (f.kind === 'PHOTO' || f.kind === 'VIDEO'),
      ),
    [filesPage, dispatch.id],
  );

  // Visit-timeline steps, read from lifecycle (falls back to the top-level /
  // notification data when the by-id lifecycle isn't loaded/populated yet).
  const lc: DispatchLifecycle = full.lifecycle ?? {
    scheduled: full.createdAt,
    notified: null,
    enroute: null,
    arrived: full.arrivedAt,
    departed: full.departedAt,
  };
  const steps: { label: string; at: string | null; notify?: 'TECH' | 'CUSTOMER' }[] = [
    { label: t('workOrders.dispatches.drawer.timelineScheduled'), at: lc.scheduled },
    { label: t('workOrders.dispatches.drawer.timelineTechNotified'), at: techNotifiedAt, notify: 'TECH' },
    { label: t('workOrders.dispatches.drawer.timelineNotified'), at: customerNotifiedAt, notify: 'CUSTOMER' },
    { label: t('workOrders.dispatches.drawer.timelineEnRoute'), at: lc.enroute },
    { label: t('workOrders.dispatches.drawer.timelineArrived'), at: lc.arrived },
    { label: t('workOrders.dispatches.drawer.timelineDeparted'), at: lc.departed },
  ];
  const lastReached = steps.reduce((max, s, i) => (s.at ? i : max), -1);

  const statusMutation = useMutation({
    mutationFn: (status: DispatchStatus) => dispatchesApi.update(dispatch.id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch', dispatch.id] });
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', dispatch.workOrderId] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.drawer.statusError', { entity: getName('dispatch') }));
    },
  });

  // Milestone notify — released from a pending timeline step ("Notify now →").
  // /notify is async (202), so an immediate refetch wouldn't see the new log
  // row yet. techNotified / customerNotified are DERIVED from the log, so we
  // OPTIMISTICALLY insert a sent row: the step fills + the row appears at once.
  // It reconciles with the real row on the next natural refetch (drawer reopen).
  const notifKey = ['notification-logs', { entityType: 'DISPATCH', entityId: dispatch.id }] as const;
  const notifyMutation = useMutation({
    mutationFn: (audience: 'TECH' | 'CUSTOMER') => dispatchesApi.notify(dispatch.id, audience),
    onMutate: async (audience: 'TECH' | 'CUSTOMER') => {
      await queryClient.cancelQueries({ queryKey: notifKey });
      const prev = queryClient.getQueryData<PageableResponse<NotificationLogDto>>(notifKey);
      const optimistic: NotificationLogDto = {
        id: `optimistic-${audience}`,
        notificationId: `optimistic-${audience}`,
        notificationTypeId: '',
        notificationTypeName: '',
        channel: audience === 'TECH' ? 'PUSH' : 'SMS',
        recipientName: audience === 'TECH' ? techName : '',
        status: 'SENT',
        entityType: 'DISPATCH',
        entityId: dispatch.id,
        audience,
        createdAt: new Date().toISOString(),
        retryCount: 0,
      };
      queryClient.setQueryData<PageableResponse<NotificationLogDto>>(notifKey, (old) =>
        old ? { ...old, content: [optimistic, ...old.content] } : old,
      );
      return { prev };
    },
    onError: (err: unknown, _audience, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(notifKey, ctx.prev);
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.drawer.statusError', { entity: getName('dispatch') }));
    },
    onSuccess: () => {
      // Board rows may surface notify state; the log reconciles on reopen.
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
    },
  });
  // Notify-able only while on deck (SCHEDULED); live/done/cancelled hide it.
  const canNotify = !readOnly && full.status === 'SCHEDULED';

  // State-aware primary transition: Scheduled → En route → On site → Complete.
  const primary =
    full.status === 'SCHEDULED'
      ? { label: t('workOrders.dispatches.drawer.markEnRoute'), next: 'EN_ROUTE' as DispatchStatus }
      : full.status === 'EN_ROUTE'
        ? { label: t('workOrders.dispatches.drawer.markOnSite'), next: 'IN_PROGRESS' as DispatchStatus }
        : full.status === 'IN_PROGRESS'
          ? { label: t('workOrders.dispatches.drawer.completeVisit', { entity: getName('dispatch') }), next: 'COMPLETED' as DispatchStatus }
          : null;

  // Work addressed — resolve the visit's ids against the WO's items. Empty =
  // unscoped (covers the whole WO), so the section hides.
  const addressed = (full.addressedWorkItemIds ?? []).map((id) => ({
    id,
    wi: (workItems ?? []).find((w) => w.id === id),
  }));

  const windowStr = formatWindow(full.arrivalWindowStart, full.arrivalWindowEnd);

  return (
    <>
      {/* 1 · Status-aware header */}
      <div className="flex items-start gap-2.5 border-b border-border-soft px-4 py-3">
        <span
          className="grid size-7 shrink-0 place-items-center rounded-md text-[12px] font-bold"
          style={{
            color: done || p.live ? 'white' : 'var(--info-500)',
            background: done
              ? 'var(--success-500)'
              : p.live
                ? 'var(--violet-500)'
                : 'color-mix(in oklch, var(--info-500) 14%, var(--bg-elev))',
          }}
        >
          {done ? '✓' : (seq ?? '·')}
        </span>
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2">
            <span className="text-[14.5px] font-bold tracking-tight text-fg-strong">
              {seq ? `${getName('dispatch')} ${seq}` : getName('dispatch')}
            </span>
            <Pill tone={p.tone} dot live={p.live}>
              {full.status === 'IN_PROGRESS'
                ? t('workOrders.dispatches.onSite')
                : t(`workOrders.dispatches.status.${full.status}`)}
            </Pill>
          </div>
          <span className="mt-0.5 block text-[12px] text-fg-muted">
            {full.label ? `${full.label} · ${windowStr}` : windowStr}
          </span>
        </div>
        <Button plain onClick={onClose} aria-label={t('common.close')}>
          <XMarkIcon className="size-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 2 · Tech — name + role + call/text. Live visits show self-reported
            status (no ETA/progress bar — no GPS signal). */}
        <div className="border-b border-border-soft px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Avatar name={techName} size="md" />
            <div className="min-w-0 grow">
              <div className="text-[13px] font-semibold text-fg-strong">{techName}</div>
              <div className="text-[11px] text-fg-muted">{t('workOrders.dispatches.drawer.assignedTech')}</div>
            </div>
            {techDigits && (
              <>
                <a
                  href={`tel:${techDigits}`}
                  className="inline-flex h-[30px] items-center gap-1 rounded-md border border-border px-2.5 text-[12.5px] font-semibold text-fg-strong no-underline hover:bg-bg-hover"
                >
                  <PhoneIcon className="size-3.5" /> {t('workOrders.dispatches.drawer.call')}
                </a>
                <a
                  href={`sms:${techDigits}`}
                  className="inline-flex h-[30px] items-center gap-1 rounded-md border border-border px-2.5 text-[12.5px] font-semibold text-fg-strong no-underline hover:bg-bg-hover"
                >
                  <ChatBubbleLeftRightIcon className="size-3.5" /> {t('workOrders.dispatches.drawer.text')}
                </a>
              </>
            )}
          </div>
          {p.live && (
            <div className="mt-2 text-[12px] text-fg-muted">
              {t('workOrders.dispatches.liveSelfReported')}
            </div>
          )}
        </div>

        {/* 3 · Visit timeline — connector runs green to the furthest-reached
            milestone; a passed-but-unstamped step (e.g. skipped En route) shows
            as a hollow dot on the green line, not a broken chain. */}
        <Section title={t('workOrders.dispatches.drawer.timeline', { entity: getName('dispatch') })}>
          {steps.map((s, i) => (
            <TimelineStep
              key={s.label}
              label={s.label}
              at={s.at}
              reached={!!s.at}
              active={!!p.live && i === lastReached}
              topDone={i > 0 && i <= lastReached}
              bottomDone={i < lastReached}
              first={i === 0}
              last={i === steps.length - 1}
              onNotify={s.notify && canNotify && !s.at ? () => notifyMutation.mutate(s.notify!) : undefined}
              notifyPending={notifyMutation.isPending}
            />
          ))}
        </Section>

        {/* 4 · Work addressed — items this visit covers (empty = whole WO) */}
        {addressed.length > 0 && (
          <Section title={t('workOrders.dispatches.drawer.workAddressed')} count={addressed.length}>
            <div className="flex flex-col gap-1.5">
              {addressed.map(({ id, wi }) => {
                const inner = (
                  <>
                    <div className="min-w-0 grow">
                      <div className="truncate text-[12.5px] font-medium text-fg-strong">
                        {wi ? wi.description : id}
                      </div>
                      {wi && (wi.sequence != null || wi.equipment) && (
                        <div className="truncate text-[10.5px] text-fg-dim">
                          {wi.sequence != null && (
                            <span className="font-mono">{workItemLabel(getAbbrev('work_item'), wi.sequence)}</span>
                          )}
                          {wi.sequence != null && wi.equipment && ' · '}
                          {wi.equipment?.name}
                        </div>
                      )}
                    </div>
                    {wi && (
                      <Pill tone={PROGRESS_TONE[wi.statusCategory]} dot>
                        {wi.statusCategory.replace(/_/g, ' ').toLowerCase()}
                      </Pill>
                    )}
                  </>
                );
                return onViewWorkItems ? (
                  <button
                    key={id}
                    type="button"
                    onClick={onViewWorkItems}
                    className="flex items-center gap-2 rounded-sm border border-border-soft bg-bg px-2.5 py-2 text-left hover:bg-bg-hover"
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={id} className="flex items-center gap-2 rounded-sm border border-border-soft bg-bg px-2.5 py-2">
                    {inner}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* 5 · Visit notes — a multi-entry log; the office can add here too */}
        <VisitNotesSection dispatchId={dispatch.id} readOnly={readOnly} />

        {/* 5 · Captured this visit — derived media + office upload (secondary path,
            pre-tagged to this dispatch). Rich per-media tagging is the tech app. */}
        {(media.length > 0 || !readOnly) && (
          <Section
            title={t('workOrders.dispatches.drawer.captured', { entity: getName('dispatch') })}
            count={media.length || undefined}
          >
            {media.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {media.map((m, i) => (
                  <MediaThumb key={m.id} m={m} onOpen={() => setLightboxIndex(i)} />
                ))}
              </div>
            )}
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => setUploadOpen(true)}
                  className={`inline-flex h-[30px] items-center gap-1 text-fg-muted hover:text-fg-strong${media.length > 0 ? ' mt-2' : ''}`}
                  style={{ fontSize: '12.5px', fontWeight: 600 }}
                >
                  <ArrowUpTrayIcon className="size-3.5 shrink-0" />
                  {/* Geist seats text high next to an icon; nudge to optical center. */}
                  <span className="relative top-[0.5px]">
                    {t('workOrders.dispatches.drawer.uploadMedia')}
                  </span>
                </button>
                {media.length === 0 && (
                  <p className="mt-1.5 text-[11px] leading-snug text-fg-dim">
                    {t('workOrders.dispatches.drawer.captureHint')}
                  </p>
                )}
              </>
            )}
          </Section>
        )}
        {!readOnly && (
          <WorkOrderFileUploadDialog
            isOpen={uploadOpen}
            onClose={() => setUploadOpen(false)}
            workOrderId={dispatch.workOrderId}
            dispatches={dispatches ?? [dispatch]}
            defaultDispatchId={dispatch.id}
          />
        )}
        {/* Fullscreen viewer for captured media (view-only here; manage in Files). */}
        <FileLightbox
          media={media}
          startIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          readOnly
          onRequestDelete={() => undefined}
        />

        {/* 6 · Customer notifications — the notification_logs trail */}
        <Section title={t('workOrders.dispatches.drawer.notifications')} last>
          {notifLoading && (
            <div className="text-[12.5px] text-fg-muted">
              {t('workOrders.dispatches.drawer.notificationsLoading')}
            </div>
          )}
          {notifError && (
            <div className="text-[12.5px] text-danger-500">
              {t('workOrders.dispatches.drawer.notificationsError')}
            </div>
          )}
          {!notifLoading && !notifError && notifications.length === 0 && (
            <div className="text-[12.5px] text-fg-muted">
              {t('workOrders.dispatches.drawer.notificationsEmpty')}
            </div>
          )}
          <div className="flex flex-col gap-2">
            {notifications.map((log) => {
              const tech = log.audience === 'TECH';
              return (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="grid size-[22px] shrink-0 place-items-center rounded bg-bg-active text-[9.5px] font-bold text-fg-muted">
                    {log.channel.slice(0, 3)}
                  </span>
                  <div className="min-w-0 grow">
                    <div className="flex items-center gap-1.5">
                      {log.audience && (
                        <span
                          className="shrink-0 rounded-full px-1.5 py-px text-[9.5px] font-bold tracking-[0.03em]"
                          style={{
                            background: tech
                              ? 'color-mix(in oklch, var(--violet-500) 14%, var(--bg-elev))'
                              : 'color-mix(in oklch, var(--accent-500) 13%, var(--bg-elev))',
                            color: tech ? 'var(--violet-500)' : 'var(--accent-700)',
                          }}
                        >
                          {tech
                            ? t('workOrders.dispatches.drawer.audienceTech')
                            : t('workOrders.dispatches.drawer.audienceCustomer')}
                        </span>
                      )}
                      <span className="truncate text-[10.5px] text-fg-dim">
                        {log.recipientPhone
                          ? formatPhone(log.recipientPhone)
                          : log.recipientEmail || log.recipientName}
                      </span>
                      <span className="grow" />
                      <Pill tone={NOTIF_TONE[log.status]} dot>
                        {titleCase(log.status)}
                      </Pill>
                    </div>
                    {log.body && (
                      <div className="mt-0.5 text-[11.5px] leading-snug text-fg-muted">{log.body}</div>
                    )}
                    <div className="mt-px text-[10px] text-fg-dim">{stamp(log.sentAt ?? log.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      {/* 7 · State-aware footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-soft bg-bg-elev-2 px-4 py-3">
        {done ? (
          <>
            <span className="text-[11.5px] text-fg-muted">
              {full.departedAt
                ? t('workOrders.dispatches.completedAt', { time: stamp(full.departedAt) })
                : t('workOrders.dispatches.status.COMPLETED')}
            </span>
            <span className="grow" />
            {!readOnly && (
              <Button plain size="xs" onClick={() => onDelete(dispatch)}>
                {t('common.delete')}
              </Button>
            )}
          </>
        ) : (
          !readOnly && (
            <>
              {/* One edit entry — the form covers tech, window, work items, and
                  release, so a single "Edit" reads truer than Reassign/Reschedule. */}
              <Button plain size="xs" onClick={() => onEdit(dispatch)}>
                {`${t('common.edit')} ${getName('dispatch').toLowerCase()}`}
              </Button>
              <span className="grow" />
              {primary && (
                <Button
                  color="accent"
                  size="xs"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(primary.next)}
                >
                  {primary.label}
                </Button>
              )}
            </>
          )
        )}
      </div>
    </>
  );
}

// Visit notes — the dispatch's note log (body · author · when) plus an office
// add box. The tech app appends to the same log; the server stamps the author.
function VisitNotesSection({ dispatchId, readOnly }: { dispatchId: string; readOnly: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const { data: notes = [] } = useQuery({
    queryKey: ['dispatch-notes', dispatchId],
    queryFn: () => dispatchNotesApi.list(dispatchId),
  });
  const create = useMutation({
    mutationFn: (body: string) => dispatchNotesApi.create(dispatchId, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-notes', dispatchId] });
      setDraft('');
      setAdding(false);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('workOrders.dispatches.drawer.noteError'));
    },
  });
  const canAdd = draft.trim().length > 0 && !create.isPending;
  return (
    <Section title={t('workOrders.dispatches.drawer.notes')}>
      <div className="flex flex-col gap-2">
        {notes.length === 0 && (
          <div className="text-[12px] text-fg-dim">{t('workOrders.dispatches.drawer.notesEmpty')}</div>
        )}
        {notes.map((n) => (
          <div key={n.id} className="rounded-md border border-border-soft bg-bg-elev-2 px-2.5 py-2">
            <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{n.body}</div>
            <div className="mt-1 text-[10px] text-fg-dim">
              {[n.authorName, stamp(n.createdAt)].filter(Boolean).join(' · ')}
            </div>
          </div>
        ))}
      </div>
      {/* Collapsed to a compact trigger to save vertical space; expands on click. */}
      {!readOnly &&
        (adding ? (
          <div className="mt-2 rounded-md border border-border bg-bg p-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={t('workOrders.dispatches.drawer.addNotePlaceholder')}
              aria-label={t('workOrders.dispatches.drawer.addNotePlaceholder')}
              className="w-full resize-none border-0 bg-transparent text-[12.5px] leading-relaxed text-fg-strong outline-none"
            />
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10.5px] text-fg-dim">{t('workOrders.dispatches.drawer.officeNoteHint')}</span>
              <span className="flex-1" />
              <Button
                plain
                size="xs"
                onClick={() => {
                  setAdding(false);
                  setDraft('');
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button color="accent" size="xs" disabled={!canAdd} onClick={() => create.mutate(draft.trim())}>
                {t('workOrders.dispatches.drawer.addNote')}
              </Button>
            </div>
          </div>
        ) : (
          // Bespoke muted ghost (transparent, borderless, no hover-fill) — Catalyst
          // `plain` can't produce it (hardcodes text-zinc-950 + a hover-fill), so this
          // stays a bare <button>. .btn token = 12.5px/600/30px; both are inline because
          // a bare button's Tailwind text-/font- utilities lose to the unlayered body
          // font flowing through Preflight's `button { font: inherit }`.
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 inline-flex h-[30px] items-center gap-1 text-fg-muted hover:text-fg-strong"
            style={{ fontSize: '12.5px', fontWeight: 600 }}
          >
            <PlusIcon className="size-3.5 shrink-0" />
            {/* Geist seats text high next to an icon; nudge to optical center. */}
            <span className="relative top-[0.5px]">{t('workOrders.dispatches.drawer.addNote')}</span>
          </button>
        ))}
    </Section>
  );
}

function Section({
  title,
  count,
  last,
  children,
}: {
  title: string;
  count?: number;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`px-4 py-3 ${last ? '' : 'border-b border-border-soft'}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="label-tiny text-fg">{title}</span>
        {count != null && <Tag>{count}</Tag>}
      </div>
      {children}
    </section>
  );
}

// Vertical timeline row. The connector (top/bottom halves) is green up to the
// furthest-reached milestone; the dot is filled green when this milestone has a
// timestamp, violet+pulse when it's the active (live) step, hollow otherwise.
function TimelineStep({
  label,
  at,
  reached,
  active,
  topDone,
  bottomDone,
  first,
  last,
  onNotify,
  notifyPending,
}: {
  label: string;
  at: string | null;
  reached: boolean;
  active: boolean;
  topDone: boolean;
  bottomDone: boolean;
  first: boolean;
  last: boolean;
  onNotify?: () => void;
  notifyPending?: boolean;
}) {
  const { t } = useTranslation();
  const dotColor = active ? 'var(--violet-500)' : reached ? 'var(--success-500)' : 'var(--border-strong)';
  const filled = reached || active;
  return (
    <div className="flex items-stretch gap-2.5">
      <div className="flex w-3 shrink-0 flex-col items-center">
        <div className="h-1.5 w-0.5" style={{ background: first ? 'transparent' : topDone ? 'var(--success-500)' : 'var(--border)' }} />
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{
            background: filled ? dotColor : 'var(--bg-elev)',
            border: `2px solid ${dotColor}`,
            animation: active ? 'pulse 1.8s ease-in-out infinite' : 'none',
          }}
        />
        <div className="w-0.5 flex-1" style={{ background: last ? 'transparent' : bottomDone ? 'var(--success-500)' : 'var(--border)' }} />
      </div>
      <div className="flex grow items-baseline gap-2 pb-[9px] pt-px">
        <span
          className="whitespace-nowrap text-[12.5px]"
          style={{ fontWeight: reached || active ? 600 : 400, color: reached || active ? 'var(--fg-strong)' : 'var(--fg-dim)' }}
        >
          {label}
        </span>
        <span className="grow" />
        {/* A pending, notify-able milestone offers an inline release/send —
            "Notify now →". Bare button, so size/weight go inline (unlayered
            CSS beats the text-/font- utilities otherwise). */}
        {!reached && onNotify ? (
          <button
            type="button"
            onClick={onNotify}
            disabled={notifyPending}
            className="whitespace-nowrap rounded border border-border px-1.5 text-fg-accent hover:bg-bg-hover disabled:opacity-50"
            style={{ fontSize: '11px', fontWeight: 600, height: 22 }}
          >
            {t('workOrders.dispatches.drawer.notifyNow')}
          </button>
        ) : (
          <span
            className="whitespace-nowrap text-[11.5px]"
            style={{ color: active ? 'var(--violet-500)' : reached ? 'var(--fg-muted)' : 'var(--fg-dim)' }}
          >
            {at ? stamp(at) : '—'}
          </span>
        )}
      </div>
    </div>
  );
}

function MediaThumb({ m, onOpen }: { m: WorkOrderFile; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative size-14 shrink-0 overflow-hidden rounded-sm border border-border bg-bg-elev-2 transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
      title={m.caption ?? m.fileName}
    >
      {m.thumbnailUrl || m.kind === 'PHOTO' ? (
        <img src={m.thumbnailUrl ?? m.url} alt={m.caption ?? m.fileName} className="size-full object-cover" />
      ) : null}
      {m.kind === 'VIDEO' && (
        <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
          <PlayIcon className="size-4" />
        </span>
      )}
      {m.captureTag != null && (
        <span className="absolute left-0.5 top-0.5 rounded-[3px] bg-black/70 px-1 py-px text-[8.5px] font-semibold uppercase leading-none tracking-wide text-white">
          {t(
            m.captureTag === 'BEFORE'
              ? 'workOrders.dispatches.drawer.captureBefore'
              : 'workOrders.dispatches.drawer.captureAfter',
          )}
        </span>
      )}
    </button>
  );
}
