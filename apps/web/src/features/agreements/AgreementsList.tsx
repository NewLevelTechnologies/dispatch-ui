// The company's agreements, paged and sorted on the server, scoped like Home's
// Agreements card so its counts are this list's totals. Rows open the
// agreement. State lives in the URL (`q`, `status`, `plan`, `renewing`,
// `visits`, `billing`, `sort`, `page`); the chips' counts are the facets read
// for the same filters.
import { useDeferredValue, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency, titleCaseAddress } from '@dispatch/utils';
import { ArrowPathRoundedSquareIcon, EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { agreementApi, agreementPlanApi, type AgreementListRow, type AgreementStatus } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useUrlPage } from '../../hooks/useUrlPage';
import { withBackContext } from '../../lib/backContext';
import { Button } from '../../components/catalyst/button';
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from '../../components/catalyst/dropdown';
import IconButton from '../../components/IconButton';
import ConfirmDialog from '../../components/ConfirmDialog';
import { Card, CardBody } from '../../components/ui/Card';
import { CellStack, CellSub, CellTop, DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { SortHeader, type SortDir } from '../../components/ui/SortHeader';
import { ListToolbar, ListSearch } from '../../components/ui/ListToolbar';
import { FilterChip, FilterChipRow } from '../../components/ui/FilterChipRow';
import { ChipListboxOption, FilterChipListbox } from '../../components/ui/FilterChipListbox';
import { StatusPickerChip } from '../../components/ui/StatusPickerChip';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Pill } from '../../components/ui/Pill';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import {
  ANY_STATUS,
  CLEAR_FILTERS,
  DESC_FIRST,
  NO_PLAN,
  RENEWING_DAYS,
  STATUSES,
  cadenceSuffix,
  daysUntil,
  formatDay,
  formatWindowDates,
  hasNarrowing,
  isEnded,
  listParams,
  parseFilters,
  parseSort,
} from './agreementListModel';

const PAGE_SIZE = 50;
const DASH = '—';

