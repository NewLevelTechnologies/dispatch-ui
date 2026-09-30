import { useState, type MouseEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ExclamationTriangleIcon } from '@heroicons/react/16/solid';
import {
  agreementApi,
  approvalsApi,
  dispatchBoardApi,
  financialDashboardApi,
  purchaseOrderApi,
  type DispatchBoard,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { Pill } from '../../components/ui/Pill';
import { Callout } from '../../components/ui/Callout';
import { LoadingState } from '../../components/ui/LoadingState';
import ConfirmDialog from '../../components/ConfirmDialog';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { useReleaseParts } from '../../lib/releaseParts';
import { invalidateDispatchBoard } from '../../utils/invalidateRoleConsumers';

type Tone = 'accent' | 'warning' | 'danger' | 'neutral';

interface AttentionRow {
  id: string;
  count: number;
  tone: Tone;
  label: string;
  meta?: string;
  /** Where the whole row goes. Omitted when no page resolves it yet. */
  href?: string;
  action?: ReactNode;
}

interface Props {
  board: DispatchBoard | undefined;
  boardLoading: boolean;
  boardError: boolean;
  today: string;
  regionIds: string[] | undefined;
}

/**
 * What needs me, first. Rows are links to the surface that resolves them, not
 * inline editors; the one inline action is Release N. A row at zero is gone,
 * an empty group is gone, and when every row is gone the card says so rather
 * than vanishing — the owner has to be told the page loaded and there's
 * nothing to do. Rows the user can't act on are hidden, never disabled.
 */
export function NeedsAttentionCard({ board, boardLoading, boardError, today, regionIds }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const releaseParts = useReleaseParts();
  const [confirmRelease, setConfirmRelease] = useState(false);

  const canDispatch = useHasCapability('EDIT_DISPATCHES');
  const canApprove = useHasCapability('APPROVE_WORK_ITEM_TRANSITIONS');
  const canInvoices = useHasCapability('VIEW_ALL_INVOICES');

  // Same key and fetcher as the sidebar bell, so this is a cache hit.
  const approvals = useQuery({
    queryKey: ['approvals', 'bell-summary'],
    queryFn: () => approvalsApi.getBellSummary(),
    enabled: canApprove,
  });
  const unscheduled = useQuery({
    queryKey: ['dispatch-board', 'home-unscheduled', regionIds],
    queryFn: () => dispatchBoardApi.getUnscheduled({ regionIds, size: 1 }).then((p) => p.totalElements),
    enabled: canDispatch,
  });
  const financial = useQuery({
    queryKey: ['financial-dashboard', 'attention'],
    queryFn: () => financialDashboardApi.getAttention(),
    enabled: canInvoices,
  });
  const agreements = useQuery({
    queryKey: ['agreements', 'overview'],
    queryFn: () => agreementApi.getOverview(),
  });
  const poLate = useQuery({
    queryKey: ['purchase-orders', 'overdue-count'],
    queryFn: () => purchaseOrderApi.summary({ overdue: true }).then((s) => s.openCount),
  });

  // The release sends the same scope the board read used, so it sends exactly
  // what `pendingRelease` counted — new, changed and removed alike.
  const release = useMutation({
    mutationFn: () => dispatchBoardApi.release({ date: today, regionIds }),
    onSuccess: (result) => {
      invalidateDispatchBoard(queryClient);
      setConfirmRelease(false);
      // No Undo: once released, the tech has been told.
      showSuccess(
        t('dispatchBoard.release.doneSplit', {
          count: result.released,
          parts: releaseParts(result) || String(result.released),
        }),
      );
    },
    onError: (err) => showError(t('dispatchBoard.release.failed'), extractApiError(err)),
  });

  const plural = (code: string, count: number) => (count === 1 ? getName(code) : getName(code, true));
  const pending = board?.pendingRelease;
  const pendingTotal = pending?.total ?? 0;

  const todayRows: AttentionRow[] = [];
  const weekRows: AttentionRow[] = [];

  if (canDispatch && pendingTotal > 0) {
    todayRows.push({
      id: 'unreleased',
      count: pendingTotal,
      tone: 'accent',
      label: t('dashboard.attention.rows.unreleased', { count: pendingTotal, entity: plural('dispatch', pendingTotal) }),
      meta: releaseParts(pending),
      href: '/dispatch',
      action: (
        <Button color="accent" size="xxs" onClick={() => setConfirmRelease(true)}>
          {t('dispatchBoard.release.action', { count: pendingTotal })}
        </Button>
      ),
    });
  }
  const approvalCount = approvals.data?.pendingForMe ?? 0;
  if (canApprove && approvalCount > 0) {
    todayRows.push({
      id: 'approvals',
      count: approvalCount,
      tone: 'accent',
      label: t('dashboard.attention.rows.approvals', { count: approvalCount }),
      href: '/approvals',
      action: t('dashboard.attention.actions.review'),
    });
  }
  const unscheduledCount = unscheduled.data ?? 0;
  if (canDispatch && unscheduledCount > 0) {
    weekRows.push({
      id: 'unscheduled',
      count: unscheduledCount,
      tone: 'warning',
      label: t('dashboard.attention.rows.unscheduled', {
        count: unscheduledCount,
        entity: plural('work_order', unscheduledCount),
      }),
      href: '/dispatch',
      action: t('dashboard.attention.actions.schedule'),
    });
  }
  const overdue = financial.data?.overdue;
  if (canInvoices && overdue && overdue.count > 0) {
    weekRows.push({
      id: 'overdue',
      count: overdue.count,
      tone: 'danger',
      label: t('dashboard.attention.rows.overdue', { count: overdue.count, entity: plural('invoice', overdue.count) }),
      meta: t('dashboard.attention.rows.overdueMeta', { amount: formatCurrency(overdue.amount) }),
      href: '/invoices?status=overdue',
      action: t('dashboard.attention.actions.view'),
    });
  }
  const unbilled = financial.data?.unbilledWorkOrderCount ?? 0;
  if (canInvoices && unbilled > 0) {
    weekRows.push({
      id: 'unbilled',
      count: unbilled,
      tone: 'warning',
      label: t('dashboard.attention.rows.unbilled', { count: unbilled, entity: plural('work_order', unbilled) }),
      // No list filter for exactly this set yet; completed is the superset.
      href: '/work-orders?status=COMPLETED',
      action: t('dashboard.attention.actions.view'),
    });
  }
  const visits = agreements.data?.visitsDueSoonUnscheduled;
  if (visits && visits.count > 0) {
    weekRows.push({
      id: 'visits',
      count: visits.count,
      tone: 'warning',
      label: t('dashboard.attention.rows.visits', { count: visits.count, entity: getName('agreement') }),
      meta: t('dashboard.attention.rows.visitsMeta', { days: visits.withinDays }),
      // No tenant-wide agreements list to send this to yet.
    });
  }
  const poLateCount = poLate.data ?? 0;
  if (poLateCount > 0) {
    weekRows.push({
      id: 'po-late',
      count: poLateCount,
      tone: 'warning',
      label: t('dashboard.attention.rows.poLate', { count: poLateCount }),
      href: '/purchasing?overdue=true',
      action: t('dashboard.attention.actions.view'),
    });
  }

  const sources = [
    { enabled: canDispatch, loading: boardLoading, error: boardError },
    { enabled: canApprove, loading: approvals.isLoading, error: approvals.isError },
    { enabled: canDispatch, loading: unscheduled.isLoading, error: unscheduled.isError },
    { enabled: canInvoices, loading: financial.isLoading, error: financial.isError },
    { enabled: true, loading: agreements.isLoading, error: agreements.isError },
    { enabled: true, loading: poLate.isLoading, error: poLate.isError },
  ].filter((s) => s.enabled);
  const anyLoading = sources.some((s) => s.loading);
  const anyError = sources.some((s) => s.error);
  const total = [...todayRows, ...weekRows].reduce((sum, r) => sum + r.count, 0);

  const retry = () => {
    void approvals.refetch();
    void unscheduled.refetch();
    void financial.refetch();
    void agreements.refetch();
    void poLate.refetch();
    void queryClient.invalidateQueries({ queryKey: ['dispatch-board', 'home'] });
  };

  let body: ReactNode;
  if (total === 0 && anyLoading) {
    body = <LoadingState />;
  } else if (total === 0 && !anyError) {
    // Explicit, not self-hiding.
    body = (
      <div className="p-3.5">
        <Callout kind="success" title={t('dashboard.attention.quietTitle')}>
          {t('dashboard.attention.quietBody')}
        </Callout>
      </div>
    );
  } else {
    body = (
      <>
        {(todayRows.length > 0 || weekRows.length > 0) && (
          <div className="home-att-grid">
            {todayRows.length > 0 && (
              <AttentionGroup label={t('dashboard.attention.today')} rows={todayRows} onOpen={navigate} />
            )}
            {weekRows.length > 0 && (
              <AttentionGroup label={t('dashboard.attention.thisWeek')} rows={weekRows} onOpen={navigate} />
            )}
          </div>
        )}
        {anyError && (
          <div className="home-card-foot">
            <span className="home-att-meta">{t('dashboard.attention.partialError')}</span>
            <Button plain size="xxs" onClick={retry}>
              {t('common.actions.tryAgain')}
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <Card>
      <CardHead>
        <CardTitle icon={<ExclamationTriangleIcon className="size-3.5" />}>{t('dashboard.attention.title')}</CardTitle>
        {total > 0 && <Pill tone="neutral">{total}</Pill>}
      </CardHead>
      <CardBody flush>{body}</CardBody>

      {/* Releasing texts every one of those technicians and there is no
          un-send, so it asks first — same as the board. */}
      <ConfirmDialog
        isOpen={confirmRelease}
        onClose={() => setConfirmRelease(false)}
        onConfirm={() => release.mutate()}
        title={t('dispatchBoard.release.confirmTitle', { count: pendingTotal })}
        message={t('dashboard.attention.releaseConfirmBody', {
          parts: releaseParts(pending),
          techs: getName('technician', true),
        })}
        confirmLabel={t('dispatchBoard.release.confirmAction')}
        isPending={release.isPending}
      />
    </Card>
  );
}

function AttentionGroup({
  label,
  rows,
  onOpen,
}: {
  label: string;
  rows: AttentionRow[];
  onOpen: (href: string) => void;
}) {
  return (
    <div>
      <div className="home-att-group label-tiny">{label}</div>
      {rows.map((row) => (
        <div
          key={row.id}
          className={`home-att-row${row.href ? ' is-link' : ''}`}
          onClick={row.href ? () => onOpen(row.href!) : undefined}
          data-testid={`attention-${row.id}`}
        >
          <Pill tone={row.tone} className="home-att-count">
            {row.count}
          </Pill>
          <div className="min-w-0">
            <div className="home-att-label">{row.label}</div>
            {row.meta && <div className="home-att-meta">{row.meta}</div>}
          </div>
          {row.action != null &&
            (typeof row.action === 'string' ? (
              // The button is the keyboard/AT target; the row click is a
              // mouse convenience, so the button stops it double-firing.
              <Button outline size="xxs" href={row.href!} onClick={(e: MouseEvent) => e.stopPropagation()}>
                {row.action}
              </Button>
            ) : (
              <div onClick={(e) => e.stopPropagation()}>{row.action}</div>
            ))}
        </div>
      ))}
    </div>
  );
}
