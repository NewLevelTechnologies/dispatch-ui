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
  agreementFilesApi,
  invoicesApi,
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
import BillingSetupDialog from '../components/BillingSetupDialog';
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
import { useAgreementBilling, type EnrichedInstallment, type InstallmentDisplayStatus } from './agreement/useAgreementBilling';
import AgreementInvoicesTab from './agreement/AgreementInvoicesTab';
import AgreementFilesTab from './agreement/AgreementFilesTab';
import NotesCard from '../components/NotesCard';
import {
  agreementBillingQueryOptions,
  agreementRevenueQueryOptions,
  agreementComplianceQueryOptions,
  agreementCoverageQueryOptions,
  agreementLocationsQueryOptions,
  computeArr,
  cadenceLabel,
  formatCurrency,
  formatDay,
  formatDayNoYear,
  daysUntil,
  periodsPerYear,
  type LocationMap,
} from './agreement/agreementShared';
import { CardTitle, CardLink } from './agreement/agreementCards';

type TabId = 'overview' | 'coverage' | 'schedule' | 'invoices' | 'documents' | 'activity';

// ── Smart back-link (same ?from= pattern as ServiceLocationDetailPage) ───────
function useBackContext(agreement: AgreementResponse): { label: string; href: string } {
  const [params] = useSearchParams();
  const { getName } = useGlossary();
  const from = (params.get('from') || '').toLowerCase();
  if (from === 'agreements') return { label: `All ${getName('agreement', true).toLowerCase()}`, href: '/agreements' };
  if (from === 'search') {
    const q = params.get('q');
    return { label: q ? `Search results · “${q}”` : 'Search results', href: '/search' };
  }
  // 'customer' and default both resolve to the parent customer's agreements tab.
  return {
    label: `${agreement.customer.name} · ${getName('agreement', true)}`,
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

// Periods/yr for the "N × $amount" billing sub-line — clean cadences are
// whole, odd intervals (e.g. every 5 weeks) get one decimal.
function formatCount(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function AgreementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  // Scoped edit dialog: 'identity' (header → name) vs 'term' (Term card →
  // dates/renewal). Billing has its own dialog. null = closed.
  const [editSection, setEditSection] = useState<'identity' | 'term' | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmNoRenew, setConfirmNoRenew] = useState(false);
  const [confirmActivate, setConfirmActivate] = useState(false);

  const { data: agreement, isLoading, error } = useQuery({
    queryKey: ['agreement', id],
    queryFn: () => agreementApi.getById(id!),
    enabled: !!id,
  });

  // Documents tab badge — lean limit-1 page for the count. Shares the
  // ['agreement-files', id] prefix so upload/delete in the tab refresh it.
  const { data: documentCount } = useQuery({
    queryKey: ['agreement-files', id, 'count'] as const,
    queryFn: () => agreementFilesApi.list(id!, { limit: 1 }),
    enabled: !!id,
    select: (p) => p.counts.all,
  });

  // Invoices tab badge — lean size-1 page for the count.
  const { data: invoiceCount } = useQuery({
    queryKey: ['invoices', 'agreement', id, 'count'] as const,
    queryFn: () => invoicesApi.getAll({ agreementId: id!, size: 1 }),
    enabled: !!id,
    select: (p) => p.totalElements,
  });

  const customerId = agreement?.customer.id ?? '';
  const { data: locationMap } = useQuery(agreementLocationsQueryOptions(customerId));

  const cancelMutation = useMutation({
    mutationFn: () => agreementApi.cancel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showSuccess(`${getName('agreement')} cancelled`);
    },
    onError: (err) => showError(`Couldn't cancel ${getName('agreement').toLowerCase()}`, extractApiError(err) ?? undefined),
  });

  const noRenewMutation = useMutation({
    mutationFn: () => agreementApi.update(id!, { autoRenew: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      showSuccess(`Auto-renew turned off — ${getName('agreement').toLowerCase()} will expire at term`);
    },
    onError: (err) => showError("Couldn't update auto-renew", extractApiError(err) ?? undefined),
  });

  const activateMutation = useMutation({
    mutationFn: () => agreementApi.update(id!, { status: 'ACTIVE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showSuccess(`${getName('agreement')} activated — ${getName('work_order', true).toLowerCase()} will begin generating`);
    },
    onError: (err) => showError(`Couldn't activate ${getName('agreement').toLowerCase()}`, extractApiError(err) ?? undefined),
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
    { id: 'invoices', label: getName('invoice', true), count: invoiceCount },
    { id: 'documents', label: 'Documents', count: documentCount },
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
            onEdit={() => setEditSection('identity')}
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
              onEdit={() => setEditSection('term')}
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

          {activeTab === 'invoices' && <AgreementInvoicesTab agreementId={agreement.id} />}
          {activeTab === 'documents' && <AgreementFilesTab agreementId={agreement.id} />}
          {activeTab === 'activity' && (
            <TabStub label="Activity" detail={`An ${getName('agreement').toLowerCase()}-scoped activity feed isn't available from the backend yet.`} />
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
        isOpen={editSection !== null}
        section={editSection ?? undefined}
        onClose={() => setEditSection(null)}
        agreement={agreement}
      />

      <ConfirmDialog
        isOpen={confirmActivate}
        onClose={() => setConfirmActivate(false)}
        onConfirm={() => activateMutation.mutate()}
        title={`Activate ${agreement.agreementNumber}?`}
        message={`Generation begins for active ${getName('agreement', true).toLowerCase()} — ${getName('work_order', true).toLowerCase()} will start materializing for covered ${getName('service_location', true).toLowerCase()} on each ${getName('work_order').toLowerCase()} template's cadence. Make sure coverage + ${getName('work_order').toLowerCase()} templates are set first.`}
        confirmLabel="Activate"
        isPending={activateMutation.isPending}
      />

      <ConfirmDialog
        isOpen={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => cancelMutation.mutate()}
        title={`Cancel ${agreement.agreementNumber}?`}
        message={`Terminates the ${getName('agreement').toLowerCase()} mid-term (prorated refund handled per the contract). ${getName('work_order')} and invoice history are preserved. New ${getName('work_order', true).toLowerCase()} stop generating.`}
        confirmLabel={`Cancel ${getName('agreement').toLowerCase()}`}
        isDestructive
        isPending={cancelMutation.isPending}
      />

      <ConfirmDialog
        isOpen={confirmNoRenew}
        onClose={() => setConfirmNoRenew(false)}
        onConfirm={() => noRenewMutation.mutate()}
        title="Turn off auto-renew?"
        message={`The ${getName('agreement').toLowerCase()} will run to ${agreement.termEnd ? formatDay(agreement.termEnd) : 'the end of its term'} and then expire with no further action. No money moves now.`}
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

// One right-aligned metric in the header "this term" strip. `first` suppresses
// the leading divider so only the gaps between stats get one.
function HeaderStat({
  first,
  label,
  value,
  sub,
  extra,
  valueClassName,
}: {
  first?: boolean;
  label: string;
  value: React.ReactNode;
  sub: string;
  extra?: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start gap-4">
      {!first && <div className="w-px self-stretch bg-border" />}
      <div className="text-right sm:min-w-[112px]">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{label}</div>
        <div
          className={`mt-0.5 font-mono text-[18px] font-bold leading-none tabular-nums tracking-tight ${valueClassName ?? 'text-fg-strong'}`}
        >
          {value}
        </div>
        <div className="text-[10.5px] text-fg-muted">{sub}</div>
        {extra}
      </div>
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
  const { getName } = useGlossary();
  const { data: billing } = useQuery(agreementBillingQueryOptions(agreement.id));
  const { data: compliance } = useQuery(agreementComplianceQueryOptions(agreement.id));
  const { nextInvoice } = useAgreementBilling(agreement.id);

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
  // Contract value moved out of this meta line into the "this term" strip below.
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
          {agreement.kind === 'VISIT' && <Pill tone="neutral">{getName('work_order')}-based</Pill>}
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

      {(compliance || billing || nextInvoice) && (
        <div className="flex shrink-0 flex-wrap items-start justify-end gap-x-4 gap-y-2">
          {compliance && (
            <HeaderStat
              first
              label="This term"
              value={
                // Denominator = visitsExpectedThisTerm (the full-term total); null
                // on open-ended agreements → show the fulfilled count alone. The
                // inline-flex + gap keeps the slash off the numerals (a tight
                // bold-mono "0 / 6" otherwise reads as struck-through); the slash
                // itself is non-bold + dim so it recedes.
                <span className="inline-flex items-baseline gap-1">
                  {compliance.visitsFulfilled}
                  {compliance.visitsExpectedThisTerm != null && (
                    <>
                      <span className="font-normal text-fg-dim">/</span>
                      <span className="font-medium text-fg-dim">{compliance.visitsExpectedThisTerm}</span>
                    </>
                  )}
                </span>
              }
              sub={`${getName('work_order', true).toLowerCase()} complete${
                compliance.visitsExpectedThisTerm != null && compliance.visitsExpectedThisTerm > 0
                  ? ` · ${Math.round((compliance.visitsFulfilled / compliance.visitsExpectedThisTerm) * 100)}%`
                  : ''
              }`}
              extra={
                compliance.visitsOverdue + compliance.visitsMissed > 0 ? (
                  <div className="text-[10.5px] font-semibold text-warning-fg">
                    {compliance.visitsOverdue + compliance.visitsMissed} behind schedule
                  </div>
                ) : undefined
              }
            />
          )}
          {billing && (
            <HeaderStat
              first={!compliance}
              label="Contract value"
              value={
                arr != null ? (
                  <>
                    {formatCurrency(arr)}
                    <span className="font-medium text-fg-dim">/yr</span>
                  </>
                ) : (
                  `Per ${getName('work_order').toLowerCase()}`
                )
              }
              sub={`Billed ${cadenceLabel(billing.cadenceUnit, billing.cadenceInterval).toLowerCase()}${
                arr != null
                  ? ` · ${formatCount(periodsPerYear(billing.cadenceUnit, billing.cadenceInterval))} × ${formatCurrency(billing.amount)}`
                  : ''
              }`}
            />
          )}
          {nextInvoice && (
            <HeaderStat
              first={!compliance && !billing}
              label="Next invoice"
              valueClassName="text-fg-accent"
              value={formatCurrency(nextInvoice.amount)}
              sub={`${formatDayNoYear(nextInvoice.dueDate)} · ${nextInvoice.n} of ${nextInvoice.of}`}
            />
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
  const { getName } = useGlossary();
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
      title: `${compliance.visitsOverdue} ${getName('work_order', compliance.visitsOverdue !== 1).toLowerCase()} behind schedule`,
      sub: `Past the scheduling window without a completed ${getName('work_order').toLowerCase()}`,
      action: 'Schedule',
      onAction: onViewSchedule,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {isDraft && (
        <Callout
          kind="accent"
          title={`Draft — not generating ${getName('work_order', true).toLowerCase()} yet`}
          action={
            <Button size="xs" onClick={onActivate} disabled={!readyToActivate}>
              Activate
            </Button>
          }
        >
          <ul className="flex flex-col gap-0.5 text-[12px]">
            <li className={hasTemplates ? 'text-fg-muted' : 'text-fg'}>
              {hasTemplates ? '✓' : '○'} {getName('work_order')} template{hasTemplates ? ' set' : ' needed — add one in the Scope card →'}
            </li>
            <li className={hasCoverage ? 'text-fg-muted' : 'text-fg'}>
              {hasCoverage
                ? `✓ Coverage set (${agreement.coverageLocationCount})`
                : `○ Coverage needed — add ${getName('service_location', true).toLowerCase()} in the Coverage tab →`}
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
          <FinancialSnapshotCard agreement={agreement} />
        </div>
        <div className="flex flex-col gap-3">
          <ScopeCard agreementId={agreement.id} templates={agreement.visitTemplates} />
          <TermCard agreement={agreement} onEdit={onEdit} />
          <CustomerCard agreement={agreement} />
          <NotesCard entityType="agreement" entityId={agreement.id} />
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
  const { getName } = useGlossary();
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
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{getName('service_location', true)}</div>
          <div className="mt-0.5 text-[18px] font-bold leading-none tracking-tight text-fg-strong">
            <span className="font-mono tabular-nums">{agreement.coverageLocationCount}</span>
            {customerLocationCount != null && (
              <span className="text-[12px] font-medium text-fg-muted"> of {customerLocationCount}</span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-fg-muted">covered</div>
        </div>
        <div className="px-3.5 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{getName('work_order', true)} / yr</div>
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
          <span className="font-semibold text-fg-accent">Auto-extends ·</span> newly-matched {getName('service_location', true).toLowerCase()} join at the
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
  const { getName } = useGlossary();
  const rows = scheduled.slice(0, 3);
  return (
    <Card
      padding="none"
      title={<CardTitle icon={<CalendarDaysIcon className="size-3.5" />}>Next scheduled {getName('work_order', true).toLowerCase()}</CardTitle>}
      action={<CardLink onClick={onViewSchedule}>View schedule →</CardLink>}
    >
      {rows.length === 0 ? (
        <EmptyState compact title={`No ${getName('work_order', true).toLowerCase()} on the board`} description={`${getName('work_order', true)} appear here once their obligations materialize, ~45 days before each window.`} />
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

// Money summary · recognized/deferred · installment schedule · active + Edit.
// Plan provenance, collection method, and member pricing remain omitted — those
// backends don't exist yet.
function FinancialSnapshotCard({ agreement }: { agreement: AgreementResponse }) {
  const { getName } = useGlossary();
  const { data: billing, isLoading } = useQuery(agreementBillingQueryOptions(agreement.id));
  const { installments, nextInvoice } = useAgreementBilling(agreement.id);
  // Recognized/deferred — point-in-time. contractValue null = no billing → hide
  // the row (never show $0).
  const { data: revenue } = useQuery(agreementRevenueQueryOptions(agreement.id));
  const [setupOpen, setSetupOpen] = useState(false);

  const arr = billing ? computeArr(billing) : null;
  const perYear = billing ? periodsPerYear(billing.cadenceUnit, billing.cadenceInterval) : 0;
  // Recognized fills the bar; deferred is the remaining track (the two halves
  // sum to contract value). Guard a 0 contract value against divide-by-zero.
  const recognizedPct =
    revenue && revenue.contractValue
      ? Math.min(100, Math.max(0, Math.round((revenue.recognizedToDate / revenue.contractValue) * 100)))
      : 0;

  return (
    <>
      <Card
        padding={billing ? 'none' : undefined}
        title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Financials</CardTitle>}
        action={billing ? <CardLink onClick={() => setSetupOpen(true)}>Edit</CardLink> : undefined}
      >
        {isLoading ? (
          <div className="text-[12px] text-fg-muted">Loading…</div>
        ) : !billing ? (
          <EmptyState
            icon={<ReceiptPercentIcon className="size-9 text-fg-dim" />}
            title="No billing set up"
            description="Set the contract value and how it's invoiced. Installments generate automatically and flow into the Invoices tab."
            action={
              <Button color="accent" size="xs" onClick={() => setSetupOpen(true)}>
                Set up billing
              </Button>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-3 border-b border-border-soft">
              <FinCell k="Contract value" v={arr != null ? `${formatCurrency(arr)}/yr` : `Per ${getName('work_order').toLowerCase()}`} />
              <FinCell
                k="Cadence"
                v={cadenceLabel(billing.cadenceUnit, billing.cadenceInterval)}
                sub={arr != null ? `${formatCount(perYear)} × ${formatCurrency(billing.amount)}` : undefined}
                mono={false}
              />
              <FinCell
                k="Next invoice"
                v={nextInvoice ? formatCurrency(nextInvoice.amount) : '—'}
                sub={nextInvoice ? `${formatDayNoYear(nextInvoice.dueDate)} · ${nextInvoice.n} of ${nextInvoice.of}` : undefined}
                accent={!!nextInvoice}
                last
              />
            </div>
            {/* Billed ≠ earned — recognized accrues as work orders complete;
                recognized + deferred = contract value, shown as one two-part bar
                anchored to the same "N of M complete" the header trusts. */}
            {revenue != null && revenue.contractValue != null && (
              <div className="border-b border-border-soft px-3.5 py-3">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                    Revenue recognition
                  </span>
                  <span className="grow" />
                  <span className="text-[11px] text-fg-muted">
                    {`${revenue.visitsFulfilled}${
                      revenue.visitsExpectedThisTerm != null ? ` of ${revenue.visitsExpectedThisTerm}` : ''
                    } ${getName('work_order', true).toLowerCase()} complete`}
                  </span>
                </div>
                <div className="mb-2.5 flex h-[7px] overflow-hidden rounded bg-bg-active">
                  <div className="bg-success-500" style={{ width: `${recognizedPct}%` }} />
                </div>
                <div className="flex flex-wrap gap-x-7 gap-y-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[2px] bg-success-500" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Recognized to date</span>
                    </div>
                    <div className="font-mono text-[16px] font-bold tabular-nums text-fg-strong">
                      {formatCurrency(revenue.recognizedToDate)}
                    </div>
                    <div className="text-[11px] text-fg-muted">earned as {getName('work_order', true).toLowerCase()} complete</div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="size-2 rounded-[2px] border border-border-strong bg-bg-active" />
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Deferred</span>
                    </div>
                    <div className="font-mono text-[16px] font-bold tabular-nums text-fg-strong">
                      {formatCurrency(revenue.deferred)}
                    </div>
                    <div className="text-[11px] text-fg-muted">billed/scheduled, not yet earned</div>
                  </div>
                </div>
              </div>
            )}
            {installments.length > 0 && <InstallmentSchedule installments={installments} />}
            <div className="flex items-center gap-2 px-3.5 py-2">
              {billing.active ? (
                <Pill tone="success" dot>Active</Pill>
              ) : (
                <Pill tone="neutral" dot>Inactive</Pill>
              )}
              <span className="text-[11.5px] text-fg-muted">Net {billing.netDays} terms</span>
            </div>
          </>
        )}
      </Card>
      <BillingSetupDialog
        isOpen={setupOpen}
        onClose={() => setSetupOpen(false)}
        agreementId={agreement.id}
        billing={billing ?? undefined}
        defaultAnchorDate={agreement.termStart}
      />
    </>
  );
}

function FinCell({
  k,
  v,
  sub,
  last,
  mono = true,
  accent,
}: {
  k: string;
  v: string;
  sub?: string;
  last?: boolean;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`px-3.5 py-2.5 ${last ? '' : 'border-r border-border-soft'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{k}</div>
      <div
        className={`mt-0.5 text-[16px] font-bold tracking-tight ${accent ? 'text-fg-accent' : 'text-fg-strong'} ${mono ? 'font-mono tabular-nums' : ''}`}
      >
        {v}
      </div>
      {sub && <div className="text-[11px] tabular-nums text-fg-muted">{sub}</div>}
    </div>
  );
}

// Status dot for an installment row. Paid/Overdue/Billed come from the joined
// invoice; Next/Scheduled from the plan (Next = the upcoming SCHEDULED row).
function installmentPill(status: InstallmentDisplayStatus) {
  switch (status) {
    case 'PAID':
      return <Pill tone="success" dot>Paid</Pill>;
    case 'OVERDUE':
      return <Pill tone="danger" dot>Overdue</Pill>;
    case 'BILLED':
      return <Pill tone="info" dot>Billed</Pill>;
    case 'NEXT':
      return <Pill tone="accent" dot>Next</Pill>;
    default:
      return <Pill tone="neutral" dot>Scheduled</Pill>;
  }
}

// Full-term installment plan with real Paid/Billed dots overlaid from invoices.
// Capped for sidebar density; "Show all" expands in place.
function InstallmentSchedule({ installments }: { installments: EnrichedInstallment[] }) {
  const [showAll, setShowAll] = useState(false);
  const CAP = 6;
  const rows = showAll ? installments : installments.slice(0, CAP);
  return (
    <div className="border-b border-border-soft px-3.5 py-2.5">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
        Installment schedule
      </div>
      <div className="flex flex-col">
        {rows.map((it, i) => (
          <div
            key={it.periodKey}
            className={`flex items-center gap-2.5 py-1.5 ${i > 0 ? 'border-t border-border-soft' : ''}`}
          >
            <span className="w-4 shrink-0 text-[11px] tabular-nums text-fg-dim">{it.sequence}</span>
            <span className="shrink-0 text-[12px] text-fg">{formatDay(it.dueDate)}</span>
            <span className="shrink-0 text-[12px] font-semibold tabular-nums text-fg-strong">
              {formatCurrency(it.amount)}
            </span>
            <span className="grow" />
            {installmentPill(it.displayStatus)}
          </div>
        ))}
      </div>
      {installments.length > CAP && (
        <button onClick={() => setShowAll((s) => !s)} className="card-action mt-1.5">
          {showAll ? 'Show less' : `Show all ${installments.length}`}
        </button>
      )}
    </div>
  );
}

// The page's marquee — rebuilt on the real visit templates + scope items (the
// mock's plain-English Included/Excluded/SLA prose has no backing data).
// Editable: add / edit / delete the recurrence rules that drive generation.
function ScopeCard({ agreementId, templates }: { agreementId: string; templates: VisitTemplateResponse[] }) {
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<VisitTemplateResponse | null>(null);
  const [deleting, setDeleting] = useState<VisitTemplateResponse | null>(null);
  const woName = getName('work_order').toLowerCase();

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => agreementApi.deleteVisitTemplate(agreementId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] });
      setDeleting(null);
      showSuccess(`${getName('work_order')} template removed`);
    },
    onError: (err) => showError(`Couldn't remove ${woName} template`, extractApiError(err) ?? undefined),
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
      action={<CardLink onClick={openAdd}>+ Add {woName}</CardLink>}
    >
      {templates.length === 0 ? (
        <div className="px-3.5 py-3">
          <EmptyState
            compact
            title={`No ${woName} templates`}
            description={`Add a recurrence to start generating ${getName('work_order', true).toLowerCase()}.`}
            action={<Button outline size="xxs" onClick={openAdd}>{`Add ${woName} template`}</Button>}
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
                  <IconButton aria-label={`Edit ${woName} template`} onClick={() => openEdit(tpl)}>
                    <PencilIcon className="size-3.5" />
                  </IconButton>
                  <IconButton aria-label={`Remove ${woName} template`} onClick={() => setDeleting(tpl)}>
                    <TrashIcon className="size-3.5" />
                  </IconButton>
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-fg-muted">
                {tpl.windowDays}-day window
                {tpl.estDurationMinutes ? ` · ~${formatDuration(tpl.estDurationMinutes)} / ${woName}` : ''}
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
        message={`Stops generating future ${getName('work_order', true).toLowerCase()} from this template. Any already created are unaffected.`}
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
  const { getName } = useGlossary();
  return (
    <Card
      title={<CardTitle icon={<UserIcon className="size-3.5" />}>{getName('customer')}</CardTitle>}
      action={<CardLink to={`/customers/${agreement.customer.id}`}>Open {getName('customer').toLowerCase()} →</CardLink>}
    >
      <div className="text-[13px] font-semibold text-fg-strong">{agreement.customer.name}</div>
      <div className="mt-1.5 text-[11.5px] text-fg-muted">
        See the {getName('customer').toLowerCase()} page for the full {getName('agreement').toLowerCase()} portfolio and AR rollup.
      </div>
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
  const { getName } = useGlossary();
  return (
    <div className="mt-3.5 flex flex-col gap-3 rounded-[12px] border border-border bg-bg-elev px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-fg-strong">
          {disabled ? `${agreement.agreementNumber} is ${agreement.status.toLowerCase()}` : `End ${agreement.agreementNumber}`}
        </div>
        <div className="mt-0.5 text-[11.5px] text-fg-muted">
          Cancel terminates mid-term. Don&rsquo;t-renew lets it expire at term with no further action. Both preserve
          {' '}{getName('work_order').toLowerCase()} + invoice history.
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
          {`Cancel ${getName('agreement').toLowerCase()}`}
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
