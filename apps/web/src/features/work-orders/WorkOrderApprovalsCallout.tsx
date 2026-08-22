import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  ArrowRightIcon,
  CheckIcon,
  LockClosedIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { approvalsApi, type ApprovalRequest } from '../../api/setup';
import { Button } from '../../components/catalyst/button';
import { Textarea } from '../../components/catalyst/textarea';
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '../../components/catalyst/alert';
import { Callout } from '../../components/ui/Callout';
import { StatusChip } from '../../components/ui/StatusChip';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { extractApiError, showError, showSuccess } from '../../lib/toast';

const URGENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

function humanDuration(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'now';
  const m = Math.round(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function isUrgentExpiry(iso: string): boolean {
  return new Date(iso).getTime() - Date.now() <= URGENT_THRESHOLD_MS;
}

interface Props {
  workOrderId: string;
}

// Self-contained chunk. The WO detail page redesign is queued; when it lands
// this component re-slots into the new layout with no internal changes.
export default function WorkOrderApprovalsCallout({ workOrderId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: currentUser } = useCurrentUser();
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const { data: pendingForWO } = useQuery({
    queryKey: ['approvals', 'for-wo', workOrderId],
    queryFn: () => approvalsApi.list({ workOrderId, status: 'PENDING' }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders', workOrderId] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (req) => {
      const label = `${req.transition.fromStatus.name} → ${req.transition.toStatus.name}`;
      showSuccess(t('approvals.notifications.approved', { transition: label }));
      invalidate();
    },
    onError: (err) => showError(t('approvals.notifications.errorApprove'), extractApiError(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      approvalsApi.reject(id, { reason }),
    onSuccess: (req) => {
      const label = `${req.transition.fromStatus.name} → ${req.transition.toStatus.name}`;
      showSuccess(t('approvals.notifications.rejected', { transition: label }));
      setRejectTarget(null);
      setRejectReason('');
      invalidate();
    },
    onError: (err) => showError(t('approvals.notifications.errorReject'), extractApiError(err)),
  });

  if (!pendingForWO || pendingForWO.length === 0) return null;

  const primary = pendingForWO[0];
  const additionalCount = pendingForWO.length - 1;
  const urgent = isUrgentExpiry(primary.expiresAt);
  const approverCaps = primary.transition.approverCapabilities ?? [];
  const userCaps = currentUser?.capabilities ?? [];
  // If the embed lacks approverCapabilities (older backend), default to
  // hiding the inline action to err on the side of not letting an
  // unauthorized user trigger a 403. Power users can still use the queue.
  const canApprove =
    approverCaps.length > 0 && approverCaps.some((cap) => userCaps.includes(cap));

  const requesterName =
    `${primary.requester.firstName ?? ''} ${primary.requester.lastName ?? ''}`.trim() ||
    'Unknown user';
  const requesterFirstNameForPlaceholder = primary.requester.firstName ?? 'the requester';

  return (
    <>
      <Callout
        kind={canApprove ? 'warning' : 'info'}
        icon={<LockClosedIcon className="size-[18px]" />}
        action={
          canApprove ? (
            <div className="flex gap-1.5">
              <Button
                outline="red"
                size="xs"
                disabled={approveMutation.isPending}
                onClick={() => {
                  setRejectTarget(primary);
                  setRejectReason('');
                }}
              >
                <XMarkIcon className="size-3.5" />
                {t('approvals.action.reject')}
              </Button>
              <Button
                color="green"
                size="xs"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate(primary.id)}
              >
                <CheckIcon className="size-3.5" />
                {t('approvals.action.approve')}
              </Button>
            </div>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold text-fg-strong">
          <span>{t('approvals.callout.title')}</span>
          <span className="font-normal text-fg-muted">·</span>
          <StatusChip status={primary.transition.fromStatus} size="sm" />
          <ArrowRightIcon className="size-3 text-fg-dim" />
          <StatusChip status={primary.transition.toStatus} size="sm" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-fg-muted">
          <span>
            {t('approvals.callout.requestedBy', {
              name: requesterName,
              time: relativeTime(primary.requestedAt),
            })}
          </span>
          <span className="text-fg-dim">·</span>
          <span className={urgent ? 'font-semibold text-warning-500' : ''}>
            {t('approvals.expiringIn', { time: humanDuration(primary.expiresAt) })}
          </span>
          {(canApprove || additionalCount > 0) && (
            <>
              <span className="text-fg-dim">·</span>
              <Link
                to={`/approvals?tab=pending&wo=${workOrderId}`}
                className="text-fg-accent hover:underline"
              >
                {additionalCount > 0
                  ? t('approvals.callout.viewAllInQueue', { count: additionalCount + 1 })
                  : t('approvals.callout.viewInQueue')}
              </Link>
            </>
          )}
        </div>
      </Callout>

      <Alert
        open={rejectTarget !== null}
        onClose={() => {
          if (rejectMutation.isPending) return;
          setRejectTarget(null);
          setRejectReason('');
        }}
      >
        <AlertTitle>{t('approvals.callout.rejectTitle')}</AlertTitle>
        <AlertDescription>{t('approvals.callout.rejectMessage')}</AlertDescription>
        <AlertBody>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            autoFocus
            placeholder={t('approvals.action.notePlaceholder', {
              requesterName: requesterFirstNameForPlaceholder,
            })}
            resizable={false}
          />
        </AlertBody>
        <AlertActions>
          <Button
            plain
            onClick={() => {
              setRejectTarget(null);
              setRejectReason('');
            }}
            disabled={rejectMutation.isPending}
          >
            {t('common.cancel')}
          </Button>
          <Button
            color="red"
            onClick={() => {
              if (!rejectTarget || !rejectReason.trim()) return;
              rejectMutation.mutate({ id: rejectTarget.id, reason: rejectReason.trim() });
            }}
            disabled={!rejectReason.trim() || rejectMutation.isPending}
          >
            {t('approvals.action.reject')}
          </Button>
        </AlertActions>
      </Alert>
    </>
  );
}
