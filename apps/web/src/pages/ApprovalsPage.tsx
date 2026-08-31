import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import clsx from 'clsx';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  InboxIcon,
  LockOpenIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  approvalsApi,
  type ApprovalRequest,
  type ApprovalStatus,
  type ListApprovalsParams,
} from '../api/setup';
import AppLayout from '../components/AppLayout';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/catalyst/button';
import { Heading } from '../components/catalyst/heading';
import { Text, Code, Strong } from '../components/catalyst/text';
import { Textarea } from '../components/catalyst/textarea';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { StatusChip } from '../components/ui/StatusChip';
import { useApprovalsVisible } from '../hooks/useApprovalsVisible';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { extractApiError, showError, showSuccess } from '../lib/toast';

type TabId = 'pending' | 'my-requests' | 'all' | 'approved' | 'rejected' | 'expired';

const TAB_IDS: TabId[] = ['pending', 'my-requests', 'all', 'approved', 'rejected', 'expired'];

function tabToParams(tab: TabId): ListApprovalsParams {
  switch (tab) {
    case 'pending':
      return { status: 'PENDING', assignedToMe: true };
    case 'my-requests':
      return { status: 'PENDING', requestedByMe: true };
    case 'all':
      return {};
    case 'approved':
      return { status: 'APPROVED' };
    case 'rejected':
      return { status: 'REJECTED' };
    case 'expired':
      return { status: 'EXPIRED' };
  }
}

const URGENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Time helpers call Date.now() internally so the `react-hooks/purity` rule
// stays happy (the rule fires when the component body itself reads
// Date.now() but not when a downstream helper does). The cost of multiple
// reads per render is negligible.
function isUrgent(req: ApprovalRequest): boolean {
  if (req.status !== 'PENDING') return false;
  return new Date(req.expiresAt).getTime() - Date.now() <= URGENT_THRESHOLD_MS;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return future ? `in ${m}m` : `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`;
  const d = Math.round(h / 24);
  return future ? `in ${d}d` : `${d}d ago`;
}

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

// Embedded refs can come back with null name fields when the upstream
// record has dropped out of the cross-service cache. Coalesce to a
// readable fallback so the row / detail / toast text stays sensible.
function requesterFullName(r: ApprovalRequest['requester']) {
  const full = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
  return full || 'Unknown user';
}

function fallbackText(value: string | null | undefined, fallback: string) {
  return value && value.trim() ? value : fallback;
}