export function AgreementsList({
  scope,
  today,
  zone,
  showMoney,
  scopeChip,
}: {
  scope: string[] | undefined;
  today: string;
  zone: string;
  /** Monthly value is invoice money: shown with the invoice capability, as on Home. */
  showMoney: boolean;
  scopeChip: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageHref } = useUrlPage('page');
  const [cancelling, setCancelling] = useState<AgreementListRow | null>(null);

  // The box reads the URL itself; the query trails it so typing stays quick.
  const q = searchParams.get('q') ?? '';
  const filters = parseFilters(searchParams, useDeferredValue(q));
  const sortRaw = searchParams.get('sort');
  const sort = parseSort(sortRaw, filters.renewing);

  const update = (changes: Record<string, string | string[] | null>, replace = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(changes)) {
      next.delete(k);
      if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
      else if (v) next.set(k, v);
    }
    next.delete('page');
    setSearchParams(next, { replace });
  };
  const onSort = (key: string) => {
    const dir: SortDir =
      key === sort.key ? (sort.dir === 'asc' ? 'desc' : 'asc') : DESC_FIRST.has(key) ? 'desc' : 'asc';
    const fallback = parseSort(null, filters.renewing);
    update({ sort: key === fallback.key && dir === fallback.dir ? null : `${key},${dir}` });
  };

  const params = listParams(filters, { scope, sort: sortRaw, page, size: PAGE_SIZE });
  const query = useQuery({
    queryKey: ['agreements', 'list', params],
    queryFn: () => agreementApi.listPage(params),
  });
  // Counts follow the filters, not the page or sort.
  const facetParams = { ...params, sort: undefined, page: undefined, size: undefined };
  const { data: facets } = useQuery({
    queryKey: ['agreements', 'facets', facetParams],
    queryFn: () => agreementApi.facets(facetParams),
  });
  // Archived plans still name the agreements sold from them.
  const { data: plans = [] } = useQuery({
    queryKey: ['agreement-plans', { size: 200 }],
    queryFn: () => agreementPlanApi.getAll({ size: 200, sortBy: 'name', sortDir: 'asc' }),
    select: (p) => p.content,
  });

  const queryClient = useQueryClient();
  const cancelMutation = useMutation({
    mutationFn: (a: AgreementListRow) => agreementApi.cancel(a.id),
    onSuccess: (_r, a) => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      queryClient.invalidateQueries({ queryKey: ['agreement', a.id] });
      showSuccess(t('agreements.list.menu.cancelled', { number: a.agreementNumber }));
      setCancelling(null);
    },
    onError: (err) =>
      showError(
        t('agreements.list.menu.cancelFailed', { agreement: getName('agreement').toLowerCase() }),
        extractApiError(err) ?? undefined,
      ),
  });

  const data = query.data;
  const rows = data?.content ?? [];
  // Rows return to the list as it is now.
  const backQuery = searchParams.toString();
  const open = (id: string, extra = '') => navigate(`${withBackContext(`/agreements/${id}`, 'agreements', backQuery)}${extra}`);

  const words = {
    agreement: getName('agreement'),
    agreements: getName('agreement', true),
    customer: getName('customer'),
    location: getName('service_location'),
    locations: getName('service_location', true),
    workOrder: getName('work_order'),
  };
  const statusName = (s: AgreementStatus) => t(`agreements.list.status.${s}`);
  const narrowed = hasNarrowing(filters);
  const clearFilters = () => update({ ...CLEAR_FILTERS });

  const planName = filters.plan === NO_PLAN ? t('agreements.list.filters.planCustom') : plans.find((p) => p.id === filters.plan)?.name;

  let body;
  if (query.isLoading) body = <LoadingState label={t('common.actions.loading', { entities: words.agreements })} />;
  else if (query.isError || !data)
    body = (
      <ErrorState
        title={t('common.actions.couldNotLoad', { entities: words.agreements })}
        description={extractApiError(query.error) ?? undefined}
        action={
          <Button outline onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (rows.length === 0)
    body =
      narrowed || searchParams.has('status') ? (
        <EmptyState
          icon={<ArrowPathRoundedSquareIcon className="size-10 text-fg-dim" />}
          title={t('common.actions.noMatchFilters', { entities: words.agreements })}
          description={t('common.actions.tryAdjustingFilters')}
          action={
            <Button outline onClick={() => update({ ...CLEAR_FILTERS, status: null })}>
              {t('agreements.list.filters.clear')}
            </Button>
          }
        />
      ) : (
        <EmptyState
          icon={<ArrowPathRoundedSquareIcon className="size-10 text-fg-dim" />}
          title={t('common.actions.noEntitiesYet', { entities: words.agreements })}
          description={t('agreements.list.emptyHint', { ...words, customer: words.customer.toLowerCase() })}
        />
      );
  else {
    const start = data.number * data.size + 1;
    body = (
      <>
        <div className="overflow-x-auto">
          <DenseTable className="dense-stack">
            <DenseTHead>
              <tr>
                <SortHeader sortKey="agreementNumber" label={words.agreement} current={sort} onSort={onSort} />
                <SortHeader sortKey="customerName" label={words.customer} current={sort} onSort={onSort} />
                <th>{t('agreements.list.table.status')}</th>
                {showMoney && (
                  <SortHeader
                    sortKey="monthlyValue"
                    label={t('agreements.list.table.value')}
                    current={sort}
                    onSort={onSort}
                    align="right"
                  />
                )}
                <th className="ag-col-visits">{t('agreements.list.table.visits')}</th>
                <th>{t('agreements.list.table.nextVisit')}</th>
                <SortHeader sortKey="termEnd" label={t('agreements.list.table.renews')} current={sort} onSort={onSort} />
                <th aria-hidden />
              </tr>
            </DenseTHead>
            <tbody>
              {rows.map((a) => (
                <AgreementRow
                  key={a.id}
                  a={a}
                  today={today}
                  zone={zone}
                  showMoney={showMoney}
                  words={words}
                  onOpen={(extra) => open(a.id, extra)}
                  onCancel={() => setCancelling(a)}
                />
              ))}
            </tbody>
          </DenseTable>
        </div>
        <ListFooter
          page={page}
          totalPages={data.totalPages}
          pageHref={pageHref}
          left={t('common.pagination.showing', {
            start,
            end: start + rows.length - 1,
            total: data.totalElements.toLocaleString(),
          })}
        />
      </>
    );
  }

  return (
    <>
      <ListToolbar
        search={
          <ListSearch
            placeholder={t('agreements.list.search', {
              agreement: words.agreement.toLowerCase(),
              customer: words.customer.toLowerCase(),
              location: words.location.toLowerCase(),
            })}
            value={q}
            onChange={(v) => update({ q: v || null }, true)}
          />
        }
      >
        {scopeChip}
        <StatusPickerChip
          label={t('agreements.list.table.status')}
          options={STATUSES.map((s) => ({ id: s, label: statusName(s), count: facets?.statusCounts[s] }))}
          selected={filters.statuses.length ? filters.statuses : STATUSES}
          onChange={(next) => update({ status: next.length === STATUSES.length ? [ANY_STATUS] : next })}
          allLabel={t('agreements.list.filters.statusAll')}
          allShortcutLabel={t('agreements.list.filters.statusAllShortcut', { agreements: words.agreements.toLowerCase() })}
        />
        {plans.length > 0 && (
          <FilterChipListbox
            label={t('agreements.list.filters.plan')}
            ariaLabel={t('agreements.list.filters.plan')}
            value={filters.plan}
            displayValue={planName ?? null}
            resetLabel={t('agreements.list.filters.planAny')}
            onChange={(v) => update({ plan: v })}
            onClear={() => update({ plan: null })}
          >
            {plans.map((p) => (
              <ChipListboxOption key={p.id} value={p.id}>
                {p.name}
              </ChipListboxOption>
            ))}
            <ChipListboxOption value={NO_PLAN}>{t('agreements.list.filters.planCustom')}</ChipListboxOption>
          </FilterChipListbox>
        )}
        <FilterChipRow>
          <FilterChip
            label={t('agreements.list.filters.renewing', { days: RENEWING_DAYS })}
            count={facets?.renewing}
            active={filters.renewing}
            onToggle={() => update({ renewing: filters.renewing ? null : String(RENEWING_DAYS) })}
          />
          <FilterChip
            label={t('agreements.list.filters.visitsBehind')}
            count={facets?.visitsBehind}
            tone="warning"
            dot
            active={filters.visitsBehind}
            onToggle={() => update({ visits: filters.visitsBehind ? null : 'behind' })}
          />
          <FilterChip
            label={t('agreements.list.filters.noBilling')}
            count={facets?.noBilling}
            active={filters.noBilling}
            onToggle={() => update({ billing: filters.noBilling ? null : 'none' })}
          />
        </FilterChipRow>
        {narrowed && (
          <Button plain size="xs" onClick={clearFilters}>
            {t('agreements.list.filters.clear')}
          </Button>
        )}
      </ListToolbar>
      <Card>
        <CardBody flush>{body}</CardBody>
      </Card>
      <ConfirmDialog
        isOpen={cancelling !== null}
        onClose={() => setCancelling(null)}
        onConfirm={() => cancelling && cancelMutation.mutate(cancelling)}
        title={t('agreements.list.menu.cancelTitle', { number: cancelling?.agreementNumber ?? '' })}
        message={t('agreements.list.menu.cancelBody', {
          agreement: words.agreement.toLowerCase(),
          workOrder: words.workOrder,
          workOrders: getName('work_order', true).toLowerCase(),
        })}
        confirmLabel={t('agreements.list.menu.cancelConfirm', { agreement: words.agreement.toLowerCase() })}
        isDestructive
        isPending={cancelMutation.isPending}
      />
    </>
  );
}

type Words = { agreement: string; customer: string; locations: string; workOrder: string };

function AgreementRow({
  a,
  today,
  zone,
  showMoney,
  words,
  onOpen,
  onCancel,
}: {
  a: AgreementListRow;
  today: string;
  zone: string;
  showMoney: boolean;
  words: Words;
  onOpen: (extra?: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const ended = isEnded(a.status);
  // Billing can be set up while it's in force or still a draft.
  const needsBilling = !a.billing && (a.status === 'ACTIVE' || a.status === 'DRAFT');
  const where = a.primaryLocation
    ? [a.primaryLocation.streetAddress, a.primaryLocation.city]
        .filter(Boolean)
        .map((x) => titleCaseAddress(x!))
        .join(', ')
    : null;

  return (
    <DenseRow className="cursor-pointer" onClick={() => onOpen()} data-testid="agreement-row">
      <td className={clsx(ended && 'ag-dim')}>
        <CellStack>
          <CellTop>{a.name}</CellTop>
          <CellSub>
            <span className="font-mono">{a.agreementNumber}</span>
            {a.plan && ` · ${t('agreements.list.cell.plan', { plan: a.plan.name })}`}
          </CellSub>
        </CellStack>
      </td>
      <td className={clsx(ended && 'ag-dim')} data-label={words.customer}>
        <CellStack>
          <CellTop className="ag-plain">{a.customer?.name ?? DASH}</CellTop>
          <CellSub>
            {a.coverageLocationCount === 1
              ? where || t('agreements.list.cell.locations', { count: 1, locations: words.locations.toLowerCase() })
              : t('agreements.list.cell.locations', {
                  count: a.coverageLocationCount,
                  locations: words.locations.toLowerCase(),
                })}
          </CellSub>
        </CellStack>
      </td>
      <td data-label={t('agreements.list.table.status')}>
        <StatusPill status={a.status} />
      </td>
      {showMoney && (
        <td className="right" data-label={t('agreements.list.table.value')}>
          <div className="cell-stack ag-end">
            <CellTop className={clsx('num', ended && 'ag-muted')}>
              {a.monthlyValue != null ? (
                <>
                  {formatCurrency(a.monthlyValue)}
                  <span className="ag-unit">{t('agreements.list.cell.perMonth')}</span>
                </>
              ) : (
                <span className="ag-unit">{DASH}</span>
              )}
            </CellTop>
            {a.billing ? (
              <CellSub className="num">
                {formatCurrency(a.billing.amount)} {cadenceSuffix(a.billing.cadenceUnit, a.billing.cadenceInterval)}
              </CellSub>
            ) : needsBilling ? (
              <CellSub className="ag-warn">{t('agreements.list.cell.noBilling')}</CellSub>
            ) : null}
          </div>
        </td>
      )}
      <td className="ag-col-visits" data-label={t('agreements.list.table.visits')}>
        <VisitsCell a={a} ended={ended} />
      </td>
      <td data-label={t('agreements.list.table.nextVisit')}>
        <NextVisitCell a={a} today={today} zone={zone} />
      </td>
      <td data-label={t('agreements.list.table.renews')}>
        <RenewsCell a={a} today={today} />
      </td>
      <td className="right" onClick={(e) => e.stopPropagation()}>
        <Dropdown>
          <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
            <EllipsisVerticalIcon className="size-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={() => onOpen()}>
              <DropdownLabel>{t('agreements.list.menu.open')}</DropdownLabel>
            </DropdownItem>
            {needsBilling && (
              <DropdownItem onClick={() => onOpen('&billing=setup')}>
                <DropdownLabel>{t('agreements.list.menu.setUpBilling')}</DropdownLabel>
              </DropdownItem>
            )}
            {!ended && (
              <>
                <DropdownDivider />
                <DropdownItem onClick={onCancel}>
                  <DropdownLabel className="text-danger-500">{t('agreements.list.menu.cancel')}</DropdownLabel>
                </DropdownItem>
              </>
            )}
          </DropdownMenu>
        </Dropdown>
      </td>
    </DenseRow>
  );
}

function StatusPill({ status }: { status: AgreementStatus }) {
  const { t } = useTranslation();
  const label = t(`agreements.list.status.${status}`);
  switch (status) {
    case 'ACTIVE':
      return (
        <Pill tone="success" dot>
          {label}
        </Pill>
      );
    case 'SUSPENDED':
      return (
        <Pill tone="warning" dot>
          {label}
        </Pill>
      );
    case 'EXPIRED':
      return (
        <Pill tone="neutral" dot>
          {label}
        </Pill>
      );
    case 'CANCELLED':
      // The closed treatment: struck through, the same as a closed status elsewhere.
      return (
        <Pill tone="neutral" className="ag-cancelled">
          {label}
        </Pill>
      );
    default:
      return <Pill tone="neutral">{label}</Pill>;
  }
}

function VisitsCell({ a, ended }: { a: AgreementListRow; ended: boolean }) {
  const { t } = useTranslation();
  const v = a.visitsThisTerm;
  if (!v || v.planned === 0)
    return (
      <span className="ag-note">
        {a.status === 'DRAFT' ? DASH : t('agreements.list.cell.noPlannedVisits')}
      </span>
    );
  const behind = a.overdueVisitCount;
  const pct = Math.min(100, Math.round((v.completed / v.planned) * 100));
  return (
    <CellStack>
      <CellTop className="ag-visits">
        <span className="ag-prog" aria-hidden>
          <span className={clsx(ended ? 'ended' : behind > 0 && 'behind')} style={{ width: `${pct}%` }} />
        </span>
        <span className="ag-visits-count num">
          <strong>{v.completed}</strong> {t('agreements.list.cell.visitsOf', { planned: v.planned })}
        </span>
      </CellTop>
      {ended ? (
        <CellSub>{t('agreements.list.cell.finalTerm')}</CellSub>
      ) : behind > 0 ? (
        <CellSub className="ag-warn">{t('agreements.list.cell.behind', { count: behind })}</CellSub>
      ) : (
        <CellSub>{t('agreements.list.cell.onTrack')}</CellSub>
      )}
    </CellStack>
  );
}

function NextVisitCell({ a, today, zone }: { a: AgreementListRow; today: string; zone: string }) {
  const { t } = useTranslation();
  const n = a.nextVisit;
  if (!n) return <span className="text-fg-dim">{DASH}</span>;
  // Work orders are made ahead of each window; past that line the visit is
  // only planned.
  if (!n.workOrderId)
    return (
      <CellStack>
        <CellTop className="ag-plain num">{formatWindowDates(n.windowStart, n.windowEnd, today)}</CellTop>
        <CellSub>{t('agreements.list.cell.notGenerated')}</CellSub>
      </CellStack>
    );
  const wo = <span className="font-mono">{n.workOrderNumber}</span>;
  if (!n.dispatch)
    return (
      <CellStack>
        <CellTop className="ag-warn">{t('agreements.list.cell.unscheduled')}</CellTop>
        <CellSub>
          {wo} · {t('agreements.list.cell.dueBy', { date: shortDay(n.windowEnd, today) })}
        </CellSub>
      </CellStack>
    );
  return (
    <CellStack>
      <CellTop className="ag-plain num">{zonedShortDay(n.dispatch.scheduledStart, zone, today)}</CellTop>
      <CellSub>
        {wo} · {n.dispatch.technicianName ?? t('agreements.list.cell.unassigned')}
      </CellSub>
    </CellStack>
  );
}

function RenewsCell({ a, today }: { a: AgreementListRow; today: string }) {
  const { t } = useTranslation();
  if (a.status === 'EXPIRED' || a.status === 'CANCELLED')
    return (
      <span className="ag-note">
        {a.endedOn
          ? t(a.status === 'EXPIRED' ? 'agreements.list.cell.endedOn' : 'agreements.list.cell.cancelledOn', {
              date: formatDay(a.endedOn),
            })
          : DASH}
      </span>
    );
  if (a.status === 'DRAFT') {
    const started = formatDay(a.createdAt.slice(0, 10));
    return (
      <span className="ag-note">
        {a.createdByName
          ? t('agreements.list.cell.startedBy', { name: a.createdByName, date: started })
          : t('agreements.list.cell.started', { date: started })}
      </span>
    );
  }
  if (!a.termEnd) return <span className="ag-note">{t('agreements.list.table.openEnded')}</span>;
  const days = daysUntil(a.termEnd, today);
  const how =
    a.autoRenew == null ? null : a.autoRenew ? t('agreements.list.table.autoRenews') : t('agreements.list.cell.manualRenewal');
  // Nothing expires an agreement on its own, so a term can run past its end.
  if (days < 0)
    return (
      <CellStack>
        <CellTop className="ag-plain num">{formatDay(a.termEnd)}</CellTop>
        <CellSub className="ag-warn">{t('agreements.list.cell.termPassed')}</CellSub>
      </CellStack>
    );
  const soon = days <= RENEWING_DAYS;
  return (
    <CellStack>
      <CellTop className="ag-plain num">{formatDay(a.termEnd)}</CellTop>
      {(soon || how) && (
        <CellSub className={clsx(soon && (a.autoRenew ? 'ag-accent' : 'ag-warn'))}>
          {[soon ? t('agreements.list.cell.renewsIn', { count: days }) : null, how].filter(Boolean).join(' · ')}
        </CellSub>
      )}
    </CellStack>
  );
}

/** "Oct 9", with the year when it isn't this one. */
function shortDay(day: string, today: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(day.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** An instant's day in the company's zone, as {@link shortDay}. */
function zonedShortDay(iso: string, zone: string, today: string): string {
  const d = new Date(iso);
  const year = d.toLocaleDateString('en-US', { year: 'numeric', timeZone: zone });
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(year !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    timeZone: zone,
  });
}
