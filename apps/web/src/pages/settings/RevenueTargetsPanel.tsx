// Settings → Organization → Revenue Targets. One amount per calendar month,
// company-wide, a year at a time; they draw the target line on Home's revenue
// chart. A blank month has no target — it is never $0. Anyone who can see the
// Revenue tab can read them; editing takes MANAGE_REVENUE_TARGETS.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ExclamationTriangleIcon, PlusIcon } from '@heroicons/react/16/solid';
import { financialDashboardApi, revenueTargetsApi, type RevenueTargets } from '../../api/setup';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { useTenantTimeZone } from '../../hooks/useTenantTimeZone';
import { zonedDate } from '../../lib/boardTime';
import { errorCode, extractApiError, showError, showSuccess } from '../../lib/toast';
import { Button } from '../../components/catalyst/button';
import { Card } from '../../components/catalyst/card';
import { Select } from '../../components/catalyst/select';
import { PageHead } from '../../components/ui/PageHead';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { ToggleGroup, ToggleGroupOption } from '../../components/ui/ToggleGroup';
import { money } from '../../features/home/revenueSelectors';
import { monthShort } from '../../features/home/period';
import { QuickFill } from '../../features/revenueTargets/QuickFill';
import { TargetsTable } from '../../features/revenueTargets/TargetsTable';
import {
  EMPTY_YEAR,
  amountProblem,
  applyFill,
  changedMonths,
  countSet,
  isEmptyYear,
  monthStatus,
  monthlyActuals,
  sumSet,
  targetAmounts,
  type MonthAmounts,
} from '../../features/revenueTargets/targetModel';

// Past this many years the switcher becomes a select.
const MAX_TOGGLE_YEARS = 5;

/** The dashboard's period id for a whole year: "2026-YTD" while it's running. */
const yearPeriod = (year: number, currentYear: number) => (year === currentYear ? `${year}-YTD` : String(year));

/**
 * A year's actual revenue by month, from the Revenue tab's own read (same
 * cache key), so "actual" is exactly the number Home shows. Nothing before
 * the first invoice, nothing for a year that hasn't started.
 */
function useYearActuals(year: number, currentYear: number, firstInvoiceYear: number | null | undefined) {
  const enabled = firstInvoiceYear != null && year >= firstInvoiceYear && year <= currentYear;
  const id = yearPeriod(year, currentYear);
  const query = useQuery({
    queryKey: ['financial-dashboard', 'revenue', id],
    queryFn: () => financialDashboardApi.getRevenue({ period: id }),
    enabled,
  });
  return enabled && query.data ? monthlyActuals(query.data.billedByDay) : EMPTY_YEAR;
}

