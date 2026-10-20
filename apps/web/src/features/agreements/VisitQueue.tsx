// Visits to schedule: agreement visits due soon (overdue included) with no
// live dispatch, oldest window first — Home's attention row, as a worklist.
// Schedule opens the visit's work order with the dispatch form already open;
// back returns here. A visit whose work order the nightly job hasn't created
// yet can't be scheduled, and the frontend never creates one.
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { titleCaseAddress } from '@dispatch/utils';
import { CalendarDaysIcon } from '@heroicons/react/24/outline';
import { agreementApi, type UnscheduledVisit } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useUrlPage } from '../../hooks/useUrlPage';
import { withBackContext } from '../../lib/backContext';
import { Button } from '../../components/catalyst/button';
import { Card, CardBody } from '../../components/ui/Card';
import { CellStack, CellSub, CellTop, DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { ListToolbar } from '../../components/ui/ListToolbar';
import { ChipListboxOption, FilterChipListbox } from '../../components/ui/FilterChipListbox';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Pill } from '../../components/ui/Pill';
import { extractApiError } from '../../lib/toast';
import { formatWindowDates, windowState } from './agreementListModel';

export const VISITS_PAGE_PARAM = 'visitsPage';
const PAGE_SIZE = 50;
const DASH = '—';
/** Home's window first; the longer ones are for planning ahead. */
const WITHIN = [7, 14, 30] as const;
const DEFAULT_WITHIN = 7;

export function VisitQueue({
  scope,
  today,
  scopeChip,
}: {
  scope: string[] | undefined;
  today: string;
  scopeChip: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [searchParams, setSearchParams] = useSearchParams();
  const { page, pageHref } = useUrlPage(VISITS_PAGE_PARAM);
  const withinRaw = Number(searchParams.get('within'));
  const within = (WITHIN as readonly number[]).includes(withinRaw) ? withinRaw : DEFAULT_WITHIN;

  const setWithin = (v: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (v && Number(v) !== DEFAULT_WITHIN) next.set('within', v);
    else next.delete('within');
    next.delete(VISITS_PAGE_PARAM);
    setSearchParams(next, { replace: true });
  };

  const query = useQuery({
    queryKey: ['agreements', 'visits-unscheduled', within, scope, page],
    queryFn: () =>
      agreementApi.unscheduledVisits({ withinDays: within, regionIds: scope, page: page - 1, size: PAGE_SIZE }),
  });
  const data = query.data;
  const rows = data?.content ?? [];
  // Schedule's back link returns to this tab as it is now.
  const backQuery = searchParams.toString();

  const words = {
    agreement: getName('agreement'),
    agreements: getName('agreement', true),
    dispatch: getName('dispatch'),
    workOrder: getName('work_order'),
  };

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError || !data)
    body = (
      <ErrorState
        title={t('agreements.visits.loadFailed')}
        description={extractApiError(query.error) ?? undefined}
        action={
          <Button outline onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (rows.length === 0)
    body = (
      <EmptyState
        icon={<CalendarDaysIcon className="size-10 text-fg-dim" />}
        title={t('agreements.visits.empty.title')}
        description={t('agreements.visits.empty.body', { days: within, dispatch: words.dispatch.toLowerCase() })}
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
                <th>{t('agreements.visits.table.window')}</th>
                <th>{t('agreements.visits.table.visit')}</th>
                <th>{getName('customer')}</th>
                <th>{getName('service_location')}</th>
                <th>{getName('work_order')}</th>
                <th aria-hidden />
              </tr>
            </DenseTHead>
            <tbody>
              {rows.map((v) => (
                <VisitRow key={v.obligationId} visit={v} today={today} backQuery={backQuery} words={words} />
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
      <ListToolbar>
        {scopeChip}
        <FilterChipListbox
          label={t('agreements.visits.filters.within')}
          ariaLabel={t('agreements.visits.filters.within')}
          value={String(within)}
          displayValue={t('agreements.visits.filters.days', { count: within })}
          onChange={setWithin}
        >
          {WITHIN.map((d) => (
            <ChipListboxOption key={d} value={String(d)}>
              {t('agreements.visits.filters.days', { count: d })}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      </ListToolbar>
      <Card>
        <CardBody flush>{body}</CardBody>
      </Card>
    </>
  );
}

function VisitRow({
  visit: v,
  today,
  backQuery,
  words,
}: {
  visit: UnscheduledVisit;
  today: string;
  backQuery: string;
  words: { agreement: string; dispatch: string; workOrder: string };
}) {
  const { t } = useTranslation();
  const state = windowState(v.windowStart, v.windowEnd, today);
  const loc = v.serviceLocation;
  const address = [loc.streetAddress, loc.city]
    .filter(Boolean)
    .map((x) => titleCaseAddress(x))
    .join(', ');
  const woHref = v.workOrderId ? withBackContext(`/work-orders/${v.workOrderId}`, 'agreements', backQuery) : null;

  return (
    <DenseRow data-testid="visit-row">
      <td>
        <CellStack>
          <span className="num strong">{formatWindowDates(v.windowStart, v.windowEnd, today)}</span>
          {state.kind === 'overdue' ? (
            <span>
              <Pill tone="danger">{t('agreements.visits.state.overdue', { count: state.days })}</Pill>
            </span>
          ) : (
            <span className="muted">
              {state.kind === 'open'
                ? t('agreements.visits.state.open', { count: state.days })
                : t('agreements.visits.state.upcoming', { count: state.days })}
            </span>
          )}
        </CellStack>
      </td>
      <td data-label={t('agreements.visits.table.visit')}>
        <CellStack>
          <CellTop>
            <Link to={`/agreements/${v.agreementId}`} className="text-fg-accent hover:underline">
              {v.agreementName}
            </Link>
          </CellTop>
          <CellSub>
            <span className="font-mono">{v.agreementNumber}</span>
            {v.visitTemplateLabel && ` · ${v.visitTemplateLabel}`}
          </CellSub>
        </CellStack>
      </td>
      <td className="strong">{v.customer?.name ?? DASH}</td>
      <td>
        {loc.name || address ? (
          <CellStack>
            {loc.name && <span>{loc.name}</span>}
            {address && <span className="muted">{address}</span>}
          </CellStack>
        ) : (
          <span className="text-fg-dim">{DASH}</span>
        )}
      </td>
      <td>
        {woHref && v.workOrderNumber ? (
          <Link to={woHref} className="font-mono text-fg-accent hover:underline">
            {v.workOrderNumber}
          </Link>
        ) : (
          <span className="text-fg-dim">{DASH}</span>
        )}
      </td>
      <td className="right">
        {woHref ? (
          <Button outline size="xs" href={`${woHref}&schedule=new`}>
            {t('agreements.visits.schedule')}
          </Button>
        ) : (
          <span className="muted" title={t('agreements.visits.pendingHint', { workOrder: words.workOrder.toLowerCase() })}>
            {t('agreements.visits.pending', { workOrder: words.workOrder })}
          </span>
        )}
      </td>
    </DenseRow>
  );
}
