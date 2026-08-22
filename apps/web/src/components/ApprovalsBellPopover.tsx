// ─────────────────────────────────────────────────────────────────
// ApprovalsBellPopover.tsx — desktop bell popover for the approvals
// inbox. Replaces the topbar bell's old "navigate to /approvals"
// behavior on `>= 768px` viewports. Peek-and-resume: click bell,
// inline-resolve a request or two, dismiss back to wherever you were.
//
// The full inbox at `/approvals` still owns the bulk-clearing flow —
// the popover is the lightweight surface, the inbox is the heavy one.
//
// Mobile keeps the original Link-to-page behavior; the popover is a
// desktop affordance. See AppLayout for the breakpoint switch.
// ─────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import clsx from 'clsx';
import {
  ArrowRightIcon,
  BellIcon,
  CheckCircleIcon,
  CheckIcon,
  Cog6ToothIcon,
  LockClosedIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  approvalsApi,
  type ApprovalRequest,
  type ApprovalsBellSummary,
} from '../api/setup';
import { Avatar } from './ui/Avatar';
import { Button } from './catalyst/button';
import { Textarea } from './catalyst/textarea';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { roleAccent } from '../utils/roleColor';

type BellTab = 'forMe' | 'mine';

const URGENT_THRESHOLD_MS = 24 * 60 * 60 * 1000;

// Helpers — same shape as ApprovalsPage so the popover stays visually
// consistent with the full inbox. Pulled inline to keep the popover
// truly self-contained (no shared module to drift against the inbox).

