// Dispatch board — the page. Owns date scope, region scope, search, density,
// grouping, the exception filters, the reads and the drawer; hands a uniform
// prop bag to whichever spine is mounted. Swapping the spine must never fork
// this file (handoff §3.2).
//
// Full-bleed operational surface: `AppLayout flush` drops the padded,
// max-width canvas so the three chrome bands can sit flush and only the
// board scrolls. Height comes from the house pattern used by SettingsLayout
// (`h-[calc(100svh-52px)]` — 52px is the desktop header).
//
// Until `GET /scheduling/board` exists server-side the read 404s and the
// board area shows its error state.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  dispatchBoardApi,
  dispatchRegionApi,
  type BoardDispatch,
  type BoardTech,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Pill } from '../components/ui/Pill';
import DispatchDetailDrawer from '../components/DispatchDetailDrawer';
import DispatchTimeline from '../components/dispatch/DispatchTimeline';
import {
  DENSITY_METRICS,
  autoDensityFor,
  type BoardGroup,
  type Density,
} from '../components/dispatch/spine';
import { buildAxis, zonedDate, zonedHour } from '../lib/boardTime';
import { isHiddenByDefault } from '../lib/dispatchStatus';

// The tenant's nominal working day. The axis widens to contain anything
// outside it (an overnight emergency must not be clipped) but never narrows.
const DAY_START = 6;
const DAY_END = 20;

type GroupBy = 'none' | 'region';

/** Grid filters. "Unassigned" is deliberately absent: unassigned work is not
 *  on the grid, so it was never a grid filter — the rail header carries that
 *  count instead. */
type ExceptionId = 'urgent' | 'unreleased' | 'noshow' | 'cancelled' | 'longdrive' | 'recurring';

const LONG_DRIVE_MINUTES = 30;

/** Selected filter chips take the `accent-soft` surface; unselected ones are
 *  outlined. Button's props are a union — color and outline are mutually
 *  exclusive — so the variant is chosen, not merged. */
function chipVariant(selected: boolean): { color: 'accent-soft' } | { outline: true } {
  return selected ? { color: 'accent-soft' } : { outline: true };
}

