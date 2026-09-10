// Dispatch board — the page. Owns date scope, region scope, search, the
// reads, and the drawer; hands a uniform prop bag to whichever spine is
// mounted. Swapping the spine must never fork this file (handoff §3.2).
//
// Full-bleed operational surface: `AppLayout flush` drops the padded,
// max-width canvas so the three chrome bands can sit flush and only the
// board scrolls. Height comes from the house pattern used by SettingsLayout
// (`h-[calc(100svh-52px)]` — 52px is the desktop header).
//
// This commit lands the route, the chrome, the rail and the states. The
// timeline spine renderer follows; until `GET /scheduling/board` exists
// server-side the read 404s and the board area shows its error state, which
// is why the route is not linked from the sidebar yet.
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { dispatchBoardApi, dispatchRegionApi } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Pill } from '../components/ui/Pill';

// ── Date scope ───────────────────────────────────────────────────────
// The board is day-bounded. The date rides in the URL as a plain
// YYYY-MM-DD so "look at Thursday in East Valley" is a shareable link, and
// the SERVER resolves it to an instant range in the TENANT's timezone
// (handoff §2.0a). We only ever hand it a calendar date — never an instant —
// precisely so the browser's zone can't decide where the day boundary falls.

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

  // Search stays local — it filters rows already on the board, so it has no
  // business in a shareable link the way date and region scope do.
  const [search, setSearch] = useState('');

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

  const techs = useMemo(() => {
    const all = board?.techs ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((tech) => tech.name.toLowerCase().includes(q));
  }, [board?.techs, search]);

  const dispatches = board?.dispatches ?? [];
  const railItems = unscheduled?.content ?? [];

  // Self-hide: the region control renders only when more than one region is
  // COVERED by the board's techs — coverage, not primary, so filtering to a
  // region still finds the tech who merely covers it (handoff §3.1).
  const coveredRegionIds = useMemo(
    () => new Set((board?.techs ?? []).flatMap((tech) => tech.regionIds)),
    [board?.techs],
  );
  const regionOptions = useMemo(
    () => regions.filter((r) => coveredRegionIds.has(r.id)),
    [regions, coveredRegionIds],
  );
  const showRegionFilter = regionOptions.length > 1;

  const hasFilters = Boolean(regionId || search.trim());
  const clearFilters = () => {
    setSearch('');
    setParam('region', null);
  };

  const regionName = regionId ? (regions.find((r) => r.id === regionId)?.name ?? null) : null;

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
    if (techs.length === 0) {
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

    if (dispatches.length === 0) {
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

    // Timeline spine renderer lands next.
    return null;
  };

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
              {t('dispatchBoard.subtitleCount', { count: techs.length, entity: techLabel })}
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
                placeholder={t('dispatchBoard.search.placeholder', { entity: getName('technician') })}
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
                displayValue={regionName}
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
          </ListToolbar>
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
    </AppLayout>
  );
}