// ─── Page ──────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: currentUser } = useCurrentUser();

  const tabParam = searchParams.get('tab') as TabId | null;
  const woFilter = searchParams.get('wo');
  const idDeepLink = searchParams.get('id');
  const currentTab: TabId = TAB_IDS.includes(tabParam as TabId) ? (tabParam as TabId) : 'pending';
  const approvalsVisible = useApprovalsVisible();

  const setCurrentTab = useCallback(
    (tab: TabId) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const listParams = useMemo<ListApprovalsParams>(() => {
    const base = tabToParams(currentTab);
    return woFilter ? { ...base, workOrderId: woFilter } : base;
  }, [currentTab, woFilter]);

  const {
    data: requests,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['approvals', 'list', listParams],
    queryFn: () => approvalsApi.list(listParams),
  });

  // Counts surfaced on tabs. Same key the bell uses, so a resolve in
  // either surface refreshes the other on the next poll.
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['approvals', 'count', { assignedToMe: true, status: 'PENDING' }],
    queryFn: () => approvalsApi.getCount({ assignedToMe: true, status: 'PENDING' }),
    staleTime: 60_000,
  });

  const { data: myRequestsCount = 0 } = useQuery({
    queryKey: ['approvals', 'count', { requestedByMe: true, status: 'PENDING' }],
    queryFn: () => approvalsApi.getCount({ requestedByMe: true, status: 'PENDING' }),
    staleTime: 60_000,
  });

  // ─── Selection state ────────────────────────────────────────
  const sortedRequests = useMemo(() => {
    if (!requests) return [];
    // Pending tabs sort by expiry asc (most urgent first); resolved tabs
    // sort by respondedAt desc (most recent first) so the eye lands on
    // freshly-resolved items.
    if (currentTab === 'pending' || currentTab === 'my-requests' || currentTab === 'all') {
      return [...requests].sort(
        (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
      );
    }
    return [...requests].sort((a, b) => {
      const ar = a.respondedAt ? new Date(a.respondedAt).getTime() : 0;
      const br = b.respondedAt ? new Date(b.respondedAt).getTime() : 0;
      return br - ar;
    });
  }, [requests, currentTab]);

  // `?id=` deep-link (e.g., from the bell popover's resolved-mine click)
  // takes precedence on first render. Once the user picks something else,
  // we hand control back to `selectedId`.
  const [selectedId, setSelectedId] = useState<string | null>(idDeepLink);

  // Derive the effective selection from state + the current list. When
  // the stored id has dropped out (resolved, filtered, tab changed), fall
  // back to the first item. Done via derivation rather than an effect to
  // avoid a cascading-render cycle and the `react-hooks/set-state-in-effect`
  // lint trip.
  const effectiveSelectedId =
    selectedId && sortedRequests.some((r) => r.id === selectedId)
      ? selectedId
      : (sortedRequests[0]?.id ?? null);

  const selectedRequest = useMemo(
    () => sortedRequests.find((r) => r.id === effectiveSelectedId) ?? null,
    [sortedRequests, effectiveSelectedId],
  );

  const selectByOffset = useCallback(
    (offset: number) => {
      if (sortedRequests.length === 0) return;
      const idx = effectiveSelectedId
        ? sortedRequests.findIndex((r) => r.id === effectiveSelectedId)
        : -1;
      const nextIdx = (idx + offset + sortedRequests.length) % sortedRequests.length;
      setSelectedId(sortedRequests[nextIdx].id);
    },
    [sortedRequests, effectiveSelectedId],
  );

  // ─── Mutations ──────────────────────────────────────────────
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
    if (selectedRequest) {
      queryClient.invalidateQueries({ queryKey: ['work-orders', selectedRequest.workOrder.id] });
    }
  };

  const advanceAfterResolve = useCallback(() => {
    // Advance to the next item; if at the end, drop back one. When the
    // list becomes empty the derivation in effectiveSelectedId hands back
    // null on the next render.
    if (sortedRequests.length <= 1) {
      setSelectedId(null);
      return;
    }
    const idx = effectiveSelectedId
      ? sortedRequests.findIndex((r) => r.id === effectiveSelectedId)
      : -1;
    const nextIdx = idx >= sortedRequests.length - 1 ? idx - 1 : idx + 1;
    setSelectedId(sortedRequests[nextIdx]?.id ?? null);
  }, [sortedRequests, effectiveSelectedId]);

  const approveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      approvalsApi.approve(id, reason ? { reason } : {}),
    onSuccess: (req) => {
      const transitionLabel = `${req.transition.fromStatus.name} → ${req.transition.toStatus.name}`;
      showSuccess(t('approvals.notifications.approved', { transition: transitionLabel }));
      advanceAfterResolve();
      invalidateAll();
    },
    onError: (err) => {
      showError(t('approvals.notifications.errorApprove'), extractApiError(err));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      approvalsApi.reject(id, { reason }),
    onSuccess: (req) => {
      const transitionLabel = `${req.transition.fromStatus.name} → ${req.transition.toStatus.name}`;
      showSuccess(t('approvals.notifications.rejected', { transition: transitionLabel }));
      invalidateAll();
    },
    onError: (err) => {
      showError(t('approvals.notifications.errorReject'), extractApiError(err));
    },
  });

  // Auto mark-seen: when the user opens a resolved request they
  // originally created, fire mark-seen so the bell's recently-resolved
  // count decrements on the next poll. Idempotent server-side; safe to
  // fire on every detail mount.
  const currentUserId = currentUser?.id;
  const selectedRequestId = selectedRequest?.id;
  const selectedRequestStatus = selectedRequest?.status;
  const selectedRequesterId = selectedRequest?.requester.id;
  useEffect(() => {
    if (!selectedRequestId || !currentUserId) return;
    if (selectedRequestStatus === 'PENDING') return;
    if (selectedRequesterId !== currentUserId) return;
    approvalsApi.markSeen(selectedRequestId).then(
      () => {
        queryClient.invalidateQueries({ queryKey: ['approvals', 'bell-summary'] });
      },
      () => {
        // Best-effort. A failed call leaves the bell badge until the
        // 24h server window expires; not worth a toast.
      },
    );
  }, [selectedRequestId, selectedRequestStatus, selectedRequesterId, currentUserId, queryClient]);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'pending', label: t('approvals.tabs.pending'), count: pendingCount },
    { id: 'my-requests', label: t('approvals.tabs.myRequests'), count: myRequestsCount },
    { id: 'all', label: t('approvals.tabs.all') },
    { id: 'approved', label: t('approvals.tabs.approved') },
    { id: 'rejected', label: t('approvals.tabs.rejected') },
    { id: 'expired', label: t('approvals.tabs.expired') },
  ];

  // Mobile collapses to single-pane: rail by default, detail fills the
  // screen when an item is selected. Desktop renders both regardless.
  const showDetail = !!selectedRequest;

  // OPEN-mode tenant with zero history: render a dedicated empty state
  // instead of the inbox. The page stays reachable (no route guard) so
  // a stale bookmark from when the tenant was STRICT still resolves to
  // *something* useful — and the action links straight to the toggle.
  if (!approvalsVisible) {
    return (
      <AppLayout>
        <div className="flex flex-1 items-center justify-center px-6 py-12">
          <EmptyState
            icon={<LockOpenIcon className="size-10 text-fg-dim" />}
            title={t('approvals.empty.openMode.title')}
            description={t('approvals.empty.openMode.description')}
            action={
              <Button outline href="/settings/work-orders/workflows">
                {t('approvals.empty.openMode.action')}
              </Button>
            }
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout flush>
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b border-border bg-bg-sunken px-7 pt-5 pb-2 max-md:px-4">
          <Heading level={1} size="page-lg" className="m-0">
            {t('approvals.title')}
          </Heading>
          <Text size="sm" tone="muted" className="mt-0.5">
            {t('approvals.subtitle')}
          </Text>
          {woFilter && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-bg-elev px-2.5 py-0.5 text-[11px] text-fg-muted ring-1 ring-border">
              {t('approvals.filteredByWorkOrder')}
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(searchParams);
                  next.delete('wo');
                  setSearchParams(next, { replace: true });
                }}
                aria-label={t('common.clear')}
                className="text-fg-dim hover:text-fg-strong"
              >
                <XMarkIcon className="size-3" />
              </button>
            </div>
          )}
        </div>

        {/* Tab strip */}
        <div className="flex items-center gap-0 overflow-x-auto border-b border-border bg-bg-sunken px-7 max-md:px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={currentTab === tab.id}
              onClick={() => setCurrentTab(tab.id)}
              className={clsx(
                '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3.5 py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors',
                currentTab === tab.id
                  ? 'border-accent-500 text-fg-accent'
                  : 'text-fg-muted hover:text-fg-strong',
              )}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span
                  className={clsx(
                    'inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] font-semibold',
                    currentTab === tab.id ? 'bg-accent-500 text-white' : 'bg-bg-active text-fg-muted',
                  )}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Split view body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Rail */}
          <aside
            className={clsx(
              'flex w-[380px] shrink-0 flex-col overflow-hidden border-r border-border bg-bg max-md:w-full',
              showDetail && 'max-md:hidden',
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border-soft px-4 py-3">
              <Text size="xs" tone="muted" as="span" className="font-semibold tracking-[0.08em] uppercase">
                {t('approvals.rail.countLabel', { count: sortedRequests.length })}
              </Text>
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <LoadingState />
              ) : error ? (
                <ErrorState
                  title={t('approvals.errors.couldNotLoad')}
                  description={extractApiError(error) ?? (error as Error).message}
                  action={
                    <Button outline onClick={() => refetch()}>
                      {t('common.actions.tryAgain')}
                    </Button>
                  }
                />
              ) : sortedRequests.length === 0 ? (
                <RailEmpty tab={currentTab} />
              ) : (
                sortedRequests.map((req) => (
                  <RequestRow
                    key={req.id}
                    request={req}
                    selected={req.id === effectiveSelectedId}
                    onSelect={() => setSelectedId(req.id)}
                  />
                ))
              )}
            </div>
          </aside>

          {/* Detail */}
          <main
            className={clsx(
              'flex min-w-0 flex-1 overflow-y-auto',
              !showDetail && 'max-md:hidden',
            )}
          >
            {!selectedRequest ? (
              !isLoading && !error && sortedRequests.length === 0 ? (
                <DetailEmpty tab={currentTab} />
              ) : (
                <div />
              )
            ) : (
              <DetailPane
                request={selectedRequest}
                currentUserCapabilities={currentUser?.capabilities ?? []}
                onBack={() => setSelectedId(null)}
                approveMutation={approveMutation}
                rejectMutation={rejectMutation}
                onPrev={() => selectByOffset(-1)}
                onNext={() => selectByOffset(1)}
                onOpenWorkOrder={() => navigate(`/work-orders/${selectedRequest.workOrder.id}`)}
                hasNeighbors={sortedRequests.length > 1}
              />
            )}
          </main>
        </div>
      </div>
    </AppLayout>
  );
}