function todayLocal(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

// Day math on the date PARTS, via UTC, so a DST boundary can't shift the
// result by a day the way local-midnight arithmetic can.
function shiftDay(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function isValidDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export default function DispatchBoardPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search filters rows already on the board, so it stays local — unlike
  // date and region scope, which belong in a shareable link.
  const [search, setSearch] = useState('');
  const [densityPref, setDensityPref] = useState<Density | 'auto'>('auto');
  const [groupBy, setGroupBy] = useState<GroupBy>('region');
  const [hideEmpty, setHideEmpty] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionId[]>([]);
  const [openDispatch, setOpenDispatch] = useState<BoardDispatch | null>(null);

  const rawDate = searchParams.get('date');
  const date = isValidDate(rawDate) ? rawDate : todayLocal();
  const regionId = searchParams.get('region');

  const setParam = (key: string, value: string | null) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: false },
    );
  };

  // Region NAMES are not in scheduling-service — it holds only the
  // user↔region link. The board read returns ids; names come from here and
  // are joined client-side (handoff §2.2).
  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });

  const regionIds = useMemo(() => (regionId ? [regionId] : undefined), [regionId]);

  const {
    data: board,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dispatch-board', date, regionIds],
    queryFn: () => dispatchBoardApi.getBoard({ date, regionIds }),
  });

  const { data: unscheduled } = useQuery({
    queryKey: ['dispatch-board', 'unscheduled', regionIds],
    queryFn: () => dispatchBoardApi.getUnscheduled({ regionIds }),
  });

  // Straight off the response: this is the zone the server resolved `date`
  // in, so the axis and the day boundary can never disagree. Falls back to the
  // browser only before the first response lands.
  const timeZone = board?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const allTechs = useMemo(() => board?.techs ?? [], [board]);
  const allDispatches = useMemo(() => board?.dispatches ?? [], [board]);
  const railItems = useMemo(() => unscheduled?.content ?? [], [unscheduled]);

  const techs = useMemo(() => {
    if (!search.trim()) return allTechs;
    const q = search.trim().toLowerCase();
    return allTechs.filter((tech) => tech.name.toLowerCase().includes(q));
  }, [allTechs, search]);

  const techIds = useMemo(() => new Set(techs.map((tech) => tech.id)), [techs]);

  // Counts are computed over everything in scope, NOT over the filtered set:
  // a chip that renumbers itself as you filter can't be used to navigate.
  const counts = useMemo(() => {
    const inScope = allDispatches.filter((d) => techIds.has(d.assignedUserId));
    return {
      urgent: inScope.filter((d) => d.priority === 'URGENT').length,
      unreleased: inScope.filter((d) => d.releasedAt == null && d.status !== 'CANCELLED').length,
      noshow: inScope.filter((d) => d.status === 'NO_SHOW').length,
      cancelled: inScope.filter((d) => d.status === 'CANCELLED').length,
      longdrive: inScope.filter((d) => (d.driveMinFromPrev ?? 0) > LONG_DRIVE_MINUTES).length,
      recurring: inScope.filter((d) => d.recurring === true).length,
    } satisfies Record<ExceptionId, number>;
  }, [allDispatches, techIds]);

  const visibleDispatches = useMemo(() => {
    const showCancelled = exceptions.includes('cancelled');
    // CANCELLED isn't work, so it's hidden until asked for — but it explains
    // a hole in the day, so it stays reachable rather than being dropped.
    const active = exceptions.filter((id) => id !== 'cancelled');

    return allDispatches.filter((d) => {
      if (!techIds.has(d.assignedUserId)) return false;
      if (isHiddenByDefault(d.status) && !showCancelled) return false;
      if (active.length === 0) return true;
      return active.some((id) => {
        switch (id) {
          case 'urgent':
            return d.priority === 'URGENT';
          case 'unreleased':
            return d.releasedAt == null && d.status !== 'CANCELLED';
          case 'noshow':
            return d.status === 'NO_SHOW';
          case 'longdrive':
            return (d.driveMinFromPrev ?? 0) > LONG_DRIVE_MINUTES;
          case 'recurring':
            return d.recurring === true;
          default:
            return false;
        }
      });
    });
  }, [allDispatches, techIds, exceptions]);

  const byTech = useMemo(() => {
    const map: Record<string, BoardDispatch[]> = {};
    for (const d of visibleDispatches) {
      (map[d.assignedUserId] ??= []).push(d);
    }
    return map;
  }, [visibleDispatches]);

  // The fold is for AVAILABLE techs with an empty day. A tech with any
  // absence already has a distinct rendered state (hatched span, label);
  // folding them would conceal the operational fact that someone is out.
  const hasTimeOff = (tech: BoardTech) => (tech.timeOff?.length ?? 0) > 0;

  const foldableCount = useMemo(
    () =>
      techs.filter((tech) => !hasTimeOff(tech) && (byTech[tech.id] ?? []).length === 0).length,
    [techs, byTech],
  );

  const shownTechs = useMemo(
    () =>
      hideEmpty
        ? techs.filter((tech) => hasTimeOff(tech) || (byTech[tech.id] ?? []).length > 0)
        : techs,
    [techs, byTech, hideEmpty],
  );

  const regionName = (id: string | null) =>
    id ? (regions.find((r) => r.id === id)?.name ?? null) : null;

  // Grouping keys off PRIMARY region, because that is what produces a row
  // group. Filter visibility keys off coverage — the two sets are
  // deliberately different and can disagree.
  const primaryRegionIds = useMemo(
    () => new Set(techs.map((tech) => tech.primaryRegionId).filter((id): id is string => !!id)),
    [techs],
  );
  const coveredRegionIds = useMemo(
    () => new Set(techs.flatMap((tech) => tech.regionIds)),
    [techs],
  );

  const regionOptions = useMemo(
    () => regions.filter((r) => coveredRegionIds.has(r.id)),
    [regions, coveredRegionIds],
  );
  const showRegionFilter = regionOptions.length > 1;
  // Only offer grouping when more than one group would actually render.
  const showGroupingPicker = primaryRegionIds.size > 1;
  const showDensityPicker = shownTechs.length > 12;
  const showHideEmpty = foldableCount > 0;

  // A stale preference falls back to flat rather than silently grouping by a
  // control the user can no longer see.
  const effectiveGroupBy: GroupBy = showGroupingPicker ? groupBy : 'none';

  const autoDensity = autoDensityFor(shownTechs.length);
  const density: Density = densityPref === 'auto' ? autoDensity : densityPref;

  const groups = useMemo<BoardGroup[]>(() => {
    const summarize = (list: BoardTech[]) => ({
      stops: list.reduce((n, tech) => n + (byTech[tech.id] ?? []).length, 0),
      held: list.reduce(
        (n, tech) => n + (byTech[tech.id] ?? []).filter((d) => d.releasedAt == null).length,
        0,
      ),
    });

    if (effectiveGroupBy === 'none') {
      return [{ key: '__all', label: null, techs: shownTechs, ...summarize(shownTechs) }];
    }

    // Order follows the tenant's own region ordering, and a tech appears in
    // exactly one group — their primary.
    const ordered = regions.filter((r) => primaryRegionIds.has(r.id));
    const built = ordered.map((region) => {
      const list = shownTechs.filter((tech) => tech.primaryRegionId === region.id);
      return { key: region.id, label: region.name, techs: list, ...summarize(list) };
    });
    // Techs whose primary region isn't in the registry (or is null) still
    // need a row — never drop a person off the board.
    const orphans = shownTechs.filter(
      (tech) => !tech.primaryRegionId || !primaryRegionIds.has(tech.primaryRegionId),
    );
    if (orphans.length > 0) {
      built.push({
        key: '__unassigned',
        label: t('dispatchBoard.grid.noRegion'),
        techs: orphans,
        ...summarize(orphans),
      });
    }
    return built.filter((group) => group.techs.length > 0);
  }, [effectiveGroupBy, shownTechs, byTech, regions, primaryRegionIds, t]);

  // The axis widens to contain any window outside the working day.
  const axis = useMemo(() => {
    const windows = visibleDispatches
      .map((d) => ({
        start: zonedHour(d.arrivalWindowStart, timeZone),
        end: zonedHour(d.arrivalWindowEnd, timeZone),
      }))
      .filter((w): w is { start: number; end: number } => w.start !== null && w.end !== null);
    return buildAxis(DAY_START, DAY_END, windows);
  }, [visibleDispatches, timeZone]);

  // A now-line only means something on today's board — drawing one on
  // Thursday's board would be a lie.
  const nowHour = useMemo(() => {
    const now = new Date();
    if (zonedDate(now, timeZone) !== date) return null;
    return zonedHour(now.toISOString(), timeZone);
  }, [date, timeZone]);

  const hasFilters = Boolean(regionId || search.trim() || exceptions.length > 0);
  const clearFilters = () => {
    setSearch('');
    setExceptions([]);
    setParam('region', null);
  };

  const toggleException = (id: ExceptionId) =>
    setExceptions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const dispatchesLabel = getName('dispatch', true);
  const techLabel = getName('technician', true);

  const boardBody = () => {
    if (isLoading) return <LoadingState label={t('dispatchBoard.states.loading')} />;

    if (error) {
      return (
        <ErrorState
          title={t('dispatchBoard.states.errorTitle')}
          description={t('dispatchBoard.states.errorBody')}
          action={
            <Button size="xs" onClick={() => refetch()}>
              {t('common.actions.tryAgain')}
            </Button>
          }
        />
      );
    }

    // Structurally empty: no rows at all. Distinct from "nothing is scheduled
    // today" — that implies rows exist. Board rows come from roles marked
    // "performs field work", so this state names that rule rather than
    // diagnosing a cause: the client cannot tell a correctly-configured
    // tenant with no field staff from a cache that hasn't synced.
    if (allTechs.length === 0) {
      return (
        <EmptyState
          title={t('dispatchBoard.states.noTechsTitle', { entity: techLabel })}
          description={t('dispatchBoard.states.noTechsBody', {
            setting: t('roles.form.performsFieldWorkLabel'),
          })}
          action={
            <Button size="xs" onClick={() => navigate('/settings/access/roles')}>
              {t('dispatchBoard.states.noTechsAction')}
            </Button>
          }
        />
      );
    }

    if (shownTechs.length === 0) {
      return (
        <EmptyState
          title={t('dispatchBoard.states.emptyFilteredTitle', { entity: techLabel })}
          description={t('dispatchBoard.states.emptyFilteredBody')}
          action={
            <Button size="xs" onClick={clearFilters}>
              {t('dispatchBoard.states.clearFilters')}
            </Button>
          }
        />
      );
    }

    if (visibleDispatches.length === 0) {
      return hasFilters ? (
        <EmptyState
          title={t('dispatchBoard.states.emptyFilteredTitle', { entity: dispatchesLabel })}
          description={t('dispatchBoard.states.emptyFilteredBody')}
          action={
            <Button size="xs" onClick={clearFilters}>
              {t('dispatchBoard.states.clearFilters')}
            </Button>
          }
        />
      ) : (
        <EmptyState
          title={t('dispatchBoard.states.emptyTitle')}
          description={t('dispatchBoard.states.emptyBody', { entity: dispatchesLabel })}
        />
      );
    }

    return (
      <DispatchTimeline
        groups={groups}
        byTech={byTech}
        density={density}
        collapsed={collapsed}
        onToggleGroup={(key) =>
          setCollapsed((prev) =>
            prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
          )
        }
        onOpenDispatch={setOpenDispatch}
        axis={axis}
        nowHour={nowHour}
        capacityStops={board?.defaultStopsPerDay ?? null}
        timeZone={timeZone}
      />
    );
  };

  const chips: { id: ExceptionId; label: string }[] = [
    { id: 'urgent', label: t('dispatchBoard.chips.urgent') },
    { id: 'unreleased', label: t('dispatchBoard.chips.unreleased') },
    { id: 'noshow', label: t('dispatchBoard.chips.noshow') },
    { id: 'cancelled', label: t('dispatchBoard.chips.cancelled') },
    { id: 'longdrive', label: t('dispatchBoard.chips.longdrive') },
    { id: 'recurring', label: t('dispatchBoard.chips.recurring') },
  ];

  return (
    <AppLayout flush>
      <div className="db-page h-[calc(100svh-52px)] min-h-0 max-lg:h-auto">
        {/* ── Band 1 — identity and the scope of time ────────────── */}
        <div className="db-band">
          <div className="min-w-0">
            <Heading size="page-sm">
              {t('dispatchBoard.title', { entity: getName('dispatch') })}
            </Heading>
            <div className="text-[11.5px] text-fg-muted">
              {t('dispatchBoard.subtitleCount', { count: shownTechs.length, entity: techLabel })}
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Button
              plain
              size="xs"
              aria-label={t('dispatchBoard.dateNav.previous')}
              onClick={() => setParam('date', shiftDay(date, -1))}
            >
              <ChevronLeftIcon />
            </Button>
            <Button size="xs" onClick={() => setParam('date', null)}>
              {t('dispatchBoard.dateNav.today')}
            </Button>
            <Button
              plain
              size="xs"
              aria-label={t('dispatchBoard.dateNav.next')}
              onClick={() => setParam('date', shiftDay(date, 1))}
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </div>

        {/* ── Band 2 — who is on the board. Controls self-hide. ──── */}
        <div className="db-band sub">
          <ListToolbar
            className="mb-0 flex-1"
            search={
              <ListSearch
                placeholder={t('dispatchBoard.search.placeholder', {
                  entity: getName('technician'),
                })}
                value={search}
                onChange={setSearch}
              />
            }
          >
            {showRegionFilter && (
              <FilterChipListbox
                label={t('dispatchBoard.filter.region', { entity: getName('dispatch_region') })}
                ariaLabel={t('dispatchBoard.filter.region', { entity: getName('dispatch_region') })}
                value={regionId}
                displayValue={regionName(regionId)}
                resetLabel={t('dispatchBoard.filter.allRegions', {
                  entity: getName('dispatch_region', true),
                })}
                onChange={(id) => setParam('region', id)}
                onClear={() => setParam('region', null)}
              >
                {regionOptions.map((region) => (
                  <ChipListboxOption key={region.id} value={region.id}>
                    {region.name}
                  </ChipListboxOption>
                ))}
              </FilterChipListbox>
            )}

            {showGroupingPicker && (
              <FilterChipListbox
                label={t('dispatchBoard.filter.grouping')}
                ariaLabel={t('dispatchBoard.filter.grouping')}
                value={effectiveGroupBy}
                displayValue={
                  effectiveGroupBy === 'region'
                    ? t('dispatchBoard.filter.groupByRegion', {
                        entity: getName('dispatch_region'),
                      })
                    : null
                }
                onChange={(id) => setGroupBy((id as GroupBy) ?? 'none')}
                onClear={() => setGroupBy('none')}
              >
                <ChipListboxOption value="none">
                  {t('dispatchBoard.filter.groupByNone')}
                </ChipListboxOption>
                <ChipListboxOption value="region">
                  {t('dispatchBoard.filter.groupByRegion', { entity: getName('dispatch_region') })}
                </ChipListboxOption>
              </FilterChipListbox>
            )}

            {showDensityPicker && (
              <FilterChipListbox
                label={t('dispatchBoard.filter.density')}
                ariaLabel={t('dispatchBoard.filter.density')}
                value={densityPref}
                displayValue={
                  densityPref === 'auto' ? null : t(`dispatchBoard.density.${densityPref}`)
                }
                onChange={(id) => setDensityPref((id as Density | 'auto') ?? 'auto')}
                onClear={() => setDensityPref('auto')}
              >
                <ChipListboxOption value="auto">
                  {t('dispatchBoard.density.auto', { mode: t(`dispatchBoard.density.${autoDensity}`) })}
                </ChipListboxOption>
                {(Object.keys(DENSITY_METRICS) as Density[]).map((mode) => (
                  <ChipListboxOption key={mode} value={mode}>
                    {t(`dispatchBoard.density.${mode}`)}
                  </ChipListboxOption>
                ))}
              </FilterChipListbox>
            )}

            {showHideEmpty && (
              <Button
                size="xs"
                {...chipVariant(hideEmpty)}
                aria-pressed={hideEmpty}
                onClick={() => setHideEmpty((v) => !v)}
              >
                {`${t('dispatchBoard.filter.hideEmpty', { entity: techLabel.toLowerCase() })} (${foldableCount})`}
              </Button>
            )}
          </ListToolbar>
        </div>

        {/* ── Band 3 — exceptions as FILTERS, never as stat cards ── */}
        <div className="db-band sub">
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((chip) => {
              const on = exceptions.includes(chip.id);
              return (
                <Button
                  key={chip.id}
                  size="xxs"
                  {...chipVariant(on)}
                  aria-pressed={on}
                  onClick={() => toggleException(chip.id)}
                >
                  {chip.label}
                  <Badge color={on ? 'blue' : 'zinc'}>{String(counts[chip.id])}</Badge>
                </Button>
              );
            })}
            {exceptions.length > 0 && (
              <Button plain size="xxs" onClick={() => setExceptions([])}>
                {t('dispatchBoard.states.clearFilters')}
              </Button>
            )}
          </div>
        </div>

        {/* ── Body — unscheduled rail, then the board ────────────── */}
        <div className="db-body">
          <aside className="db-rail">
            <div className="db-rail-head">
              <span className="text-[10.5px] font-bold tracking-[0.06em] text-fg-muted uppercase">
                {t('dispatchBoard.rail.heading')}
              </span>
              <Pill tone={railItems.some((w) => w.priority === 'URGENT') ? 'danger' : 'neutral'}>
                {String(railItems.length)}
              </Pill>
            </div>
            <div className="border-b border-border-soft px-3 py-1.5 text-[10.5px] text-fg-muted">
              {t('dispatchBoard.rail.hint', {
                entity: getName('work_order'),
                tech: getName('technician'),
              })}
            </div>
            <div className="db-rail-list">
              {railItems.length === 0 ? (
                <EmptyState
                  compact
                  title={t('dispatchBoard.rail.emptyTitle')}
                  description={t('dispatchBoard.rail.emptyBody')}
                />
              ) : null}
            </div>
          </aside>

          <div className="db-board">
            <div className="db-scroll">{boardBody()}</div>
          </div>
        </div>
      </div>

      {/* The board owns no detail surface — it opens the existing drawer.
          Read-only for now: Release / Reassign / Reschedule are write paths
          that land with the interactions commit, and a drawer offering
          buttons that do nothing would be worse than one that doesn't. */}
      <DispatchDetailDrawer
        dispatch={openDispatch}
        readOnly
        onClose={() => setOpenDispatch(null)}
        onEdit={() => {}}
        onDelete={() => {}}
      />
    </AppLayout>
  );
}
