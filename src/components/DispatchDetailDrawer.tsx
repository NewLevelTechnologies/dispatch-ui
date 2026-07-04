import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  ChatBubbleLeftRightIcon,
  PhoneIcon,
  PlayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  notificationApi,
  type NotificationLogDto,
  type NotificationStatus,
} from '../api/notificationApi';
import {
  dispatchesApi,
  userApi,
  workOrderFilesApi,
  type Dispatch,
  type DispatchStatus,
  type User,
  type WorkOrderFile,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Avatar } from './ui/Avatar';
import { Pill, Tag } from './ui/Pill';
import { Button } from './catalyst/button';
import { SlideOver } from './catalyst/slideover';

type PillTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'violet';

// Status → { tone, live, accent }. IN_PROGRESS is the live/on-site state (no
// separate en-route status, no GPS signal — see the graceful-degradation note).
const PRESENTATION: Record<DispatchStatus, { tone: PillTone; live?: boolean; accent: string }> = {
  SCHEDULED: { tone: 'info', accent: 'var(--info-500)' },
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

const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const TIME_ONLY = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
const DATE_ONLY = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const STEP_TS = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
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
  if (sameDay) return `${DATE_ONLY.format(start)} · ${TIME_ONLY.format(start)}–${TIME_ONLY.format(end)}`;
  return `${DATE_TIME.format(start)} – ${DATE_TIME.format(end)}`;
}

interface Props {
  /** When non-null, the drawer is open and shows this dispatch. Null closes it
   *  (parent owns open state — same pattern as EquipmentQuickViewDrawer). */
  dispatch: Dispatch | null;
  /** The work order's dispatches, used to derive this visit's sequence number
   *  (Trip 1 = earliest arrival). Optional; the badge degrades without it. */
  dispatches?: Dispatch[];
  readOnly?: boolean;
  onClose: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onDelete: (dispatch: Dispatch) => void;
}

/**
 * Right-edge drawer for a single dispatch (visit). Redesign of the legacy
 * contact-only drawer per `claude_designs/screen-wo-trip-drawer.jsx`:
 * status-aware header · tech + call/text · visit timeline · captured media ·
 * notification history · state-aware footer transitions.
 *
 * Degraded (backend-deferred, see the WO cluster asks): work-items addressed
 * per visit (`trip.addressedItemIds`), payment collected (`trip.collected`),
 * and the live ETA/progress bar (no GPS signal) are omitted; the "En route"
 * timeline step stays hollow until a dispatch en-route timestamp exists.
 */