export default function RevenueTargetsPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useHasCapability('MANAGE_REVENUE_TARGETS');
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const currentYear = Number(today.slice(0, 4));
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = Number(searchParams.get('year'));

  // Every read carries the same firstInvoiceYear; this year's is the one most
  // likely cached (and is the same query when viewing this year).
  const range = useQuery({
    queryKey: ['revenue-targets', currentYear],
    queryFn: () => revenueTargetsApi.get(currentYear),
  });
  const earliest = range.data?.firstInvoiceYear ?? currentYear;
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= currentYear + 1 ? requested : currentYear;
  const years = useMemo(() => {
    const from = Math.min(earliest, year);
    return Array.from({ length: currentYear + 2 - from }, (_, i) => from + i);
  }, [earliest, year, currentYear]);

  const targets = useQuery({
    queryKey: ['revenue-targets', year],
    queryFn: () => revenueTargetsApi.get(year),
  });

  const [draft, setDraft] = useState<MonthAmounts | null>(null);
  const [serverProblem, setServerProblem] = useState<{ month: number; message: string } | null>(null);
  const editing = draft != null;

  // Last year's targets only feed the fill tools.
  const prevTargets = useQuery({
    queryKey: ['revenue-targets', year - 1],
    queryFn: () => revenueTargetsApi.get(year - 1),
    enabled: editing && year - 1 >= earliest,
  });
  const fiy = range.data?.firstInvoiceYear;
  const actuals = useYearActuals(year, currentYear, fiy);
  const prevActuals = useYearActuals(year - 1, currentYear, fiy);

  const saved = targetAmounts(targets.data);
  const changed = draft ? changedMonths(draft, saved) : [];
  const changedClosed = changed
    .map((c, i) => (c && monthStatus(year, i + 1, today) === 'closed' ? monthShort(i + 1) : null))
    .filter((m): m is string => m != null);
  const hasClosedMonths = monthStatus(year, 1, today) === 'closed';
  const invalid = draft?.some((v) => amountProblem(v) != null) ?? false;

  const save = useMutation({
    mutationFn: (months: MonthAmounts) =>
      revenueTargetsApi.replace(
        year,
        months.map((amount, i) => ({ month: i + 1, amount })),
      ),
    onSuccess: (data: RevenueTargets) => {
      queryClient.setQueryData(['revenue-targets', year], data);
      void queryClient.invalidateQueries({ queryKey: ['revenue-targets'] });
      setDraft(null);
      setServerProblem(null);
      showSuccess(t('settings.revenueTargets.saved', { year }));
    },
    onError: (err) => {
      // A month-level 400 goes on its row; anything else is a toast.
      const field = (err as { response?: { data?: { field?: string } } }).response?.data?.field;
      const month = field?.match(/^months\.(\d+)\.amount$/)?.[1];
      if (month) setServerProblem({ month: Number(month), message: extractApiError(err) ?? errorCode(err) ?? '' });
      else showError(t('settings.revenueTargets.saveFailed'), extractApiError(err));
    },
  });

  const selectYear = (y: number) => {
    const next = new URLSearchParams(searchParams);
    if (y === currentYear) next.delete('year');
    else next.set('year', String(y));
    setSearchParams(next, { replace: true });
  };
  const startEditing = () => {
    setServerProblem(null);
    setDraft([...saved]);
  };
  const setCell = (month: number, amount: number | null) => {
    if (serverProblem?.month === month) setServerProblem(null);
    setDraft((d) => (d ? d.map((v, i) => (i === month - 1 ? amount : v)) : d));
  };
  const fill = (values: (number | undefined)[], onlyOpen: boolean) =>
    setDraft((d) => (d ? applyFill(d, values, (m) => onlyOpen && monthStatus(year, m, today) === 'closed') : d));

  const yearSwitch =
    years.length > MAX_TOGGLE_YEARS ? (
      <Select
        size="xs"
        value={String(year)}
        disabled={editing}
        onChange={(e) => selectYear(Number(e.target.value))}
        aria-label={t('settings.revenueTargets.yearLabel')}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    ) : (
      <ToggleGroup
        value={String(year)}
        onChange={(v) => selectYear(Number(v))}
        aria-label={t('settings.revenueTargets.yearLabel')}
      >
        {years.map((y) => (
          <ToggleGroupOption key={y} value={String(y)} disabled={editing && y !== year}>
            {y}
          </ToggleGroupOption>
        ))}
      </ToggleGroup>
    );

  let body;
  if (targets.isLoading) body = <LoadingState />;
  else if (targets.isError || !targets.data)
    body = (
      <ErrorState
        title={t('settings.revenueTargets.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void targets.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (!editing && isEmptyYear(saved))
    body = (
      <div className="rt-empty" data-testid="targets-empty">
        <div className="rt-empty-title">
          {t(year < currentYear ? 'settings.revenueTargets.empty.pastTitle' : 'settings.revenueTargets.empty.title', { year })}
        </div>
        <div className="rt-empty-body">
          {t(year < currentYear ? 'settings.revenueTargets.empty.pastBody' : 'settings.revenueTargets.empty.body', {
            year,
            prev: year - 1,
          })}
        </div>
        {canManage && (
          <Button color="accent" size="xs" onClick={startEditing}>
            <PlusIcon />
            {t('settings.revenueTargets.empty.start', { year })}
          </Button>
        )}
      </div>
    );
  else
    body = (
      <>
        {draft && (
          <QuickFill
            key={year}
            year={year}
            prevActuals={prevActuals}
            prevTargets={targetAmounts(prevTargets.data)}
            hasClosedMonths={hasClosedMonths}
            onFill={fill}
          />
        )}
        {changedClosed.length > 0 && (
          <div className="rt-warn" role="status">
            <ExclamationTriangleIcon className="size-3.5" />
            <span>{t('settings.revenueTargets.closedWarning', { count: changedClosed.length, months: changedClosed.join(', ') })}</span>
          </div>
        )}
        <div className="rt-table-wrap">
          <TargetsTable
            year={year}
            today={today}
            values={draft ?? saved}
            prevActuals={prevActuals}
            actuals={actuals}
            editing={editing}
            onCell={setCell}
            changed={changed}
            serverProblem={serverProblem}
          />
        </div>
      </>
    );

  const provenance = targets.data?.updatedAt
    ? t('settings.revenueTargets.lastChanged', {
        name: targets.data.updatedByName ?? t('settings.revenueTargets.formerUser'),
        date: new Date(targets.data.updatedAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }),
      })
    : t('settings.revenueTargets.notSet');

  return (
    <>
      <PageHead title={t('settings.revenueTargets.title')} sub={t('settings.revenueTargets.sub')} actions={yearSwitch} />
      <Card
        className="rt-card"
        padding="none"
        title={t('settings.revenueTargets.cardTitle', { year })}
        subtitle={editing ? t('settings.revenueTargets.editHint') : provenance}
        action={
          !editing &&
          canManage &&
          targets.data &&
          !isEmptyYear(saved) && (
            <Button outline size="xs" onClick={startEditing}>
              {t('common.edit')}
            </Button>
          )
        }
        footer={
          draft && (
            <div className="rt-card-foot">
              <span className="rt-foot-note">
                {t('settings.revenueTargets.footer', { count: countSet(draft), amount: money(sumSet(draft)) })}
              </span>
              <span className="grow" />
              <Button plain size="xs" onClick={() => setDraft(null)} disabled={save.isPending}>
                {t('common.cancel')}
              </Button>
              <Button
                color="accent"
                size="xs"
                onClick={() => save.mutate(draft)}
                disabled={save.isPending || invalid || !changed.some(Boolean)}
              >
                {save.isPending ? t('common.saving') : t('settings.revenueTargets.save')}
              </Button>
            </div>
          )
        }
      >
        {body}
      </Card>
    </>
  );
}