function isUrgent(req: ApprovalRequest): boolean {
  if (req.status !== 'PENDING') return false;
  return new Date(req.expiresAt).getTime() - Date.now() <= URGENT_THRESHOLD_MS;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const m = Math.round(abs / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return future ? `in ${m}m` : `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h`;
  const d = Math.round(h / 24);
  return future ? `in ${d}d` : `${d}d`;
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

function requesterFullName(r: ApprovalRequest['requester']): string {
  const full = `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim();
  return full || 'Unknown user';
}

function fallbackText(value: string | null | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback;
}

// Filter resolved-mine requests to the same 24h window the server uses
// for `recentlyResolvedMine`. Defined outside the component so the
// `react-hooks/purity` rule doesn't flag the Date.now() read inside
// useMemo (helpers reading Date.now() are fine).
function pickRecentlyResolved(items: ApprovalRequest[], cap: number): ApprovalRequest[] {
  if (cap === 0) return [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return items
    .filter((r) => r.respondedAt && new Date(r.respondedAt).getTime() >= cutoff)
    .sort((a, b) => {
      const ar = a.respondedAt ? new Date(a.respondedAt).getTime() : 0;
      const br = b.respondedAt ? new Date(b.respondedAt).getTime() : 0;
      return br - ar;
    })
    .slice(0, cap);
}

// ─── Public component ──────────────────────────────────────────

interface Props {
  /** Bell badge — sum of pendingForMe + recentlyResolvedMine. Polled
   *  by AppLayout via the bell-summary query. */
  badgeCount: number;
}

export default function ApprovalsBellPopover({ badgeCount }: Props) {
  const { t } = useTranslation();

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <PopoverButton
            aria-label={t('approvals.nav.bellAria', { count: badgeCount })}
            className={clsx(
              'relative grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
              open && 'bg-bg-active text-fg-strong',
            )}
          >
            <BellIcon className="size-[18px]" />
            {badgeCount > 0 && (
              <span
                aria-hidden
                className="absolute -top-px -right-px inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-2 border-bg bg-accent-500 px-[3px] font-mono text-[9.5px] font-bold leading-none text-white"
              >
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}
          </PopoverButton>

          {/* Visual scrim — pointer-events:none so it doesn't intercept
              clicks. Headless Popover handles click-outside dismissal on
              its own; this is purely a focus cue. */}
          {open && (
            <div
              aria-hidden
              className="pointer-events-none fixed inset-0 z-30 bg-[rgba(20,20,30,0.06)]"
            />
          )}

          <PopoverPanel
            anchor={{ to: 'bottom end', gap: 8 }}
            className={clsx(
              // Panel — sized to the design spec. `!max-h-[560px]` because
              // Headless Popover sets its own max-height inline via
              // floating-ui; the tighter cap we want has to override.
              'z-50 flex w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-bg-elev !max-h-[560px] shadow-2xl outline-none',
              // Caret pointing up at the bell — top-right corner, 26px
              // from the right matches the bell's offset in the topbar.
              "before:absolute before:-top-[6px] before:right-[26px] before:size-[11px] before:rotate-45 before:border-t before:border-l before:border-border before:bg-bg-elev before:content-['']",
            )}
          >
            <PopoverContent onDismiss={close} />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

// ─── Inner content (mounted only while the popover is open) ────

function PopoverContent({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<BellTab>('forMe');
  // null = no explicit pick (auto-expand first row).
  // 'collapsed' = user collapsed deliberately; leave nothing expanded.
  // string = explicit pick.
  const [expansion, setExpansion] = useState<string | null | 'collapsed'>(null);

  const listParams = useMemo(
    () =>
      tab === 'forMe'
        ? { status: 'PENDING' as const, assignedToMe: true }
        : { status: 'PENDING' as const, requestedByMe: true },
    [tab],
  );

  // Same query keys the AppLayout badge polls, so a resolve here also
  // refreshes the bell count automatically (and the full inbox if it's
  // open in another tab).
  const listKey = useMemo(
    () => ['approvals', 'list', listParams] as const,
    [listParams],
  );

  const {
    data: requests = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: listKey,
    queryFn: () => approvalsApi.list(listParams),
  });

  // Mine tab: also surface requester-side resolutions from the last 24h
  // that haven't been marked seen yet. Subscribes to the bell summary
  // cache that AppLayout already polls — no duplicate request.
  const { data: summary } = useQuery<ApprovalsBellSummary>({
    queryKey: ['approvals', 'bell-summary'],
    queryFn: () => approvalsApi.getBellSummary(),
  });

  const resolvedMineKey = useMemo(
    () =>
      [
        'approvals',
        'list',
        { requestedByMe: true, status: ['APPROVED', 'REJECTED', 'EXPIRED'] as const },
      ] as const,
    [],
  );
  const { data: resolvedMine = [] } = useQuery({
    queryKey: resolvedMineKey,
    queryFn: () =>
      approvalsApi.list({
        requestedByMe: true,
        status: ['APPROVED', 'REJECTED', 'EXPIRED'],
      }),
    enabled: tab === 'mine' && (summary?.recentlyResolvedMine ?? 0) > 0,
  });

  // Trust the server's count as the cap. We don't have an id list, so
  // pick the N most-recent within-24h resolved-mine items — same window
  // the server filters on. If the FE has stale list data the section
  // may render slightly old items, but the count itself is authoritative
  // and decrements after mark-seen.
  const recentlyResolvedItems = useMemo<ApprovalRequest[]>(
    () => (tab === 'mine' ? pickRecentlyResolved(resolvedMine, summary?.recentlyResolvedMine ?? 0) : []),
    [tab, summary?.recentlyResolvedMine, resolvedMine],
  );

  // Sort by expiry asc — most urgent first — mirroring the inbox's
  // pending sort order. The resolved section is rendered separately
  // above the pending rows on Mine tab.
  const sortedRequests = useMemo(
    () =>
      [...requests].sort(
        (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime(),
      ),
    [requests],
  );

  // Effective expanded id — derivation rather than effect.
  // - If user explicitly collapsed: nothing expanded.
  // - If a valid pick exists in the current list: use it.
  // - Otherwise auto-expand the first row.
  const expandedId =
    expansion === 'collapsed'
      ? null
      : typeof expansion === 'string' && sortedRequests.some((r) => r.id === expansion)
        ? expansion
        : (sortedRequests[0]?.id ?? null);

  const handleTabChange = useCallback((next: BellTab) => {
    setTab(next);
    setExpansion(null); // reset to auto-expand-first on the new tab
  }, []);

  const handleToggle = useCallback(
    (id: string) => {
      setExpansion(expandedId === id ? 'collapsed' : id);
    },
    [expandedId],
  );

  const handleResolved = useCallback(
    (resolvedId: string) => {
      // Optimistically drop the row so the popover updates instantly.
      // The invalidate that follows reconciles against server truth.
      queryClient.setQueryData<ApprovalRequest[]>([...listKey], (old) =>
        old ? old.filter((r) => r.id !== resolvedId) : old,
      );

      // Auto-advance: pick the next row in current sort order.
      const idx = sortedRequests.findIndex((r) => r.id === resolvedId);
      const next = sortedRequests[idx + 1] ?? sortedRequests[idx - 1] ?? null;
      setExpansion(next?.id ?? null);

      queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    [queryClient, listKey, sortedRequests],
  );

  const markSeenMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.markSeen(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approvals', 'bell-summary'] });
    },
    // Best-effort: a failed mark-seen still navigates and lets the
    // inbox's detail-mount mark-seen retry. No toast on error.
  });

  const handleResolvedClick = useCallback(
    (id: string) => {
      markSeenMutation.mutate(id);
      onDismiss();
      navigate(`/approvals?tab=all&id=${id}`);
    },
    [markSeenMutation, onDismiss, navigate],
  );

  const headerPillCount =
    tab === 'forMe'
      ? sortedRequests.length
      : sortedRequests.length + recentlyResolvedItems.length;

  // Mine tab is "empty" only when BOTH pending-mine and the resolved
  // section are empty — otherwise we show what we have.
  const showEmpty =
    !isLoading &&
    !error &&
    sortedRequests.length === 0 &&
    recentlyResolvedItems.length === 0;

  return (
    <>
      <Header tab={tab} setTab={handleTabChange} count={headerPillCount} />

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <ListLoading />
        ) : error ? (
          <ListError />
        ) : showEmpty ? (
          <EmptyAllClear />
        ) : (
          <>
            {tab === 'mine' && recentlyResolvedItems.length > 0 && (
              <>
                <div className="px-3.5 pt-2 pb-1 text-[10px] font-semibold tracking-[0.08em] text-fg-muted uppercase">
                  {t('approvals.bell.recentlyResolved')}
                </div>
                {recentlyResolvedItems.map((req) => (
                  <ResolvedRow
                    key={req.id}
                    request={req}
                    onClick={() => handleResolvedClick(req.id)}
                  />
                ))}
              </>
            )}
            {sortedRequests.map((req) => (
              <RequestRow
                key={req.id}
                request={req}
                expanded={req.id === expandedId}
                onToggle={() => handleToggle(req.id)}
                onResolved={() => handleResolved(req.id)}
              />
            ))}
          </>
        )}
      </div>

      <Footer tab={tab} onDismiss={onDismiss} />
    </>
  );
}

// ─── Header ────────────────────────────────────────────────────

function Header({
  tab,
  setTab,
  count,
}: {
  tab: BellTab;
  setTab: (t: BellTab) => void;
  count: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-soft px-3.5 pt-3 pb-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-fg-strong">
        {t('approvals.bell.title')}
        <span className="rounded-full bg-bg-active px-1.5 py-[1px] font-mono text-[10px] font-semibold text-fg-muted">
          {t('approvals.bell.countPill', { count })}
        </span>
      </div>
      <div className="flex gap-0.5">
        <TabButton active={tab === 'forMe'} onClick={() => setTab('forMe')}>
          {t('approvals.bell.tabs.forMe')}
        </TabButton>
        <TabButton active={tab === 'mine'} onClick={() => setTab('mine')}>
          {t('approvals.bell.tabs.mine')}
        </TabButton>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'cursor-pointer rounded-[5px] px-2 py-[3px] text-[11px] font-medium transition-colors',
        active
          ? 'bg-bg-active font-semibold text-fg-strong'
          : 'text-fg-muted hover:bg-bg-hover hover:text-fg-strong',
      )}
    >
      {children}
    </button>
  );
}

// ─── Row ───────────────────────────────────────────────────────

function RequestRow({
  request,
  expanded,
  onToggle,
  onResolved,
}: {
  request: ApprovalRequest;
  expanded: boolean;
  onToggle: () => void;
  onResolved: () => void;
}) {
  const { t } = useTranslation();
  const urgent = isUrgent(request);
  const name = requesterFullName(request.requester);

  return (
    <div
      className={clsx(
        'relative border-b border-border-soft text-left',
        expanded && 'bg-[color-mix(in_oklch,var(--color-accent-500)_5%,var(--color-bg-elev))]',
        urgent && !expanded && 'bg-[color-mix(in_oklch,var(--color-warning-500)_7%,var(--color-bg-elev))]',
      )}
    >
      {expanded && (
        <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[2px] bg-accent-500" />
      )}

      <button
        type="button"
        onClick={onToggle}
        className="grid w-full cursor-pointer grid-cols-[22px_1fr_auto] gap-[9px] px-3.5 py-2.5 text-left outline-none hover:bg-bg-hover focus-visible:bg-bg-hover"
      >
        <Avatar name={name} size="sm" />

        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12.5px] font-semibold text-fg-strong">{name}</span>
            <span className="text-[12px] text-fg-muted">
              {t('approvals.bell.requestedApproval')}
            </span>
            <span className="ml-auto font-mono text-[10px] text-fg-dim">
              {relativeTime(request.requestedAt)}
            </span>
          </div>

          <div className="mt-0.5 inline-flex items-center gap-1">
            <MiniStatusChip status={request.transition.fromStatus} />
            <ArrowRightIcon className="size-2.5 text-fg-dim" />
            <MiniStatusChip status={request.transition.toStatus} />
          </div>

          <div className="mt-1 font-mono text-[10.5px] text-fg-muted">
            <span className="font-medium text-fg-strong">{request.workOrder.displayId}</span>
            <span> · {fallbackText(request.workOrder.customerName, 'Unknown customer')}</span>
          </div>

          {urgent && (
            <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-[color-mix(in_oklch,var(--color-warning-500)_14%,var(--color-bg-elev))] px-1.5 py-[1px] text-[9.5px] font-semibold text-warning-500">
              <LockClosedIcon className="size-2.5" />
              {t('approvals.expiringIn', { time: humanDuration(request.expiresAt) })}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-3.5 pb-2.5">
          <div className="ml-[31px]">
            <InlineActionRow request={request} onResolved={onResolved} />
          </div>
        </div>
      )}
    </div>
  );
}

// Compact row for the Mine tab's "Recently resolved" section. No
// expand-to-act — resolved requests can't be acted on. Click → mark
// seen + open the request in the full inbox.
function ResolvedRow({
  request,
  onClick,
}: {
  request: ApprovalRequest;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const responderName = request.respondedBy
    ? `${request.respondedBy.firstName ?? ''} ${request.respondedBy.lastName ?? ''}`.trim() ||
      'Unknown user'
    : 'Unknown user';
  const when = request.respondedAt ?? request.requestedAt;
  const resolution = resolutionChip(request.status);
  if (!resolution) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full cursor-pointer grid-cols-[22px_1fr_auto] gap-[9px] border-b border-border-soft px-3.5 py-2.5 text-left outline-none hover:bg-bg-hover focus-visible:bg-bg-hover"
    >
      <Avatar name={responderName} size="sm" />

      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[12.5px] font-semibold text-fg-strong">{responderName}</span>
          <span className="text-[12px] text-fg-muted">{resolution.verb}</span>
          <span className="ml-auto font-mono text-[10px] text-fg-dim">{relativeTime(when)}</span>
        </div>

        <div className="mt-0.5 inline-flex items-center gap-1">
          <span
            className={clsx(
              'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[10px] font-semibold',
              resolution.chipClass,
            )}
          >
            {t(resolution.labelKey)}
          </span>
        </div>

        <div className="mt-1 font-mono text-[10.5px] text-fg-muted">
          <span className="font-medium text-fg-strong">{request.workOrder.displayId}</span>
          <span> · {fallbackText(request.workOrder.customerName, 'Unknown customer')}</span>
        </div>
      </div>
    </button>
  );
}

function resolutionChip(status: ApprovalRequest['status']):
  | { labelKey: string; verb: string; chipClass: string }
  | null {
  switch (status) {
    case 'APPROVED':
      return {
        labelKey: 'approvals.bell.statusApproved',
        verb: 'approved your request',
        chipClass:
          'bg-[color-mix(in_oklch,var(--color-success-500)_14%,var(--color-bg-elev))] text-success-500',
      };
    case 'REJECTED':
      return {
        labelKey: 'approvals.bell.statusRejected',
        verb: 'rejected your request',
        chipClass:
          'bg-[color-mix(in_oklch,var(--color-danger-500)_14%,var(--color-bg-elev))] text-danger-500',
      };
    case 'EXPIRED':
      return {
        labelKey: 'approvals.bell.statusExpired',
        verb: 'request expired',
        chipClass: 'bg-bg-active text-fg-muted',
      };
    default:
      return null;
  }
}

// 1px-bordered pill with a 5px dot — smaller than the standard
// StatusChip so two chips + arrow fit on one line inside the popover's
// 380px width. Co-located rather than lifted because StatusChip already
// covers the larger sizes.
function MiniStatusChip({
  status,
}: {
  status: ApprovalRequest['transition']['fromStatus'];
}) {
  const label = status.name ?? 'Unknown';
  const dotColor = roleAccent(status.accentId ?? null, label);
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-border bg-bg px-1.5 py-[1px] text-[10.5px] font-medium text-fg-strong">
      <span
        aria-hidden
        className="rounded-full"
        style={{ width: 5, height: 5, background: dotColor }}
      />
      {label}
    </span>
  );
}

// ─── Inline action row ─────────────────────────────────────────

function InlineActionRow({
  request,
  onResolved,
}: {
  request: ApprovalRequest;
  onResolved: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const approveMutation = useMutation({
    mutationFn: (reason: string | undefined) =>
      approvalsApi.approve(request.id, reason ? { reason } : {}),
    onSuccess: (req) => {
      const transitionLabel = `${req.transition.fromStatus.name} → ${req.transition.toStatus.name}`;
      showSuccess(t('approvals.notifications.approved', { transition: transitionLabel }));
      onResolved();
      queryClient.invalidateQueries({ queryKey: ['work-orders', req.workOrder.id] });
    },
    onError: (err) => {
      showError(t('approvals.notifications.errorApprove'), extractApiError(err));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => approvalsApi.reject(request.id, { reason }),
    onSuccess: (req) => {
      const transitionLabel = `${req.transition.fromStatus.name} → ${req.transition.toStatus.name}`;
      showSuccess(t('approvals.notifications.rejected', { transition: transitionLabel }));
      onResolved();
      queryClient.invalidateQueries({ queryKey: ['work-orders', req.workOrder.id] });
    },
    onError: (err) => {
      showError(t('approvals.notifications.errorReject'), extractApiError(err));
    },
  });

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  const handleApprove = useCallback(() => {
    if (isPending) return;
    approveMutation.mutate(note.trim() || undefined);
  }, [isPending, note, approveMutation]);

  const handleReject = useCallback(() => {
    if (isPending) return;
    if (!note.trim()) {
      setRejecting(true);
      textareaRef.current?.focus();
      return;
    }
    rejectMutation.mutate(note.trim());
  }, [isPending, note, rejectMutation]);

  // Focus the textarea when the row first expands — saves the manager
  // from clicking twice before they can type a rejection reason.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const placeholder = rejecting
    ? t('approvals.action.reasonRequired')
    : t('approvals.bell.notePlaceholder');

  return (
    <div
      className="mt-1.5 flex items-center gap-1.5"
      // Stop row-toggle bubbling: clicks/keys inside the action area
      // must not collapse the row underneath.
      onClick={(e) => e.stopPropagation()}
    >
      <Textarea
        ref={textareaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={placeholder}
        rows={1}
        resizable={false}
        className="flex-1"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleApprove();
          }
        }}
        aria-label={t('approvals.bell.notePlaceholder')}
        disabled={isPending}
      />
      <Button
        outline="red"
        size="xxs"
        onClick={handleReject}
        disabled={isPending}
        aria-label={t('approvals.action.reject')}
      >
        <XMarkIcon data-slot="icon" className="size-3" />
      </Button>
      <Button color="green" size="xxs" onClick={handleApprove} disabled={isPending}>
        <CheckIcon data-slot="icon" className="size-3" />
        {t('approvals.action.approve')}
      </Button>
    </div>
  );
}

// ─── States ────────────────────────────────────────────────────

function EmptyAllClear() {
  const { t } = useTranslation();
  return (
    <div className="grid h-full place-items-center px-5 py-10">
      <div className="text-center">
        <CheckCircleIcon className="mx-auto mb-2.5 size-9 text-success-500" />
        <div className="text-[13px] font-semibold text-fg-strong">
          {t('approvals.empty.allClear.title')}
        </div>
        <div className="mt-0.5 text-[11.5px] text-fg-muted">
          {t('approvals.empty.allClear.description')}
        </div>
      </div>
    </div>
  );
}

function ListLoading() {
  const { t } = useTranslation();
  return (
    <div className="grid h-full place-items-center px-5 py-10 text-[11.5px] text-fg-muted">
      {t('approvals.bell.loading')}
    </div>
  );
}

function ListError() {
  const { t } = useTranslation();
  return (
    <div className="grid h-full place-items-center px-5 py-10 text-center text-[11.5px] text-fg-muted">
      {t('approvals.errors.couldNotLoad')}
    </div>
  );
}

// ─── Footer ────────────────────────────────────────────────────

function Footer({ tab, onDismiss }: { tab: BellTab; onDismiss: () => void }) {
  const { t } = useTranslation();
  const inboxTab = tab === 'mine' ? 'my-requests' : 'pending';
  return (
    <div className="flex items-center justify-between gap-2 border-t border-border-soft bg-bg-elev-2 px-3.5 py-2">
      <Link
        to={`/approvals?tab=${inboxTab}`}
        onClick={onDismiss}
        className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-fg-accent hover:underline"
      >
        {t('approvals.bell.viewAll')}
        <ArrowRightIcon className="size-3" />
      </Link>
      {/* Preferences is a stub for now — wires up to the future
          notification-settings dialog. Routes to /settings as a
          placeholder so the click doesn't dead-end. */}
      <Link
        to="/settings"
        onClick={onDismiss}
        className="inline-flex items-center gap-1 text-[10.5px] text-fg-muted hover:text-fg-strong"
      >
        <Cog6ToothIcon className="size-2.5" />
        {t('approvals.bell.preferences')}
      </Link>
    </div>
  );
}