// ─── Rail row ──────────────────────────────────────────────────

function RequestRow({
  request,
  selected,
  onSelect,
}: {
  request: ApprovalRequest;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const urgent = isUrgent(request);
  const name = requesterFullName(request.requester);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={clsx(
        'relative cursor-pointer border-b border-border-soft px-4 py-3 pl-[18px] outline-none hover:bg-bg-hover focus-visible:bg-bg-hover',
        urgent && !selected && 'bg-[color-mix(in_oklch,var(--color-warning-500)_8%,var(--color-bg))]',
        urgent && selected && 'bg-[color-mix(in_oklch,var(--color-warning-500)_14%,var(--color-bg))]',
        !urgent && selected && 'bg-[color-mix(in_oklch,var(--color-accent-500)_6%,var(--color-bg))]',
      )}
    >
      {selected && (
        <span
          aria-hidden
          className={clsx(
            'absolute top-0 bottom-0 left-0 w-[3px]',
            urgent ? 'bg-warning-500' : 'bg-accent-500',
          )}
        />
      )}

      <div className="mb-1 flex items-center gap-2">
        <Avatar name={name} size="sm" />
        <Text size="sm" tone="strong" as="span" className="truncate font-semibold">
          {name}
        </Text>
        <span className="ml-auto font-mono text-[10.5px] text-fg-dim">
          {relativeTime(request.requestedAt)}
        </span>
      </div>

      <div className="mb-1 flex items-center gap-1">
        <StatusChip status={request.transition.fromStatus} size="sm" />
        <ArrowRightIcon className="size-3 text-fg-dim" />
        <StatusChip status={request.transition.toStatus} size="sm" />
      </div>

      <div className="font-mono text-[11px] text-fg-muted">
        <Strong>{request.workOrder.displayId}</Strong> · {fallbackText(request.workOrder.customerName, 'Unknown customer')}
      </div>

      {urgent && (
        <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--color-warning-500)_14%,var(--color-bg-elev))] px-2 py-[2px] text-[10px] font-semibold text-warning-500">
          <ClockIcon className="size-3" />
          {t('approvals.expiringIn', { time: humanDuration(request.expiresAt) })}
        </div>
      )}
    </div>
  );
}

