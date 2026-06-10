/* eslint-disable i18next/no-literal-string -- dense visual detail page; entity names go through getName()/t(), inline glyphs/separators/short operational labels stay literal (same convention as ServiceLocationDetailPage / UserDetailPage). */
import type React from 'react';
import { useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  DocumentTextIcon,
  BriefcaseIcon,
  CalendarDaysIcon,
  ReceiptPercentIcon,
  UserIcon,
  MapPinIcon,
  ArrowPathRoundedSquareIcon,
  PencilIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import {
  agreementApi,
  type AgreementResponse,
  type AgreementStatus,
  type VisitTemplateResponse,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import ConfirmDialog from '../components/ConfirmDialog';
import IconButton from '../components/IconButton';
import AgreementFormDialog from '../components/AgreementFormDialog';
import VisitTemplateFormDialog from '../components/VisitTemplateFormDialog';
import { Card } from '../components/catalyst/card';
import { DataRow } from '../components/catalyst/data-row';
import { Button } from '../components/catalyst/button';
import { Heading } from '../components/catalyst/heading';
import { Pill } from '../components/ui/Pill';
import { Callout } from '../components/ui/Callout';
import { Tabs } from '../components/ui/Tabs';
import { EmptyState } from '../components/ui/EmptyState';
import AgreementCoverageTab from './agreement/AgreementCoverageTab';
import AgreementScheduleTab from './agreement/AgreementScheduleTab';
import { useAgreementSchedule } from './agreement/useAgreementSchedule';
import {
  agreementBillingQueryOptions,
  agreementComplianceQueryOptions,
  agreementCoverageQueryOptions,
  agreementLocationsQueryOptions,
  computeArr,
  cadenceLabel,
  cadenceAbbr,
  formatCurrency,
  formatDay,
  daysUntil,
  periodsPerYear,
  type LocationMap,
} from './agreement/agreementShared';
import { CardTitle, CardLink } from './agreement/agreementCards';

type TabId = 'overview' | 'coverage' | 'schedule' | 'invoices' | 'documents' | 'activity';

// ── Smart back-link (same ?from= pattern as ServiceLocationDetailPage) ───────
function useBackContext(agreement: AgreementResponse): { label: string; href: string } {
  const [params] = useSearchParams();
  const from = (params.get('from') || '').toLowerCase();
  if (from === 'agreements') return { label: 'All agreements', href: '/agreements' };
  if (from === 'search') {
    const q = params.get('q');
    return { label: q ? `Search results · “${q}”` : 'Search results', href: '/search' };
  }
  // 'customer' and default both resolve to the parent customer's Agreements tab.
  return {
    label: `${agreement.customer.name} · Agreements`,
    href: `/customers/${agreement.customer.id}?tab=agreements`,
  };
}

function BackLink({ agreement }: { agreement: AgreementResponse }) {
  const ctx = useBackContext(agreement);
  return (
    <Link
      to={ctx.href}
      className="mb-2.5 inline-flex max-w-[600px] items-center gap-1 truncate text-[11.5px] text-fg-muted hover:text-fg-strong"
    >
      ← {ctx.label}
    </Link>
  );
}

const STATUS_TONE: Record<AgreementStatus, 'success' | 'neutral' | 'warning' | 'danger'> = {
  ACTIVE: 'success',
  DRAFT: 'neutral',
  SUSPENDED: 'warning',
  EXPIRED: 'neutral',
  CANCELLED: 'danger',
};

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmNoRenew, setConfirmNoRenew] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);

  const { data: agreement, isLoading, error } = useQuery({
    queryKey: ['agreement', id],
    queryFn: () => agreementApi.getById(id!),
    enabled: !!id,
  });

  const customerId = agreement?.customer.id ?? '';
  const { data: locationMap } = useQuery(agreementLocationsQueryOptions(customerId));

  const cancelMutation = useMutation({
    mutationFn: () => agreementApi.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showSuccess('Agreement cancelled');
    },
    onError: (err) => showError("Couldn't cancel agreement", extractApiError(err) ?? undefined),
  });

  const noRenewMutation = useMutation({
    mutationFn: () => agreementApi.update(id!, { autoRenew: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      showSuccess('Auto-renew turned off — agreement will expire at term');
    },
    onError: (err) => showError("Couldn't update auto-renew", extractApiError(err) ?? undefined),
  });

  const activateMutation = useMutation({
    mutationFn: () => agreementApi.update(id!, { status: 'ACTIVE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showSuccess('Agreement activated — visits will begin generating');
    },
    onError: (err) => showError("Couldn't activate agreement", extractApiError(err) ?? undefined),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-[12.5px] text-fg-muted">
          {t('common.actions.loading', { entities: getName('agreement', true) })}
        </div>
      </AppLayout>
    );
  }

  if (error || !agreement) {
    return (
      <AppLayout>
        <div className="p-8">
          <Callout kind="danger">
            {t('common.actions.errorLoadingEntity', { entity: getName('agreement') })}
            {error && `: ${(error as Error).message}`}
          </Callout>
          <Button className="mt-4" onClick={() => navigate('/customers')}>
            {t('common.actions.backTo', { entities: getName('customer', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const customerLocationCount = locationMap?.size;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'coverage', label: 'Coverage', count: agreement.coverageLocationCount },
    { id: 'schedule', label: 'Schedule' },
    { id: 'invoices', label: getName('invoice', true) },
    { id: 'documents', label: 'Documents' },
    { id: 'activity', label: 'Activity' },
  ];

  const isEnded = agreement.status === 'CANCELLED' || agreement.status === 'EXPIRED';

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[1240px]">
          <BackLink agreement={agreement} />

          <AgreementHeader
            agreement={agreement}
            onEdit={() => setIsEditOpen(true)}
            onActivate={() => setConfirmActivate(true)}
          />

          <div className="mb-3.5">
            <Tabs value={activeTab} onChange={(tabId) => setActiveTab(tabId as TabId)} tabs={tabs} />
          </div>

          {activeTab === 'overview' && (
            <OverviewTab
              agreement={agreement}
              locationMap={locationMap}
              customerLocationCount={customerLocationCount}
              onEdit={() => setIsEditOpen(true)}
              onActivate={() => setConfirmActivate(true)}
              onViewSchedule={() => setActiveTab('schedule')}
              onViewCoverage={() => setActiveTab('coverage')}
            />
          )}

          {activeTab === 'coverage' && (
            <AgreementCoverageTab
              agreementId={agreement.id}
              customerLocationCount={customerLocationCount}
              locationMap={locationMap}
            />
          )}

          {activeTab === 'schedule' && (
            <AgreementScheduleTab agreementId={agreement.id} locationMap={locationMap} />
          )}

          {activeTab === 'invoices' && (
            <TabStub
              label={getName('invoice', true)}
              detail="Agreement invoices are billed on the schedule's own clock by financial-service. Listing them here is pending a small backend add (an agreementId filter on invoice search)."
            />
          )}
          {activeTab === 'documents' && (
            <TabStub label="Documents" detail="Contract attachments for agreements aren't wired to a backend yet." />
          )}
          {activeTab === 'activity' && (
            <TabStub label="Activity" detail="An agreement-scoped activity feed isn't available from the backend yet." />
          )}

          <EndAgreementFooter
            agreement={agreement}
            disabled={isEnded}
            onCancel={() => setConfirmCancel(true)}
            onNoRenew={() => setConfirmNoRenew(true)}
          />
        </div>
      </div>

      <AgreementFormDialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        agreement={agreement}
      />

      <ConfirmDialog
        isOpen={confirmActivate}
        onClose={() => setConfirmActivate(false)}
        onConfirm={() => activateMutation.mutate()}
        title={`Activate ${agreement.agreementNumber}?`}
        message="Generation begins for active agreements — work orders will start materializing for covered locations on each visit template's cadence. Make sure coverage + visit templates are set first."
        confirmLabel="Activate"
        isPending={activateMutation.isPending}
      />

      <ConfirmDialog
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelMutation.mutate()}
        title={`Cancel ${agreement.agreementNumber}?`}
        message="Terminates the agreement mid-term (prorated refund handled per the contract). Visit and invoice history are preserved. New visits stop generating."
        confirmLabel="Cancel agreement"
        isDestructive
        isPending={cancelMutation.isPending}
      />

      <ConfirmDialog
        isOpen={confirmNoRenew}
        onClose={() => setConfirmNoRenew(false)}
        onConfirm={() => noRenewMutation.mutate()}
        title="Turn off auto-renew?"
        message={`The agreement will run to ${agreement.termEnd ? formatDay(agreement.termEnd) : 'the end of its term'} and then expire with no further action. No money moves now.`}
        confirmLabel="Don't renew"
        isPending={noRenewMutation.isPending}
      />
    </AppLayout>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function AgreementMark() {
  return (
    <div
      className="grid size-[52px] shrink-0 place-items-center rounded-[10px] text-white"
      style={{
        background: 'linear-gradient(135deg, oklch(58% 0.14 165), oklch(45% 0.16 168))',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.12)',
      }}
    >
      <DocumentTextIcon className="size-6" />
    </div>
  );
}

function AgreementHeader({
  agreement,
  onEdit,
  onActivate,
}: {
  agreement: AgreementResponse;
  onEdit: () => void;
  onActivate: () => void;
}) {
  const { data: billing } = useQuery(agreementBillingQueryOptions(agreement.id));
  const { data: compliance } = useQuery(agreementComplianceQueryOptions(agreement.id));

  const arr = billing ? computeArr(billing) : undefined;

  const meta: React.ReactNode[] = [];
  meta.push(<span key="num" className="id-mono">{agreement.agreementNumber}</span>);
  meta.push(
    <Link key="cust" to={`/customers/${agreement.customer.id}`} className="font-medium text-fg hover:text-fg-strong">
      {agreement.customer.name}
    </Link>,
  );
  if (agreement.termStart || agreement.termEnd) {
    meta.push(
      <span key="term">
        Term {formatDay(agreement.termStart)} <span className="text-fg-dim">→</span>{' '}
        {agreement.termEnd ? formatDay(agreement.termEnd) : 'Open-ended'}
      </span>,
    );
  }
  if (billing) {
    meta.push(
      <span key="arr">
        {arr != null ? (
          <>
            <strong className="font-semibold text-fg-strong">{formatCurrency(arr)}</strong>/yr
          </>
        ) : (
          <strong className="font-semibold text-fg-strong">Per visit</strong>
        )}
      </span>,
    );
  }
  if (agreement.termEnd && agreement.autoRenew) {
    meta.push(
      <span key="renews">
        Renews <strong className="font-semibold text-fg-strong">{formatDay(agreement.termEnd)}</strong>
      </span>,
    );
  }

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm sm:flex-row sm:items-start sm:gap-3.5">
      <AgreementMark />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={1} size="page-sm" className="m-0">
            {agreement.name}
          </Heading>
          <Pill tone={STATUS_TONE[agreement.status]} dot>
            {titleCase(agreement.status)}
          </Pill>
          {agreement.autoRenew && (
            <Pill tone="accent">
              Auto-renew{agreement.renewalTermMonths ? ` · ${agreement.renewalTermMonths} mo` : ''}
            </Pill>
          )}
          {agreement.kind === 'VISIT' && <Pill tone="neutral">Visit-based</Pill>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-fg-muted">
          {meta.map((node, i) => (
            <span key={i} className="flex items-center gap-x-2.5">
              {i > 0 && <span className="text-fg-dim">·</span>}
              {node}
            </span>
          ))}
        </div>
      </div>

      {compliance && (
        <div className="shrink-0 text-right sm:min-w-[132px]">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">This term</div>
          <div className="mt-0.5 font-mono text-[18px] font-bold leading-none tabular-nums tracking-tight text-fg-strong">
            {compliance.visitsFulfilled}
            <span className="font-medium text-fg-dim"> / {compliance.visitsTotal}</span>
          </div>
          <div className="text-[10.5px] text-fg-muted">
            visits complete
            {compliance.visitsTotal > 0 &&
              ` · ${Math.round((compliance.visitsFulfilled / compliance.visitsTotal) * 100)}%`}
          </div>
          {compliance.visitsOverdue + compliance.visitsMissed > 0 && (
            <div className="text-[10.5px] font-semibold text-warning-fg">
              {compliance.visitsOverdue + compliance.visitsMissed} behind schedule
            </div>
          )}
        </div>
      )}

      <div className="flex shrink-0 gap-1.5 max-sm:w-full max-sm:[&>*]:flex-1">
        <Button outline size="xs" onClick={onEdit}>
          Edit
        </Button>
        {agreement.status === 'DRAFT' && (
          <Button color="accent" size="xs" onClick={onActivate}>
            Activate
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Overview tab ─────────────────────────────────────────────────────────────
function OverviewTab({
  agreement,
  locationMap,
  customerLocationCount,
  onEdit,
  onActivate,
  onViewSchedule,
  onViewCoverage,
}: {
  agreement: AgreementResponse;
  locationMap: LocationMap | undefined;
  customerLocationCount: number | undefined;
  onEdit: () => void;
  onActivate: () => void;
  onViewSchedule: () => void;
  onViewCoverage: () => void;
}) {
  const { data: compliance } = useQuery(agreementComplianceQueryOptions(agreement.id));
  const { scheduled } = useAgreementSchedule(agreement.id, locationMap);

  const isDraft = agreement.status === 'DRAFT';
  const hasTemplates = agreement.visitTemplates.length > 0;
  const hasCoverage = agreement.coverageLocationCount > 0;
  const readyToActivate = hasTemplates && hasCoverage;

  const renewsInDays = daysUntil(agreement.termEnd);
  const attention: { key: string; severity: 'warning' | 'info'; title: string; sub: string; action: string; onAction: () => void }[] = [];
  if (renewsInDays != null && renewsInDays > 0 && renewsInDays < 90) {
    attention.push({
      key: 'renewal',
      severity: 'warning',
      title: `Renews in ${renewsInDays} days · ${formatDay(agreement.termEnd)}`,
      sub: agreement.autoRenew ? 'Auto-renew on file — confirm scope + margin' : 'No auto-renew — action required',
      action: 'Review',
      onAction: onEdit,
    });
  }
  if (compliance && compliance.visitsOverdue > 0) {
    attention.push({
      key: 'behind',
      severity: 'warning',
      title: `${compliance.visitsOverdue} ${compliance.visitsOverdue === 1 ? 'visit' : 'visits'} behind schedule`,
      sub: 'Past the scheduling window without a completed visit',
      action: 'Schedule',
      onAction: onViewSchedule,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {isDraft && (
        <Callout
          kind="accent"
          title="Draft — not generating visits yet"
          action={
            <Button size="xs" onClick={onActivate} disabled={!readyToActivate}>
              Activate
            </Button>
          }
        >
          <ul className="flex flex-col gap-0.5 text-[12px]">
            <li className={hasTemplates ? 'text-fg-muted' : 'text-fg'}>
              {hasTemplates ? '✓' : '○'} Visit template{hasTemplates ? ' set' : ' needed — add one in the Scope card →'}
            </li>
            <li className={hasCoverage ? 'text-fg-muted' : 'text-fg'}>
              {hasCoverage
                ? `✓ Coverage set (${agreement.coverageLocationCount})`
                : '○ Coverage needed — add locations in the Coverage tab →'}
            </li>
          </ul>
        </Callout>
      )}

      {attention.length > 0 && (
        <Card padding="none">
          <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg">Needs attention</span>
            <span className="rounded bg-bg-active px-1.5 font-mono text-[10.5px] font-semibold text-fg-strong">
              {attention.length}
            </span>
          </div>
          <div>
            {attention.map((it, i) => (
              <div
                key={it.key}
                className={`relative flex items-center gap-2.5 py-1.5 pl-3 pr-3.5 ${i < attention.length - 1 ? 'border-b border-border-soft' : ''}`}
              >
                <span
                  className="absolute inset-y-1.5 left-0 w-[3px] rounded"
                  style={{ background: it.severity === 'warning' ? 'var(--warning-500)' : 'var(--info-500)' }}
                />
                <div className="flex grow flex-wrap items-baseline gap-2 leading-normal">
                  <span
                    className="text-[12.5px] font-semibold"
                    style={{ color: it.severity === 'warning' ? 'var(--warning-fg)' : 'var(--fg-strong)' }}
                  >
                    {it.title}
                  </span>
                  <span className="text-[11.5px] text-fg-muted">· {it.sub}</span>
                </div>
                <Button outline size="xxs" className="shrink-0" onClick={it.onAction}>
                  {it.action}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-3">
          <CoverageSummaryCard
            agreement={agreement}
            customerLocationCount={customerLocationCount}
            onViewCoverage={onViewCoverage}
          />
          <NextVisitsCard scheduled={scheduled} onViewSchedule={onViewSchedule} />
          <FinancialSnapshotCard agreementId={agreement.id} />
        </div>
        <div className="flex flex-col gap-3">
          <ScopeCard agreementId={agreement.id} templates={agreement.visitTemplates} />
          <TermCard agreement={agreement} onEdit={onEdit} />
          <CustomerCard agreement={agreement} />
          <NotesCard agreement={agreement} onEdit={onEdit} />
        </div>
      </div>
    </div>
  );
}

function CoverageSummaryCard({
  agreement,
  customerLocationCount,
  onViewCoverage,
}: {
  agreement: AgreementResponse;
  customerLocationCount: number | undefined;
  onViewCoverage: () => void;
}) {
  const { data: coverage } = useQuery(agreementCoverageQueryOptions(agreement.id));
  // Visits/yr generated across all covered locations, summed over templates.
  const visitsPerYear = useMemo(() => {
    const perLoc = agreement.visitTemplates.reduce(
      (sum, tpl) => sum + periodsPerYear(tpl.cadenceUnit, tpl.cadenceInterval),
      0,
    );
    return Math.round(perLoc * agreement.coverageLocationCount);
  }, [agreement.visitTemplates, agreement.coverageLocationCount]);

  return (
    <Card
      padding="none"
      title={<CardTitle icon={<MapPinIcon className="size-3.5" />}>Coverage</CardTitle>}
      action={<CardLink onClick={onViewCoverage}>View all {agreement.coverageLocationCount} →</CardLink>}
    >
      <div className="grid grid-cols-2 border-b border-border-soft">
        <div className="border-r border-border-soft px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Locations</div>
          <div className="mt-0.5 text-[18px] font-bold leading-none tracking-tight text-fg-strong">
            <span className="font-mono tabular-nums">{agreement.coverageLocationCount}</span>
            {customerLocationCount != null && (
              <span className="text-[12px] font-medium text-fg-muted"> of {customerLocationCount}</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-fg-muted">covered</div>
        </div>
        <div className="px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Visits / yr</div>
          <div className="mt-0.5 text-[18px] font-bold leading-none tracking-tight text-fg-strong">
            <span className="font-mono tabular-nums">{visitsPerYear}</span>
          </div>
          <div className="mt-1 text-[11px] text-fg-muted">
            {agreement.visitTemplates.length} {agreement.visitTemplates.length === 1 ? 'cadence' : 'cadences'}
          </div>
        </div>
      </div>
      {coverage?.autoAdd && (
        <div className="px-3.5 py-2 text-[11.5px] text-fg-muted">
          <span className="font-semibold text-fg-accent">Auto-extends ·</span> newly-matched locations join at the
          next cycle.
        </div>
      )}
    </Card>
  );
}

function NextVisitsCard({
  scheduled,
  onViewSchedule,
}: {
  scheduled: ReturnType<typeof useAgreementSchedule>['scheduled'];
  onViewSchedule: () => void;
}) {
  const rows = scheduled.slice(0, 3);
  return (
    <Card
      padding="none"
      title={<CardTitle icon={<CalendarDaysIcon className="size-3.5" />}>Next scheduled visits</CardTitle>}
      action={<CardLink onClick={onViewSchedule}>View schedule →</CardLink>}
    >
      {rows.length === 0 ? (
        <EmptyState compact title="No visits on the board" description="Visits appear here once obligations materialize into work orders." />
      ) : (
        <div>
          {rows.map((v, i) => (
            <div
              key={v.obligationId}
              className={`grid grid-cols-[70px_1fr_auto] items-center gap-2.5 px-3.5 py-2 ${i < rows.length - 1 ? 'border-b border-border-soft' : ''}`}
            >
              <div>
                <div className="text-[12px] font-semibold text-fg-strong">
                  {v.date
                    ? new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : 'TBD'}
                </div>
                {v.tech ? (
                  <div className="text-[11px] text-fg-muted">{v.tech}</div>
                ) : (
                  <div className="text-[11px] text-warning-fg">Unassigned</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-fg-strong">{v.locName}</div>
                {v.locSub && <div className="truncate text-[11px] text-fg-muted">{v.locSub}</div>}
              </div>
              {v.live ? (
                <Pill tone="info" dot live>In progress</Pill>
              ) : v.status === 'OVERDUE' ? (
                <Pill tone="warning" dot>Behind</Pill>
              ) : (
                <Pill tone="success" dot>Scheduled</Pill>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function FinancialSnapshotCard({ agreementId }: { agreementId: string }) {
  const { data: billing, isLoading } = useQuery(agreementBillingQueryOptions(agreementId));

  if (!isLoading && !billing) {
    return (
      <Card title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Financials</CardTitle>}>
        <div className="text-[12px] text-fg-muted">No billing schedule set up yet.</div>
      </Card>
    );
  }
  if (!billing) {
    return (
      <Card title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Financials</CardTitle>}>
        <div className="text-[12px] text-fg-muted">Loading…</div>
      </Card>
    );
  }

  const arr = computeArr(billing);
  return (
    <Card
      padding="none"
      title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Financials</CardTitle>}
    >
      <div className="grid grid-cols-3">
        <FinCell
          k="Annual value"
          v={arr != null ? formatCurrency(arr) : 'Per visit'}
          sub={`${cadenceLabel(billing.cadenceUnit, billing.cadenceInterval)} billing`}
        />
        <FinCell
          k="Per period"
          v={formatCurrency(billing.amount)}
          sub={`/ ${cadenceAbbr(billing.cadenceUnit)}`}
        />
        <FinCell k="Invoice terms" v={`Net ${billing.netDays}`} sub="from period start" last />
      </div>
    </Card>
  );
}

function FinCell({ k, v, sub, last }: { k: string; v: string; sub: string; last?: boolean }) {
  return (
    <div className={`px-3.5 py-2.5 ${last ? '' : 'border-r border-border-soft'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{k}</div>
      <div className="mt-0.5 font-mono text-[16px] font-bold tabular-nums tracking-tight text-fg-strong">{v}</div>
      <div className="text-[11px] text-fg-muted">{sub}</div>
    </div>
  );
}

// The page's marquee — rebuilt on the real visit templates + scope items (the
// mock's plain-English Included/Excluded/SLA prose has no backing data).
// Editable: add / edit / delete the recurrence rules that drive generation.
function ScopeCard({ agreementId, templates }: { agreementId: string; templates: VisitTemplateResponse[] }) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VisitTemplateResponse | null>(null);
  const [deleting, setDeleting] = useState<VisitTemplateResponse | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => agreementApi.deleteVisitTemplate(agreementId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] });
      setDeleting(null);
      showSuccess('Visit template removed');
    },
    onError: (err) => showError("Couldn't remove visit template", extractApiError(err) ?? undefined),
  });

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (tpl: VisitTemplateResponse) => {
    setEditing(tpl);
    setDialogOpen(true);
  };

  return (
    <Card
      padding="none"
      title={<CardTitle icon={<BriefcaseIcon className="size-3.5" />}>Scope</CardTitle>}
      action={<CardLink onClick={openAdd}>+ Add visit</CardLink>}
    >
      {templates.length === 0 ? (
        <div className="px-3.5 py-3">
          <EmptyState
            compact
            title="No visit templates"
            description="Add a recurrence to start generating visits."
            action={<Button outline size="xxs" onClick={openAdd}>Add visit template</Button>}
          />
        </div>
      ) : (
        <div>
          {templates.map((tpl, i) => (
            <div
              key={tpl.id}
              className={`group px-3.5 py-2.5 ${i < templates.length - 1 ? 'border-b border-border-soft' : ''}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-[12.5px] font-semibold text-fg-strong">{tpl.label}</div>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-[11px] text-fg-muted">{cadenceLabel(tpl.cadenceUnit, tpl.cadenceInterval)}</span>
                  <IconButton aria-label="Edit visit template" onClick={() => openEdit(tpl)}>
                    <PencilIcon className="size-3.5" />
                  </IconButton>
                  <IconButton aria-label="Remove visit template" onClick={() => setDeleting(tpl)}>
                    <TrashIcon className="size-3.5" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-fg-muted">
                {tpl.windowDays}-day window
                {tpl.estDurationMinutes ? ` · ~${formatDuration(tpl.estDurationMinutes)} / visit` : ''}
              </div>
              {tpl.scopeItems.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {tpl.scopeItems.map((item, j) => (
                    <li key={j} className="grid grid-cols-[11px_1fr] items-start gap-2">
                      <span className="mt-[5px] size-1.5 justify-self-start rounded-full bg-success-500" />
                      <span className="text-[11.5px] leading-snug text-fg">
                        {item.description}
                        {item.season && <span className="text-fg-dim"> · {item.season}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <VisitTemplateFormDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        agreementId={agreementId}
        template={editing ?? undefined}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        title={deleting ? `Remove “${deleting.label}”?` : ''}
        message="Stops generating future visits from this template. Already-materialized work orders are unaffected."
        confirmLabel="Remove"
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </Card>
  );
}

function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function TermCard({ agreement, onEdit }: { agreement: AgreementResponse; onEdit: () => void }) {
  const renewsInDays = daysUntil(agreement.termEnd);
  return (
    <Card
      padding="none"
      title="Term"
      action={<CardLink onClick={onEdit}>Edit</CardLink>}
    >
      <DataRow label="Term" labelWidth={90}>
        <span className="text-[12.5px] text-fg-strong">
          {formatDay(agreement.termStart)} <span className="text-fg-dim">→</span>{' '}
          {agreement.termEnd ? formatDay(agreement.termEnd) : 'Open-ended'}
        </span>
      </DataRow>
      {agreement.termEnd && (
        <DataRow label="Renews" labelWidth={90}>
          <span className="text-[12.5px] text-fg-strong">
            {formatDay(agreement.termEnd)}
            {renewsInDays != null && (
              <span className={renewsInDays < 90 ? 'text-warning-fg' : 'text-fg-muted'}> · in {renewsInDays}d</span>
            )}
          </span>
        </DataRow>
      )}
      <DataRow label="Auto-renew" labelWidth={90} last>
        {agreement.autoRenew ? (
          <span className="text-[12.5px] text-fg-strong">
            Yes
            <span className="text-fg-muted">
              {agreement.renewalTermMonths ? ` · ${agreement.renewalTermMonths} mo` : ''}
              {agreement.renewalAlertDays ? ` · alert ${agreement.renewalAlertDays}d prior` : ''}
            </span>
          </span>
        ) : (
          <span className="text-[12.5px] text-warning-fg">No · expires at term</span>
        )}
      </DataRow>
    </Card>
  );
}

function CustomerCard({ agreement }: { agreement: AgreementResponse }) {
  return (
    <Card
      title={<CardTitle icon={<UserIcon className="size-3.5" />}>Customer</CardTitle>}
      action={<CardLink to={`/customers/${agreement.customer.id}`}>Open customer →</CardLink>}
    >
      <div className="text-[13px] font-semibold text-fg-strong">{agreement.customer.name}</div>
      <div className="mt-1.5 text-[11.5px] text-fg-muted">
        See the customer page for the full agreement portfolio and AR rollup.
      </div>
    </Card>
  );
}

function NotesCard({ agreement, onEdit }: { agreement: AgreementResponse; onEdit: () => void }) {
  return (
    <Card title="Notes" action={<CardLink onClick={onEdit}>Edit</CardLink>}>
      {agreement.notes ? (
        <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-fg">{agreement.notes}</div>
      ) : (
        <div className="text-[12px] italic text-fg-dim">No notes.</div>
      )}
    </Card>
  );
}

// ── End-agreement footer ─────────────────────────────────────────────────────
function EndAgreementFooter({
  agreement,
  disabled,
  onCancel,
  onNoRenew,
}: {
  agreement: AgreementResponse;
  disabled: boolean;
  onCancel: () => void;
  onNoRenew: () => void;
}) {
  return (
    <div className="mt-3.5 flex flex-col gap-3 rounded-[12px] border border-border bg-bg-elev px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-fg-strong">
          {disabled ? `${agreement.agreementNumber} is ${agreement.status.toLowerCase()}` : `End ${agreement.agreementNumber}`}
        </div>
        <div className="mt-0.5 text-[11.5px] text-fg-muted">
          Cancel terminates mid-term. Don&rsquo;t-renew lets it expire at term with no further action. Both preserve
          visit + invoice history.
        </div>
      </div>
      <div className="flex gap-1.5">
        <Button
          outline
          size="xxs"
          disabled={disabled || !agreement.autoRenew}
          onClick={onNoRenew}
        >
          <ArrowPathRoundedSquareIcon className="size-3.5" />
          Don&rsquo;t renew at term
        </Button>
        <Button outline="red" size="xxs" disabled={disabled} onClick={onCancel}>
          Cancel agreement
        </Button>
      </div>
    </div>
  );
}

function TabStub({ label, detail }: { label: string; detail: string }) {
  return (
    <Card>
      <div className="py-10 text-center">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Not available yet</div>
        <div className="mt-1.5 text-[14px] font-semibold text-fg-strong">{label}</div>
        <div className="mx-auto mt-1 max-w-md text-[12px] text-fg-muted">{detail}</div>
      </div>
    </Card>
  );
}
