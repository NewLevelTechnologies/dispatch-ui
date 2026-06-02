import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
  notificationApi,
  type NotificationLogDto,
  type NotificationStatus,
} from '../api/notificationApi';
import {
  userApi,
  type Dispatch,
  type DispatchStatus,
  type User,
} from '../api';
import { Badge } from './catalyst/badge';
import { Button } from './catalyst/button';
import { SlideOver } from './catalyst/slideover';

const STATUS_BADGE: Record<DispatchStatus, 'sky' | 'blue' | 'lime' | 'zinc' | 'amber'> = {
  SCHEDULED: 'sky',
  IN_PROGRESS: 'blue',
  COMPLETED: 'lime',
  CANCELLED: 'zinc',
  NO_SHOW: 'amber',
};

const NOTIF_BADGE: Record<NotificationStatus, 'lime' | 'sky' | 'zinc' | 'rose'> = {
  DELIVERED: 'lime',
  SENT: 'sky',
  PENDING: 'zinc',
  BOUNCED: 'rose',
  FAILED: 'rose',
};

const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const TIME_ONLY = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

function formatWindow(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  if (sameDay) {
    return `${DATE_ONLY.format(start)} · ${TIME_ONLY.format(start)} – ${TIME_ONLY.format(end)}`;
  }
  return `${DATE_TIME.format(start)} – ${DATE_TIME.format(end)}`;
}

interface Props {
  /** When non-null, the drawer is open and shows this dispatch. Null closes
   *  the drawer (parent owns the open/closed state, matches the established
   *  EquipmentQuickViewDrawer pattern). */
  dispatch: Dispatch | null;
  readOnly?: boolean;
  onClose: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onDelete: (dispatch: Dispatch) => void;
}

/**
 * Right-edge slide-over (~480px) that surfaces the full lifecycle of a single
 * dispatch — tech contact, arrival window + arrived/departed audit, the
 * notification_logs trail for the row, free-text notes, and the same
 * Edit/Delete actions that live in the row kebab. The killer use case is
 * billing disputes / multi-visit context: "when exactly was Jason here?" is
 * tedious to reconstruct from the activity stream's chronological event log;
 * this surface answers it in one read.
 */