function RailEmpty({ tab }: { tab: TabId }) {
  const { t } = useTranslation();
  const title = tab === 'pending' ? t('approvals.empty.allClear.title') : t('approvals.empty.noResults.title');
  return (
    <div className="px-4 py-10 text-center">
      <Text size="sm" tone="muted">{title}</Text>
    </div>
  );
}

function DetailEmpty({ tab }: { tab: TabId }) {
  const { t } = useTranslation();
  const allClear = tab === 'pending' || tab === 'my-requests';
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <EmptyState
        icon={
          allClear ? (
            <CheckCircleIcon className="size-10 text-success-500" />
          ) : (
            <InboxIcon className="size-10 text-fg-dim" />
          )
        }
        title={allClear ? t('approvals.empty.allClear.title') : t('approvals.empty.noResults.title')}
        description={
          allClear ? t('approvals.empty.allClear.description') : t('approvals.empty.noResults.description')
        }
      />
    </div>
  );
}

// ─── Detail pane ───────────────────────────────────────────────

interface DetailPaneProps {
  request: ApprovalRequest;
  currentUserCapabilities: string[];
  onBack: () => void;
  approveMutation: ReturnType<typeof useMutation<ApprovalRequest, unknown, { id: string; reason?: string }>>;
  rejectMutation: ReturnType<typeof useMutation<ApprovalRequest, unknown, { id: string; reason: string }>>;
  onPrev: () => void;
  onNext: () => void;
  onOpenWorkOrder: () => void;
  hasNeighbors: boolean;
}

