/* eslint-disable i18next/no-literal-string -- dense settings admin surface; entity names go through getName(), "Plan" + short labels stay literal (no glossary key for plan; same convention as CompanyProfilePanel). */
import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PlusIcon,
  PencilSquareIcon,
  ArchiveBoxArrowDownIcon,
  ArrowUturnLeftIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import {
  agreementPlanApi,
  type AgreementPlanResponse,
  type CadenceUnit,
  type ListAgreementPlansParams,
  type MemberBenefits,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { useUrlPage } from '../../hooks/useUrlPage';
import { PageHead } from '../../components/ui/PageHead';
import { Card, CardBody } from '../../components/ui/Card';
import { DenseTable, DenseTHead, DenseRow } from '../../components/ui/DenseTable';
import { SortHeader, type SortState } from '../../components/ui/SortHeader';
import { ListFooter } from '../../components/ui/ListFooter';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { Pill } from '../../components/ui/Pill';
import { Callout } from '../../components/ui/Callout';
import { Button } from '../../components/catalyst/button';
import { Switch } from '../../components/catalyst/switch';
import IconButton from '../../components/IconButton';
import ConfirmDialog from '../../components/ConfirmDialog';
import AgreementPlanFormDialog from '../../components/AgreementPlanFormDialog';
import { showSuccess, showError, extractApiError } from '../../lib/toast';

const PAGE_SIZE = 25;

const CADENCE_ADVERB: Record<CadenceUnit, string> = {
  WEEK: 'weekly',
  MONTH: 'monthly',
  QUARTER: 'quarterly',
  YEAR: 'annually',
};
const PERIODS_PER_YEAR: Record<CadenceUnit, number> = { WEEK: 52, MONTH: 12, QUARTER: 4, YEAR: 1 };

const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Number.isInteger(n) ? 0 : 2,
  }).format(n);

// "$1,200/yr · quarterly" — annualize the per-period amount (ARR framing) when a
// cadence is set, else show the raw amount / cadence alone.
function defaultsLabel(p: AgreementPlanResponse): string {
  const cadence = p.defaultCadenceUnit
    ? p.defaultCadenceInterval === 1
      ? CADENCE_ADVERB[p.defaultCadenceUnit]
      : `every ${p.defaultCadenceInterval} ${p.defaultCadenceUnit.toLowerCase()}s`
    : null;
  let amt: string | null = null;
  if (p.defaultAmount != null) {
    if (p.defaultCadenceUnit) {
      const perYear = PERIODS_PER_YEAR[p.defaultCadenceUnit] / (p.defaultCadenceInterval || 1);
      amt = `${money(p.defaultAmount * perYear)}/yr`;
    } else {
      amt = money(p.defaultAmount);
    }
  }
  return [amt, cadence].filter(Boolean).join(' · ') || '—';
}

// Compact "included terms" join for the list row (the detail card shows the full chips).
function benefitsSummary(b?: MemberBenefits): string {
  if (!b) return '';
  const parts: string[] = [];
  if (b.coveredPmVisits != null && b.coveredPmVisits > 0) parts.push(`${b.coveredPmVisits} PM`);
  if (b.tripFeeWaived) parts.push('trip waived');
  if (b.laborDiscountPct != null && b.laborDiscountPct > 0) parts.push(`${b.laborDiscountPct}% labor`);
  if (b.partsDiscountPct != null && b.partsDiscountPct > 0) parts.push(`${b.partsDiscountPct}% parts`);
  if (b.priorityDispatch) parts.push('priority');
  return parts.join(' · ');
}

