// The company's agreements, paged and sorted on the server, scoped like Home's
// Agreements card so its counts are this list's totals. Rows open the
// agreement. State lives in the URL (`q`, `status`, `renewing`, `sort`, `page`).
import { useDeferredValue } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { ArrowPathRoundedSquareIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
import { agreementApi, type AgreementOverviewResponse, type AgreementStatus } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useUrlPage } from '../../hooks/useUrlPage';
import { Button } from '../../components/catalyst/button';
import { Card, CardBody } from '../../components/ui/Card';
import { CellStack, CellSub, CellTop, DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { SortHeader, type SortDir } from '../../components/ui/SortHeader';
import { ListToolbar, ListSearch } from '../../components/ui/ListToolbar';
import { FilterChip, FilterChipRow } from '../../components/ui/FilterChipRow';
import { ChipListboxOption, FilterChipListbox } from '../../components/ui/FilterChipListbox';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Pill } from '../../components/ui/Pill';
import { extractApiError } from '../../lib/toast';
import {
  ANY_STATUS,
  DESC_FIRST,
  RENEWING_DAYS,
  STATUSES,
  STATUS_TONE,
  formatDay,
  listParams,
  parseSort,
  parseStatuses,
} from './agreementListModel';

const PAGE_SIZE = 50;
const DASH = '—';