export default function DispatchDetailDrawer({
  dispatch,
  readOnly = false,
  onClose,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const open = dispatch !== null;

  return (
    <SlideOver open={open} onClose={onClose} className="!max-w-[480px]">
      {dispatch && (
        <DispatchDetailContent
          dispatch={dispatch}
          readOnly={readOnly}
          onClose={onClose}
          onEdit={onEdit}
          onDelete={onDelete}
          t={t}
        />
      )}
    </SlideOver>
  );
}

interface ContentProps {
  dispatch: Dispatch;
  readOnly: boolean;
  onClose: () => void;
  onEdit: (dispatch: Dispatch) => void;
  onDelete: (dispatch: Dispatch) => void;
  t: ReturnType<typeof useTranslation>['t'];
}

function DispatchDetailContent({
  dispatch,
  readOnly,
  onClose,
  onEdit,
  onDelete,
  t,
}: ContentProps) {
  // React Query dedupes against DispatchesSection's identical key, so the
  // user list is already cached in the common case (drawer opens from a row).
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.getAll(),
  });
  const tech: User | undefined = users.find(
    (u) => u.id === dispatch.assignedUserId
  );

  const { data: notifPage, isLoading: notifLoading, isError: notifError } =
    useQuery({
      queryKey: [
        'notification-logs',
        { entityType: 'DISPATCH', entityId: dispatch.id },
      ],
      queryFn: () =>
        notificationApi.getNotificationLogs({
          entityType: 'DISPATCH',
          entityId: dispatch.id,
          // Reasonable cap — a single dispatch rarely accumulates >5 sends.
          size: 25,
          sort: 'createdAt,desc',
        }),
    });
  const notifications: NotificationLogDto[] = notifPage?.content ?? [];

  const techName = tech
    ? `${tech.firstName} ${tech.lastName}`.trim() || tech.email
    : '—';

  const [copied, setCopied] = useState(false);
  const handleCopyPhone = async () => {
    if (!tech?.phoneNumber) return;
    try {
      await navigator.clipboard.writeText(tech.phoneNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard API unavailable — silently no-op rather than alert */
    }
  };

  return (
    <>
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-950 dark:text-white">
            {techName}
          </h2>
          <Badge color={STATUS_BADGE[dispatch.status]}>
            {t(`workOrders.dispatches.status.${dispatch.status}`)}
          </Badge>
        </div>
        <Button plain onClick={onClose} aria-label={t('common.close')}>
          <XMarkIcon className="size-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Contact — phone click-to-copy on desktop (CSRs use a separate
            softphone; tel: would no-op). Email opens the OS mail client. */}
        {tech && (tech.phoneNumber || tech.email) && (
          <Section title={t('workOrders.dispatches.drawer.contact')}>
            {tech.phoneNumber && (
              <button
                type="button"
                onClick={handleCopyPhone}
                className="block text-left text-sm text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
                title={t('workOrders.dispatches.drawer.copyPhone')}
              >
                {copied
                  ? `${t('workOrders.dispatches.drawer.copied')} `
                  : ''}
                {tech.phoneNumber}
              </button>
            )}
            {tech.email && (
              <a
                href={`mailto:${tech.email}`}
                className="block text-sm text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
              >
                {tech.email}
              </a>
            )}
          </Section>
        )}

        {/* Lifecycle — answers "when was this scheduled / when did the tech
            actually arrive / when did they leave". Missing legs render as
            em-dashes; the audit trail tells the story even when incomplete. */}
        <Section title={t('workOrders.dispatches.drawer.lifecycle')}>
          <Row
            label={t('workOrders.dispatches.drawer.lifecycleWindow')}
            value={formatWindow(
              dispatch.arrivalWindowStart,
              dispatch.arrivalWindowEnd
            )}
          />
          <Row
            label={t('workOrders.dispatches.drawer.lifecycleArrived')}
            value={
              dispatch.arrivedAt
                ? DATE_TIME.format(new Date(dispatch.arrivedAt))
                : '—'
            }
          />
          <Row
            label={t('workOrders.dispatches.drawer.lifecycleDeparted')}
            value={
              dispatch.departedAt
                ? DATE_TIME.format(new Date(dispatch.departedAt))
                : '—'
            }
          />
          <Row
            label={t('workOrders.dispatches.drawer.lifecycleCreated')}
            value={DATE_TIME.format(new Date(dispatch.createdAt))}
          />
        </Section>

        {/* Notification audit — backed by notification_logs. Idempotent retries
            stack here; one row per send. Channel + status + sentAt are the
            facts a dispatcher / billing dispute needs. */}
        <Section title={t('workOrders.dispatches.drawer.notifications')}>
          {notifLoading && (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('workOrders.dispatches.drawer.notificationsLoading')}
            </div>
          )}
          {notifError && (
            <div className="text-sm text-rose-600 dark:text-rose-400">
              {t('workOrders.dispatches.drawer.notificationsError')}
            </div>
          )}
          {!notifLoading && !notifError && notifications.length === 0 && (
            <div className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('workOrders.dispatches.drawer.notificationsEmpty')}
            </div>
          )}
          {notifications.map((log) => (
            <div
              key={log.id}
              className="flex items-start justify-between gap-3 border-b border-zinc-100 py-1.5 last:border-0 dark:border-zinc-800"
            >
              <div className="min-w-0 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    {log.channel}
                  </span>
                  <Badge color={NOTIF_BADGE[log.status]}>{log.status}</Badge>
                </div>
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {log.recipientPhone || log.recipientEmail || log.recipientName}
                </div>
              </div>
              <div className="shrink-0 text-right text-xs text-zinc-500 dark:text-zinc-400">
                {DATE_TIME.format(new Date(log.sentAt ?? log.createdAt))}
              </div>
            </div>
          ))}
        </Section>

        {dispatch.notes && (
          <Section title={t('workOrders.dispatches.drawer.notes')}>
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {dispatch.notes}
            </p>
          </Section>
        )}
      </div>

      {!readOnly && (
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <Button plain onClick={() => onDelete(dispatch)}>
            {t('common.delete')}
          </Button>
          <Button onClick={() => onEdit(dispatch)}>
            {t('common.edit')}
          </Button>
        </div>
      )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right text-zinc-800 dark:text-zinc-200">{value}</span>
    </div>
  );
}