export default function AgreementPlansPanel() {
  const { getName } = useGlossary();
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const { page, pageHref, resetPage } = useUrlPage('plansPage');
  const deferredSearch = useDeferredValue(search.trim());

  const [formState, setFormState] = useState<{ plan: AgreementPlanResponse | null } | null>(null);
  const [archiving, setArchiving] = useState<AgreementPlanResponse | null>(null);

  // Sorting toggles direction; name opens asc, amount opens desc. Any change
  // resets to page 1 (server pages are zero-based).
  const onSort = (key: string) => {
    setSort((s) =>
      key === s.key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
    resetPage();
  };

  const params: ListAgreementPlansParams = {
    search: deferredSearch || undefined,
    // Default = active/sellable only; "Show archived" omits active to show all.
    active: showArchived ? undefined : true,
    sortBy: sort.key as ListAgreementPlansParams['sortBy'],
    sortDir: sort.dir,
    page: page - 1, // local state 1-based; backend Page 0-based
    size: PAGE_SIZE,
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ['agreement-plans', params],
    queryFn: () => agreementPlanApi.getAll(params),
  });

  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const showingStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const showingEnd = Math.min(page * PAGE_SIZE, total);

  const archiveMutation = useMutation({
    mutationFn: (id: string) => agreementPlanApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-plans'] });
      setArchiving(null);
      showSuccess('Plan archived');
    },
    onError: (err) => showError("Couldn't archive plan", extractApiError(err) ?? undefined),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => agreementPlanApi.update(id, { active: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-plans'] });
      showSuccess('Plan restored');
    },
    onError: (err) => showError("Couldn't restore plan", extractApiError(err) ?? undefined),
  });

  return (
    <>
      <PageHead
        title="Plans"
        sub={`Reusable ${getName('agreement').toLowerCase()} templates — member benefits, billing, and term defaults a sale starts from.`}
        actions={
          canEdit ? (
            <Button color="accent" size="xs" onClick={() => setFormState({ plan: null })}>
              <PlusIcon className="size-4" />
              New plan
            </Button>
          ) : undefined
        }
      />

      {error ? (
        <Callout kind="danger" title="Couldn't load plans">
          {extractApiError(error) ?? (error as Error).message}
        </Callout>
      ) : (
        <div className="flex flex-col gap-2.5">
          {/* Toolbar — debounced search + archived scope. Both reset to page 1. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-8 min-w-[220px] max-w-[360px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
              <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder="Search plans…"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch('');
                    resetPage();
                  }}
                  className="px-1 text-[11px] text-fg-dim hover:text-fg-strong"
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <Switch
                checked={showArchived}
                onChange={(v) => {
                  setShowArchived(v);
                  resetPage();
                }}
                aria-label="Show archived plans"
              />
              <span className="text-[12.5px] text-fg-muted">Show archived</span>
            </label>
          </div>

          <Card>
            <CardBody flush>
              {isLoading ? (
                <LoadingState label="Loading plans…" />
              ) : rows.length === 0 ? (
                <EmptyState
                  title={deferredSearch ? 'No matching plans' : 'No plans yet'}
                  description={
                    deferredSearch
                      ? 'Adjust your search or clear it to see all plans.'
                      : `Create a plan to sell ${getName('agreement', true).toLowerCase()} from a reusable template — member benefits snapshot onto each sale.`
                  }
                  action={
                    deferredSearch ? (
                      <Button plain size="xs" onClick={() => { setSearch(''); resetPage(); }}>Clear search</Button>
                    ) : canEdit ? (
                      <Button color="accent" size="xs" onClick={() => setFormState({ plan: null })}>New plan</Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <DenseTable>
                      <DenseTHead>
                        <tr>
                          <SortHeader sortKey="name" label="Plan" current={sort} onSort={onSort} />
                          <SortHeader sortKey="defaultAmount" label="Billing default" current={sort} onSort={onSort} />
                          <th>Member benefits</th>
                          <th>Status</th>
                          {canEdit && <th className="right">Actions</th>}
                        </tr>
                      </DenseTHead>
                      <tbody>
                        {rows.map((plan) => {
                          const benefits = benefitsSummary(plan.benefits);
                          return (
                            <DenseRow key={plan.id} className={!plan.active ? 'opacity-55' : undefined}>
                              <td className="strong">
                                <div className="text-fg-strong">{plan.name}</div>
                                {/* Classification only — every v1 plan is work-order-based. */}
                                <div className="text-[11px] text-fg-muted">
                                  {plan.classification === 'CONTRACT' ? 'Contract' : 'Internal'}
                                </div>
                              </td>
                              <td className="muted tabular-nums">{defaultsLabel(plan)}</td>
                              <td className="muted">{benefits || <span className="text-fg-dim">None</span>}</td>
                              <td>
                                {plan.active ? (
                                  <Pill tone="success" dot live>Active</Pill>
                                ) : (
                                  <Pill tone="neutral" dot>Archived</Pill>
                                )}
                              </td>
                              {canEdit && (
                                <td className="right">
                                  <div className="flex items-center justify-end gap-1">
                                    <IconButton aria-label="Edit plan" onClick={() => setFormState({ plan })}>
                                      <PencilSquareIcon className="size-4" />
                                    </IconButton>
                                    {plan.active ? (
                                      <IconButton aria-label="Archive plan" onClick={() => setArchiving(plan)}>
                                        <ArchiveBoxArrowDownIcon className="size-4" />
                                      </IconButton>
                                    ) : (
                                      <IconButton aria-label="Restore plan" onClick={() => restoreMutation.mutate(plan.id)}>
                                        <ArrowUturnLeftIcon className="size-4" />
                                      </IconButton>
                                    )}
                                  </div>
                                </td>
                              )}
                            </DenseRow>
                          );
                        })}
                      </tbody>
                    </DenseTable>
                  </div>
                  <ListFooter
                    page={page}
                    totalPages={totalPages}
                    pageHref={pageHref}
                    left={`Showing ${showingStart.toLocaleString()}–${showingEnd.toLocaleString()} of ${total.toLocaleString()}`}
                  />
                </>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      <AgreementPlanFormDialog
        isOpen={formState !== null}
        onClose={() => setFormState(null)}
        plan={formState?.plan ?? undefined}
      />
      <ConfirmDialog
        isOpen={archiving !== null}
        onClose={() => setArchiving(null)}
        onConfirm={() => archiving && archiveMutation.mutate(archiving.id)}
        title={archiving ? `Archive “${archiving.name}”?` : ''}
        message={`Archived plans can't be sold from new ${getName('agreement', true).toLowerCase()}. Existing ${getName('agreement', true).toLowerCase()} keep the benefits they were sold with. You can restore it later.`}
        confirmLabel="Archive"
        isDestructive
      />
    </>
  );
}