export default function DispatchDetailDrawer({
  dispatch,
  dispatches,
  readOnly = false,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  return (
    <SlideOver open={dispatch !== null} onClose={onClose} className="!max-w-[480px]">
      {dispatch && (
        <DispatchDetailContent
          dispatch={dispatch}
          dispatches={dispatches}
          readOnly={readOnly}
          onClose={onClose}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </SlideOver>
  );
}

interface ContentProps {
  dispatch: Dispatch;
  dispatches?: Dispatch[];
  readOnly: boolean;
  onClose: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onDelete: (dispatch: Dispatch) => void;
}

function DispatchDetailContent({
  dispatch,
  dispatches,
  readOnly,
  onClose,
  onEdit,
  onDelete,
}: ContentProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const p = PRESENTATION[dispatch.status];
  const done = dispatch.status === 'COMPLETED';

  // Trip sequence — 1-indexed by arrival, across non-cancelled visits.
  const seq = useMemo(() => {
    const ordered = (dispatches ?? [])
      .filter((d) => d.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime());
    const i = ordered.findIndex((d) => d.id === dispatch.id);
    return i >= 0 ? i + 1 : null;
  }, [dispatches, dispatch.id]);

  // React Query dedupes against the tab's ['users'] key — cached in the common
  // case (drawer opens from a card that already resolved the tech name).
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => userApi.getAll() });
  const tech: User | undefined = users.find((u) => u.id === dispatch.assignedUserId);
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
  // "Customer notified" timeline step derives from the earliest send (no stored
  // notified-at on the dispatch yet).
  const notifiedAt = useMemo(() => {
    const ts = notifications
      .map((n) => n.sentAt ?? n.createdAt)
      .filter(Boolean)
      .map((s) => new Date(s as string).getTime());
    return ts.length ? new Date(Math.min(...ts)).toISOString() : null;
  }, [notifications]);

  // Captured this visit — media keyed by dispatchId (same source + query key as
  // DispatchesTab so it dedupes). Photos + videos only.
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

  const statusMutation = useMutation({
    mutationFn: (status: DispatchStatus) => dispatchesApi.update(dispatch.id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
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
              {dispatch.status === 'IN_PROGRESS'
                ? t('workOrders.dispatches.onSite')
                : t(`workOrders.dispatches.status.${dispatch.status}`)}
            </Pill>
          </div>
          <span className="mt-0.5 block text-[12px] text-fg-muted">
            {formatWindow(dispatch.arrivalWindowStart, dispatch.arrivalWindowEnd)}
          </span>
        </div>
        <Button plain onClick={onClose} aria-label={t('common.close')}>
          <XMarkIcon className="size-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 2 · Tech — avatar + call/text. Live ETA/progress bar is omitted (no
            GPS signal); a live visit surfaces the self-reported status instead. */}
        <Section title={t('workOrders.dispatches.drawer.assignedTech')}>
          <div className="flex items-center gap-2.5">
            <Avatar name={techName} size="md" />
            <div className="min-w-0 grow">
              <div className="text-[13px] font-semibold text-fg-strong">{techName}</div>
              {tech?.phoneNumber && (
                <div className="font-mono text-[12px] text-fg-muted">{tech.phoneNumber}</div>
              )}
            </div>
            {techDigits && (
              <>
                <a
                  href={`tel:${techDigits}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] text-fg-strong no-underline hover:bg-bg-hover"
                >
                  <PhoneIcon className="size-3" /> {t('workOrders.dispatches.drawer.call')}
                </a>
                <a
                  href={`sms:${techDigits}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] text-fg-strong no-underline hover:bg-bg-hover"
                >
                  <ChatBubbleLeftRightIcon className="size-3" /> {t('workOrders.dispatches.drawer.text')}
                </a>
              </>
            )}
          </div>
          {p.live && (
            <div className="mt-2 text-[12px] text-fg-muted">
              {t('workOrders.dispatches.liveSelfReported')}
            </div>
          )}
        </Section>

        {/* 3 · Visit timeline — reached steps filled/green; unreached hollow.
            Scheduled/Notified/Arrived/Departed from live data; En route hollow
            until a dispatch en-route timestamp lands. */}
        <Section title={t('workOrders.dispatches.drawer.timeline')}>
          <TimelineStep label={t('workOrders.dispatches.drawer.timelineScheduled')} at={dispatch.createdAt} first />
          <TimelineStep label={t('workOrders.dispatches.drawer.timelineNotified')} at={notifiedAt} />
          <TimelineStep label={t('workOrders.dispatches.drawer.timelineEnRoute')} at={null} />
          <TimelineStep
            label={t('workOrders.dispatches.drawer.timelineArrived')}
            at={dispatch.arrivedAt}
            live={p.live && !dispatch.departedAt}
          />
          <TimelineStep label={t('workOrders.dispatches.drawer.timelineDeparted')} at={dispatch.departedAt} last />
        </Section>

        {/* 4 · Visit notes */}
        {dispatch.notes && (
          <Section title={t('workOrders.dispatches.drawer.notes')}>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-fg">{dispatch.notes}</p>
          </Section>
        )}

        {/* 5 · Captured this visit — derived from the media graph by dispatchId */}
        {media.length > 0 && (
          <Section title={t('workOrders.dispatches.drawer.captured')} count={media.length}>
            <div className="flex flex-wrap gap-1.5">
              {media.map((m) => (
                <MediaThumb key={m.id} m={m} />
              ))}
            </div>
          </Section>
        )}

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
            {notifications.map((log) => (
              <div key={log.id} className="flex items-start gap-2">
                <span className="grid size-[22px] shrink-0 place-items-center rounded bg-bg-active text-[10px] font-bold text-fg-muted">
                  {log.channel.slice(0, 3)}
                </span>
                <div className="min-w-0 grow">
                  <div className="flex items-baseline gap-1.5">
                    <Pill tone={NOTIF_TONE[log.status]} dot>
                      {log.status}
                    </Pill>
                    <span className="truncate text-[10.5px] text-fg-dim">
                      {log.recipientPhone || log.recipientEmail || log.recipientName}
                    </span>
                    <span className="grow" />
                    <span className="whitespace-nowrap text-[10.5px] text-fg-dim">
                      {DATE_TIME.format(new Date(log.sentAt ?? log.createdAt))}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* 7 · State-aware footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-soft bg-bg-elev-2 px-4 py-3">
        {done ? (
          <>
            <span className="text-[11.5px] text-fg-muted">
              {dispatch.departedAt
                ? t('workOrders.dispatches.completedAt', { time: DATE_TIME.format(new Date(dispatch.departedAt)) })
                : t('workOrders.dispatches.status.COMPLETED')}
            </span>
            <span className="grow" />
            {!readOnly && (
              <Button plain onClick={() => onDelete(dispatch)}>
                {t('common.delete')}
              </Button>
            )}
          </>
        ) : (
          !readOnly && (
            <>
              <Button plain onClick={() => onEdit(dispatch)}>
                {t('workOrders.dispatches.drawer.reassign')}
              </Button>
              {!p.live && (
                <Button plain onClick={() => onEdit(dispatch)}>
                  {t('workOrders.dispatches.reschedule')}
                </Button>
              )}
              <span className="grow" />
              {p.live ? (
                <Button color="accent" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('COMPLETED')}>
                  {t('workOrders.dispatches.drawer.completeVisit')}
                </Button>
              ) : (
                <Button color="accent" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('IN_PROGRESS')}>
                  {t('workOrders.dispatches.drawer.markOnSite')}
                </Button>
              )}
            </>
          )
        )}
      </div>
    </>
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

// Vertical timeline row: filled dot + timestamp when reached, hollow + "—"
// when not; violet pulse on the active (live) step.
function TimelineStep({
  label,
  at,
  first,
  last,
  live,
}: {
  label: string;
  at: string | null;
  first?: boolean;
  last?: boolean;
  live?: boolean;
}) {
  const reached = !!at;
  const color = live ? 'var(--violet-500)' : reached ? 'var(--success-500)' : 'var(--border-strong)';
  return (
    <div className="flex items-stretch gap-2.5">
      <div className="flex w-3 shrink-0 flex-col items-center">
        <div className="h-1.5 w-0.5" style={{ background: first ? 'transparent' : reached ? 'var(--success-500)' : 'var(--border)' }} />
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{
            background: reached || live ? color : 'var(--bg-elev)',
            border: `2px solid ${color}`,
            animation: live ? 'pulse 1.8s ease-in-out infinite' : 'none',
          }}
        />
        <div className="w-0.5 flex-1" style={{ background: last ? 'transparent' : reached ? 'var(--success-500)' : 'var(--border)' }} />
      </div>
      <div className="flex grow items-baseline gap-2 pb-2.5 pt-px">
        <span
          className="whitespace-nowrap text-[12.5px]"
          style={{ fontWeight: reached || live ? 600 : 400, color: reached || live ? 'var(--fg-strong)' : 'var(--fg-dim)' }}
        >
          {label}
        </span>
        <span className="grow" />
        <span
          className="whitespace-nowrap font-mono text-[11.5px] tabular-nums"
          style={{ color: live ? 'var(--violet-500)' : reached ? 'var(--fg-muted)' : 'var(--fg-dim)' }}
        >
          {at ? STEP_TS.format(new Date(at)) : '—'}
        </span>
      </div>
    </div>
  );
}

function MediaThumb({ m }: { m: WorkOrderFile }) {
  return (
    <div
      className="relative size-14 shrink-0 overflow-hidden rounded-sm border border-border bg-bg-elev-2"
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
    </div>
  );
}
