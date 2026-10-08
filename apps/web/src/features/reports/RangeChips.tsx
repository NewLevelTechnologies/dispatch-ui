// The analysis reports' shared header parts: the back link (to Reports, or to
// Home when Home sent you) and the Range · Compare · Scope chips.
import { Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ArrowLeftIcon } from '@heroicons/react/16/solid';
import { dispatchRegionApi } from '../../api/setup';
import { DateRangeChip } from '../../components/ui/DateRangeChip';
import { ChipListboxOption, ChipListboxSection, FilterChipListbox } from '../../components/ui/FilterChipListbox';
import { parsePeriod, periodGroups, periodName } from '../home/period';
import { COMPARES } from './revenueModel';
import { CUSTOM_RANGE, type ReportRangeState } from './useReportRange';

export function ReportBackLink({ state }: { state: ReportRangeState }) {
  const { t } = useTranslation();
  return (
    <RouterLink to={state.fromHome ? state.homeHref : '/reports'} className="rp-back">
      <ArrowLeftIcon className="size-3.5" />
      {state.fromHome ? t('reports.range.backHome') : t('reports.title')}
    </RouterLink>
  );
}

/** Range (with custom dates), Compare, and Scope when there's more than one region. */
export function RangeChips({ state }: { state: ReportRangeState }) {
  const { t } = useTranslation();
  const { range, today, compare, regionId } = state;
  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });

  return (
    <>
      <FilterChipListbox
        label={t('reports.range.filters.range')}
        ariaLabel={t('reports.range.filters.range')}
        value={range.kind === 'custom' ? CUSTOM_RANGE : range.id}
        displayValue={range.kind === 'custom' ? t('reports.range.filters.custom') : periodName(range.period)}
        onChange={state.pickRange}
      >
        {periodGroups(today).map((group) => (
          <ChipListboxSection key={group.id} label={t(`dashboard.period.groups.${group.id}`)}>
            {group.options.map((option) => (
              <ChipListboxOption key={option.id} value={option.id}>
                {periodName(parsePeriod(option.id)!)}
                {option.hint && <span className="text-fg-muted"> · {t(`dashboard.period.hints.${option.hint}`)}</span>}
              </ChipListboxOption>
            ))}
          </ChipListboxSection>
        ))}
        <ChipListboxSection label={t('reports.range.filters.customGroup')}>
          <ChipListboxOption value={CUSTOM_RANGE}>{t('reports.range.filters.customOption')}</ChipListboxOption>
        </ChipListboxSection>
      </FilterChipListbox>
      {range.kind === 'custom' && (
        <DateRangeChip
          label={t('reports.range.filters.dates')}
          ariaLabel={t('reports.range.filters.dates')}
          value={state.customDraft ?? { from: range.from, to: range.to }}
          onChange={state.setCustom}
        />
      )}
      <FilterChipListbox
        label={t('reports.range.filters.compare')}
        ariaLabel={t('reports.range.filters.compare')}
        value={compare}
        displayValue={t(`reports.range.compare.${compare}`)}
        onChange={state.pickCompare}
      >
        {COMPARES.map((c) => (
          <ChipListboxOption key={c} value={c}>
            {t(`reports.range.compare.${c}`)}
          </ChipListboxOption>
        ))}
      </FilterChipListbox>
      {regions.length > 1 && (
        <FilterChipListbox
          label={regionId ? t('dashboard.scope.label') : t('dashboard.scope.labelAll')}
          ariaLabel={t('dashboard.scope.label')}
          value={regionId}
          displayValue={regions.find((r) => r.id === regionId)?.name ?? null}
          resetLabel={t('dashboard.scope.all')}
          onChange={(id) => state.update({ region: id })}
          onClear={() => state.update({ region: null })}
        >
          {regions.map((r) => (
            <ChipListboxOption key={r.id} value={r.id}>
              {r.name}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>
      )}
    </>
  );
}

/** The custom-range problem under the chips, if any. */
export function RangeProblem({ state }: { state: ReportRangeState }) {
  const { t } = useTranslation();
  if (!state.customProblem) return null;
  return (
    <p className="rp-filter-error" role="alert">
      {t(`reports.range.filters.problem.${state.customProblem}`)}
    </p>
  );
}