export function AgreementsList({
  scope,
  overview,
  showMoney,
  scopeChip,
}: {
  scope: string[] | undefined;
  /** For the renewing chip's count; undefined while it loads. */
  overview: AgreementOverviewResponse | undefined;
  /** Monthly value is invoice money: shown with the invoice capability, as on Home. */
  showMoney: boolean;
  scopeChip: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageHref } = useUrlPage('page');

  // The box reads the URL itself; the query trails it so typing stays quick.
  const q = searchParams.get('q') ?? '';
  const deferredQ = useDeferredValue(q);
  const statusRaw = searchParams.getAll('status');
  const statuses = parseStatuses(statusRaw);
  const renewing = searchParams.get('renewing') === String(RENEWING_DAYS);
  const sortRaw = searchParams.get('sort');
  const sort = parseSort(sortRaw);

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
    update({ sort: key === 'customerName' && dir === 'asc' ? null : `${key},${dir}` });
  };

  const params = listParams({
    q: deferredQ,
    statuses,
    renewing,
    scope,
    sort: sortRaw,
    page,
    size: PAGE_SIZE,
  });
  const query = useQuery({
    queryKey: ['agreements', 'list', params],
    queryFn: () => agreementApi.listPage(params),
  });
  const data = query.data;
  const rows = data?.content ?? [];

  const statusName = (s: AgreementStatus) => t(`agreements.list.status.${s}`);
  const statusDisplay =
    statuses.length === 0
      ? null
      : statuses.length === 1
        ? statusName(statuses[0])
        : t('agreements.list.filters.statusCount', { count: statuses.length });
  const filtered = Boolean(deferredQ || renewing || statusRaw.length);
  const words = {
    agreement: getName('agreement'),
    agreements: getName('agreement', true),
    customer: getName('customer'),
    locations: getName('service_location', true),
  };

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
    body = filtered ? (
      <EmptyState
        icon={<ArrowPathRoundedSquareIcon className="size-10 text-fg-dim" />}
        title={t('common.actions.noMatchFilters', { entities: words.agreements })}
        description={t('common.actions.tryAdjustingFilters')}
        action={
          <Button outline onClick={() => update({ q: null, status: null, renewing: null })}>
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
                <SortHeader sortKey="agreementNumber" label={getName('agreement')} current={sort} onSort={onSort} />
                <SortHeader sortKey="customerName" label={getName('customer')} current={sort} onSort={onSort} />
                <th>{t('agreements.list.table.status')}</th>
                <SortHeader sortKey="termEnd" label={t('agreements.list.table.term')} current={sort} onSort={onSort} />
                <th className="right">{getName('service_location', true)}</th>
                <th>{t('agreements.list.table.nextVisit')}</th>
                <th className="right">{t('agreements.list.table.overdue')}</th>
                {showMoney && (
                  <SortHeader
                    sortKey="monthlyValue"
                    label={t('agreements.list.table.monthly')}
                    current={sort}
                    onSort={onSort}
                    align="right"
                  />
                )}
              </tr>
            </DenseTHead>
            <tbody>
              {rows.map((a) => (
                <DenseRow
                  key={a.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/agreements/${a.id}`)}
                  data-testid="agreement-row"
                >
                  <td>
                    <CellStack>
                      <CellTop>{a.name}</CellTop>
                      <CellSub>
                        <span className="font-mono">{a.agreementNumber}</span>
                      </CellSub>
                    </CellStack>
                  </td>
                  <td className="strong" data-label={getName('customer')}>
                    {a.customer?.name ?? DASH}
                  </td>
                  <td data-label={t('agreements.list.table.status')}>
                    <Pill tone={STATUS_TONE[a.status]} dot>
                      {statusName(a.status)}
                    </Pill>
                  </td>
                  <td data-label={t('agreements.list.table.term')}>
                    <CellStack>
                      <span className="num">
                        {a.termEnd ? formatDay(a.termEnd) : t('agreements.list.table.openEnded')}
                      </span>
                      {a.autoRenew && <span className="muted">{t('agreements.list.table.autoRenews')}</span>}
                    </CellStack>
                  </td>
                  <td className="right num" data-label={getName('service_location', true)}>
                    {a.coverageLocationCount}
                  </td>
                  <td className={clsx('num', !a.nextVisitDue && 'dt-empty')} data-label={t('agreements.list.table.nextVisit')}>
                    {formatDay(a.nextVisitDue) ?? <span className="text-fg-dim">{DASH}</span>}
                  </td>
                  <td
                    className={clsx('right num', a.overdueVisitCount > 0 ? 'strong text-danger-500' : 'dt-empty')}
                    data-label={t('agreements.list.table.overdue')}
                  >
                    {a.overdueVisitCount > 0 ? a.overdueVisitCount : <span className="text-fg-dim">{DASH}</span>}
                  </td>
                  {showMoney && (
                    <td
                      className={clsx('right num', a.monthlyValue == null && 'dt-empty')}
                      data-label={t('agreements.list.table.monthly')}
                    >
                      {a.monthlyValue != null ? (
                        formatCurrency(a.monthlyValue)
                      ) : (
                        <span className="text-fg-dim">{DASH}</span>
                      )}
                    </td>
                  )}
                </DenseRow>
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
            placeholder={t('agreements.list.search', { ...words, customer: words.customer.toLowerCase() })}
            value={q}
            onChange={(v) => update({ q: v || null }, true)}
          />
        }
      >
        {scopeChip}
        {!renewing && (
          <FilterChipListbox
            multiple
            label={t('agreements.list.table.status')}
            ariaLabel={t('agreements.list.table.status')}
            value={statuses}
            displayValue={statusDisplay}
            onChange={(v) => update({ status: v.length ? v : [ANY_STATUS] })}
            onClear={() => update({ status: [ANY_STATUS] })}
          >
            {STATUSES.map((s) => (
              <ChipListboxOption key={s} value={s}>
                {statusName(s)}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
        )}
        <FilterChipRow>
          <FilterChip
            label={t('agreements.list.filters.renewing', { days: RENEWING_DAYS })}
            count={overview?.renewingSoon.count}
            tone="warning"
            active={renewing}
            onToggle={() => update({ renewing: renewing ? null : String(RENEWING_DAYS) })}
          />
        </FilterChipRow>
      </ListToolbar>
      <Card>
        <CardBody flush>{body}</CardBody>
      </Card>
    </>
  );
}