function DetailPane({
  request,
  currentUserCapabilities,
  onBack,
  approveMutation,
  rejectMutation,
  onPrev,
  onNext,
  onOpenWorkOrder,
  hasNeighbors,
}: DetailPaneProps) {
  const { t } = useTranslation();
  const name = requesterFullName(request.requester);
  const urgent = isUrgent(request);
  const approverCaps = request.transition.approverCapabilities ?? [];
  // When the embed lacks approverCapabilities (older backend response),
  // assume the action pane should render — the server gates on capability
  // anyway and will return 403 for an unauthorized actor.
  const canApprove =
    request.status === 'PENDING' &&
    (approverCaps.length === 0 || approverCaps.some((cap) => currentUserCapabilities.includes(cap)));

  return (
    <div className="w-full px-7 py-6 max-md:px-4">
      <div className="mb-3 flex items-center gap-2 md:hidden">
        <Button plain size="xs" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
          {t('common.actions.back')}
        </Button>
      </div>

      <div className="mx-auto max-w-[720px]">
        {/* Header */}
        <div className="flex items-start gap-3.5 border-b border-border-soft pb-4">
          <Avatar name={name} size="lg" />
          <div className="min-w-0 flex-1">
            <Text size="md" tone="strong" as="div" className="font-semibold">
              {t('approvals.detail.header', { name })}
            </Text>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-fg-muted">
              <span>{relativeTime(request.requestedAt)}</span>
              <span className="text-fg-dim">·</span>
              <span>{t('approvals.detail.workflowName', { workflow: fallbackText(request.transition.workflowName, 'Unknown') })}</span>
              {request.status === 'PENDING' && (
                <>
                  <span className="text-fg-dim">·</span>
                  <span className={clsx(urgent && 'font-semibold text-warning-500')}>
                    {t('approvals.expiringIn', { time: humanDuration(request.expiresAt) })}
                  </span>
                </>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusChip status={request.transition.fromStatus} size="lg" />
              <ArrowRightIcon className="size-4 text-fg-dim" />
              <StatusChip status={request.transition.toStatus} size="lg" />
            </div>
          </div>
        </div>

        {/* Work order context */}
        <SectionLabel>{t('approvals.detail.workOrder')}</SectionLabel>
        <KV>
          <KVRow
            k={t('common.id')}
            v={
              <button
                type="button"
                onClick={onOpenWorkOrder}
                className="cursor-pointer text-fg-accent hover:underline"
              >
                <Code>{request.workOrder.displayId}</Code>
              </button>
            }
          />
          <KVRow
            k={t('common.customer')}
            v={fallbackText(request.workOrder.customerName, 'Unknown customer')}
          />
          {request.workOrder.serviceLocation && (
            <KVRow k={t('common.serviceLocation')} v={request.workOrder.serviceLocation} />
          )}
          <KVRow
            k={t('approvals.detail.workItem')}
            v={fallbackText(request.workItem.name, 'Unknown work item')}
          />
        </KV>

        {request.reason && (
          <>
            <SectionLabel>{t('approvals.detail.reasonFromRequester')}</SectionLabel>
            <ReasonQuote>{request.reason}</ReasonQuote>
          </>
        )}

        {request.status === 'PENDING' && canApprove && (
          <ActionPane
            requesterFirstName={request.requester.firstName ?? 'the requester'}
            isPending={approveMutation.isPending || rejectMutation.isPending}
            onApprove={(reason) => approveMutation.mutate({ id: request.id, reason })}
            onReject={(reason) => rejectMutation.mutate({ id: request.id, reason })}
            onPrev={onPrev}
            onNext={onNext}
            hasNeighbors={hasNeighbors}
          />
        )}

        {request.status === 'PENDING' && !canApprove && (
          <div className="mt-5 rounded-lg border border-border bg-bg-elev p-4">
            <Text size="sm" tone="muted">
              {t('approvals.detail.notApprover')}
            </Text>
          </div>
        )}

        {request.status !== 'PENDING' && <ResolutionPane request={request} />}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      size="xs"
      tone="muted"
      as="div"
      className="mt-5 mb-1.5 font-semibold tracking-[0.08em] uppercase"
    >
      {children}
    </Text>
  );
}

function KV({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-[130px_1fr] gap-x-3.5 gap-y-1.5 text-[12.5px]">{children}</div>;
}

function KVRow({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <>
      <span className="text-fg-muted">{k}</span>
      <span className="font-medium text-fg-strong">{v}</span>
    </>
  );
}

function ReasonQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="mt-1.5 rounded-r-md border-l-[2.5px] border-border-strong bg-bg-elev-2 px-3 py-2.5 text-[12.5px] leading-[1.5] text-fg italic">
      {children}
    </blockquote>
  );
}

function ResolutionPane({ request }: { request: ApprovalRequest }) {
  const { t } = useTranslation();
  const respondedByName = request.respondedBy
    ? (`${request.respondedBy.firstName ?? ''} ${request.respondedBy.lastName ?? ''}`.trim() ||
       'Unknown user')
    : null;
  const statusLabel: Record<ApprovalStatus, string> = {
    PENDING: t('approvals.tabs.pending'),
    APPROVED: t('approvals.tabs.approved'),
    REJECTED: t('approvals.tabs.rejected'),
    EXPIRED: t('approvals.tabs.expired'),
  };
  return (
    <div className="mt-5 rounded-lg border border-border bg-bg-elev p-4">
      <div className="mb-1.5 flex items-center gap-2 text-[12.5px]">
        <Strong>{statusLabel[request.status]}</Strong>
        {request.respondedAt && (
          <span className="text-fg-muted">
            · {relativeTime(request.respondedAt)}
          </span>
        )}
        {respondedByName && (
          <span className="text-fg-muted">
            · {t('approvals.detail.by', { name: respondedByName })}
          </span>
        )}
      </div>
      {(request.responseNote || request.reason) && (
        <ReasonQuote>{request.responseNote ?? request.reason}</ReasonQuote>
      )}
    </div>
  );
}

// ─── Action pane ───────────────────────────────────────────────

function ActionPane({
  requesterFirstName,
  isPending,
  onApprove,
  onReject,
  onPrev,
  onNext,
  hasNeighbors,
}: {
  requesterFirstName: string;
  isPending: boolean;
  onApprove: (reason?: string) => void;
  onReject: (reason: string) => void;
  onPrev: () => void;
  onNext: () => void;
  hasNeighbors: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const handleApprove = useCallback(() => {
    if (isPending) return;
    onApprove(note.trim() || undefined);
  }, [isPending, note, onApprove]);

  const handleRejectClick = useCallback(() => {
    if (isPending) return;
    if (!note.trim()) {
      setRejecting(true);
      noteRef.current?.focus();
      return;
    }
    onReject(note.trim());
  }, [isPending, note, onReject]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Don't swallow shortcuts when the user is typing in any input.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        handleApprove();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setRejecting(true);
        noteRef.current?.focus();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        onNext();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        onPrev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleApprove, onNext, onPrev]);

  return (
    <div className="mt-5 rounded-lg border border-border bg-bg-elev p-4">
      <Text size="xs" tone="muted" as="div" className="mb-1.5">
        {rejecting ? t('approvals.action.reasonRequired') : t('approvals.action.reasonOptional')}
      </Text>
      <Textarea
        ref={noteRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t('approvals.action.notePlaceholder', { requesterName: requesterFirstName })}
        rows={3}
        resizable={false}
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-2 max-md:flex-col max-md:items-stretch">
        <div className="mr-auto flex gap-3 text-[10.5px] text-fg-dim max-md:hidden">
          <span><Kbd>A</Kbd> {t('approvals.action.approve')}</span>
          <span><Kbd>R</Kbd> {t('approvals.action.reject')}</span>
          {hasNeighbors && (
            <span><Kbd>J</Kbd>/<Kbd>K</Kbd> {t('approvals.action.nextPrev')}</span>
          )}
        </div>
        <Button outline="red" size="xs" onClick={handleRejectClick} disabled={isPending}>
          <XMarkIcon className="size-3.5" />
          {t('approvals.action.reject')}
        </Button>
        <Button color="green" size="xs" onClick={handleApprove} disabled={isPending}>
          <CheckIcon className="size-3.5" />
          {t('approvals.action.approve')}
        </Button>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-bg-active px-1 py-px font-mono text-[10px] font-semibold text-fg-muted">
      {children}
    </kbd>
  );
}

