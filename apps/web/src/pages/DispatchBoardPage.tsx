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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  dispatchBoardApi,
  dispatchRegionApi,
  divisionsApi,
  workOrderApi,
  type BoardDispatch,
  type BoardWeekTech,
  type UnscheduledWorkOrder,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import { ListToolbar, ListSearch } from '../components/ui/ListToolbar';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Pill } from '../components/ui/Pill';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import ConfirmDialog from '../components/ConfirmDialog';
import DispatchDetailDrawer, { type DispatchSeed } from '../components/DispatchDetailDrawer';
import DispatchFormDrawer from '../components/DispatchFormDrawer';
import DispatchTimeline from '../components/dispatch/DispatchTimeline';
import DispatchWeek from '../components/dispatch/DispatchWeek';
import BlockContextMenu, { type BlockMenu } from '../components/dispatch/BlockContextMenu';
import UnscheduledRailCard from '../components/dispatch/UnscheduledRailCard';
import {
  DENSITY_METRICS,
  autoDensityFor,
  type BoardGroup,
  type Density,
} from '../components/dispatch/spine';
import { buildAxis, formatWindow, zonedDate, zonedHour } from '../lib/boardTime';
import { buildGroups, foldEmptyRows } from '../lib/boardGroups';
import { withBackContext } from '../lib/backContext';
import { movedWindow } from '../lib/boardDrop';
import { useBoardMutations } from './dispatch/useBoardMutations';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { invalidateDispatchBoard } from '../utils/invalidateRoleConsumers';
import { isHiddenByDefault } from '../lib/dispatchStatus';

// The tenant's nominal working day. The axis widens to contain anything
// outside it (an overnight emergency must not be clipped) but never narrows.
// Poll cadence. 30s is the handoff's number: fast enough that a second
// dispatcher's change lands before it matters, slow enough that a 60-tech
// board isn't refetching a few hundred rows constantly. If that payload gets
// heavy the answer is a delta endpoint, not a longer interval.
const BOARD_POLL_MS = 30_000;

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

// Weeks run Monday–Sunday: the weekend belongs at the END of a work week, and
// the backend deliberately takes whatever first day the client hands it rather
// than imposing one.
function weekStartOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const weekday = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - weekday);
  return d.toISOString().slice(0, 10);
}

// Bare YYYY-MM-DD parsed as UTC and formatted in UTC: handing a bare date to
// `new Date()` shifts it a day for anyone west of Greenwich, which would label
// the board with the wrong day.
const DAY_LABEL = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});
const RANGE_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

function asUtc(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function formatBoardDate(date: string): string {
  return DAY_LABEL.format(asUtc(date));
}

function formatDayRange(days: string[]): string {
  if (days.length === 0) return '';
  const first = RANGE_LABEL.format(asUtc(days[0]));
  const last = RANGE_LABEL.format(asUtc(days[days.length - 1]));
  return `${first} – ${last}`;
}

function isValidDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export default function DispatchBoardPage() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const [menu, setMenu] = useState<BlockMenu | null>(null);
  const [composeFor, setComposeFor] = useState<UnscheduledWorkOrder | null>(null);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [editDispatch, setEditDispatch] = useState<DispatchSeed | null>(null);

  // A working day is wider than any viewport at 78px/hour, so dragging toward
  // a late-afternoon lane means dragging off-screen. Auto-scroll is the one
  // part of this genuinely painful to hand-roll on two axes.
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    return autoScrollForElements({ element: el });
  }, []);

  // Dragging a block back to the rail unschedules it — the inverse of the
  // gesture that put it on the board. Registered here rather than in the
  // spine because the rail isn't part of any spine.
  const railRef = useRef<HTMLElement>(null);
  const [railOver, setRailOver] = useState(false);
  const unscheduleRef = useRef<(payload: Record<string, unknown>) => void>(() => {});
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      // Only a scheduled block can come back; a rail card dragged onto the
      // rail is a no-op, not an error.
      canDrop: ({ source }) => source.data?.dispatchId != null,
      onDragEnter: () => setRailOver(true),
      onDragLeave: () => setRailOver(false),
      onDrop: ({ source }) => {
        setRailOver(false);
        unscheduleRef.current(source.data);
      },
    });
  }, []);

  const rawDate = searchParams.get('date');
  const date = isValidDate(rawDate) ? rawDate : todayLocal();
  const regionId = searchParams.get('region');
  // Granularity, in the URL like every other scope — "show me next week in
  // East Valley" has to be a link someone can send.
  const isWeek = searchParams.get('view') === 'week';
  const weekStart = weekStartOf(date);

  const setParams = (values: Record<string, string | null>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(values)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace: false },
    );
  };

  const setParam = (key: string, value: string | null) => setParams({ [key]: value });

  // Region NAMES are not in scheduling-service — it holds only the
  // user↔region link. The board read returns ids; names come from here and
  // are joined client-side (handoff §2.2).
  const { data: regions = [] } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });

  // Rail cards show a division too, and like regions the board read sends
  // only the id.
  const { data: divisions = [] } = useQuery({
    queryKey: ['work-order-config', 'divisions'],
    queryFn: () => divisionsApi.getAll(),
  });

  const regionIds = useMemo(() => (regionId ? [regionId] : undefined), [regionId]);

  // Two dispatchers on one board is normal, not an edge case, and cache
  // invalidation only ever refreshes the tab that made the change. Polling is
  // what makes a second dispatcher's work visible at all.
  //
  // Paused while the tab is hidden — a board left open overnight shouldn't
  // poll until morning — and refetched on focus so coming back is instant
  // rather than up to 30s stale. Same shape as the approvals bell.
  const {
    data: board,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dispatch-board', date, regionIds],
    queryFn: () => dispatchBoardApi.getBoard({ date, regionIds }),
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: !isWeek,
  });

  // A separate endpoint, not the day read seven times: seven days of a
  // 60-tech shop is ~2,000 dispatches and the week grid renders none of them
  // individually, so the server aggregates to ~420 cells instead.
  const {
    data: week,
    isLoading: weekLoading,
    error: weekError,
    refetch: refetchWeek,
  } = useQuery({
    queryKey: ['dispatch-board', 'week', weekStart, regionIds],
    queryFn: () => dispatchBoardApi.getWeek({ weekStart, regionIds }),
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: isWeek,
  });

  // The rail moves for the same reasons the grid does — someone else
  // scheduling a job takes it out of everyone's inbox.
  const { data: unscheduled } = useQuery({
    queryKey: ['dispatch-board', 'unscheduled', regionIds],
    queryFn: () => dispatchBoardApi.getUnscheduled({ regionIds }),
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Straight off the response: this is the zone the server resolved `date`
  // in, so the axis and the day boundary can never disagree. Falls back to the
  // browser only before the first response lands.
  const timeZone =
    (isWeek ? week?.timeZone : board?.timeZone) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    'UTC';

  // §3.4: the rail carries `itemCount`, not the items, and
  // DispatchFormDrawer requires a full WorkItemResponse[]. There is no
  // GET /work-orders/{id}/work-items — the work-item routes are write-only —
  // so the items come off the work-order detail read, which nests them.
  // Fetched on click rather than per card.
  const { data: composeWorkOrder } = useQuery({
    queryKey: ['work-orders', composeFor?.workOrderId],
    queryFn: () => workOrderApi.getById(composeFor!.workOrderId),
    enabled: composeFor != null,
  });

  // Same read for the edit path — the composer needs the full work items
  // either way.
  const { data: editWorkOrder } = useQuery({
    queryKey: ['work-orders', editDispatch?.workOrderId],
    queryFn: () => workOrderApi.getById(editDispatch!.workOrderId),
    enabled: editDispatch != null,
  });

  const allTechs = useMemo(() => board?.techs ?? [], [board]);
  const allDispatches = useMemo(() => board?.dispatches ?? [], [board]);
  // Server-ordered: severity CASE then createdAt ASC, in the query itself
  // (WorkOrderCacheRepository). Deliberately NOT re-sorted here — a second
  // implementation of one ordering rule is the drift risk, and a client sort
  // could only ever fix the page in hand anyway.
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

  const weekTechs = useMemo(() => {
    const all = week?.techs ?? [];
    if (!search.trim()) return all;
    const q = search.trim().toLowerCase();
    return all.filter((tech) => tech.name.toLowerCase().includes(q));
  }, [week, search]);

  // One fold rule for both granularities: available technicians with nothing
  // booked fold; anyone with an absence never does, because their row IS the
  // information that someone is out.
  const day = useMemo(
    () =>
      foldEmptyRows(
        techs,
        hideEmpty,
        (tech) => (byTech[tech.id] ?? []).length,
        (tech) => (tech.timeOff?.length ?? 0) > 0,
      ),
    [techs, hideEmpty, byTech],
  );

  const weekRows = useMemo(
    () =>
      foldEmptyRows(
        weekTechs,
        hideEmpty,
        (tech) => tech.cells.reduce((n, cell) => n + cell.stopCount, 0),
        (tech) => tech.cells.some((cell) => cell.off),
      ),
    [weekTechs, hideEmpty],
  );

  // Whichever granularity is on screen drives the chrome — the density ladder,
  // the row count in the subtitle, and whether the fold is offered at all.
  const activeTechs = isWeek ? weekTechs : techs;
  const shownTechs = isWeek ? weekRows.shown : day.shown;
  const foldableCount = isWeek ? weekRows.foldable : day.foldable;

  const regionName = (id: string | null) =>
    id ? (regions.find((r) => r.id === id)?.name ?? null) : null;

  // Grouping keys off PRIMARY region, because that is what produces a row
  // group. Filter visibility keys off coverage — the two sets are
  // deliberately different and can disagree.
  const primaryRegionIds = useMemo(
    () =>
      new Set(activeTechs.map((tech) => tech.primaryRegionId).filter((id): id is string => !!id)),
    [activeTechs],
  );
  const coveredRegionIds = useMemo(
    () => new Set(activeTechs.flatMap((tech) => tech.regionIds)),
    [activeTechs],
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

  const groups = useMemo<BoardGroup[]>(
    () =>
      buildGroups(day.shown, {
        grouped: effectiveGroupBy !== 'none',
        regions,
        orphanLabel: t('dispatchBoard.grid.noRegion'),
        summarize: (list) => ({
          stops: list.reduce((n, tech) => n + (byTech[tech.id] ?? []).length, 0),
          held: list.reduce(
            (n, tech) => n + (byTech[tech.id] ?? []).filter((d) => d.releasedAt == null).length,
            0,
          ),
        }),
      }),
    [effectiveGroupBy, day.shown, byTech, regions, t],
  );

  // Same grouping rules, different arithmetic: the week's group summary counts
  // aggregated stops, and "held" is a count of DAYS with unhanded-over work —
  // the aggregate carries a flag per day, never a dispatch count.
  const weekGroups = useMemo(
    () =>
      buildGroups<BoardWeekTech>(weekRows.shown, {
        grouped: effectiveGroupBy !== 'none',
        regions,
        orphanLabel: t('dispatchBoard.grid.noRegion'),
        summarize: (list) => ({
          stops: list.reduce(
            (n, tech) => n + tech.cells.reduce((m, cell) => m + cell.stopCount, 0),
            0,
          ),
          held: list.reduce(
            (n, tech) => n + tech.cells.filter((cell) => cell.hasUnreleased).length,
            0,
          ),
        }),
      }),
    [effectiveGroupBy, weekRows.shown, regions, t],
  );

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

  const todayInZone = useMemo(() => zonedDate(new Date(), timeZone), [timeZone]);

  // A now-line only means something on today's board — drawing one on
  // Thursday's board would be a lie.
  const nowHour = useMemo(() => {
    const now = new Date();
    if (zonedDate(now, timeZone) !== date) return null;
    return zonedHour(now.toISOString(), timeZone);
  }, [date, timeZone]);

  // Bulk release takes a SCOPE, not an id list: the server recomputes the
  // unreleased set, so this can neither reach outside the caller's regions
  // nor act on a board rendered ten minutes ago.
  const { assign, move, unschedule, release } = useBoardMutations(date);

  // A dispatch is a visit; the work order is the job — and "what is actually
  // happening with this job" is a question the board gets constantly, usually
  // with a customer on the phone. So the work order is one action away from
  // every place a dispatch appears, and always as a real href: cmd-click and
  // middle-click are how a dispatcher reads a job with the board still loaded
  // behind it, and a click handler silently takes that away.
  //
  // Smart back rides along in the house `?from=&back=` shape, carrying the
  // board's own query — date and scope — so returning lands on the board they
  // were actually looking at rather than a reset one.
  const workOrderHref = useCallback(
    (workOrderId: string) =>
      withBackContext(`/work-orders/${workOrderId}`, 'dispatch', searchParams.toString()),
    [searchParams],
  );

  const goToWorkOrder = useCallback(
    (workOrderId: string) => navigate(workOrderHref(workOrderId)),
    [navigate, workOrderHref],
  );

  // The spine hands back a tech, an already-resolved window, and whatever the
  // drag source attached. Decoding the payload is the page's job — the spine
  // stays ignorant of what a work order or a dispatch is.
  const handleDrop = useCallback(
    (
      techId: string,
      window: { startHour: number; endHour: number },
      payload: Record<string, unknown>,
    ) => {
      const techName = allTechs.find((tech) => tech.id === techId)?.name ?? '';
      const windowLabel = formatWindow(window.startHour, window.endHour);

      const workOrderId = payload.workOrderId as string | undefined;
      if (workOrderId) {
        const workOrder = railItems.find((w) => w.workOrderId === workOrderId);
        if (workOrder) assign.mutate({ workOrder, techId, techName, windowLabel, window });
        return;
      }

      const dispatchId = payload.dispatchId as string | undefined;
      const dispatch = allDispatches.find((d) => d.id === dispatchId);
      if (!dispatch) return;

      // Duration is preserved across a move; only the start snapped.
      const duration = (payload.durationHours as number | undefined) ?? 2;
      const moved = movedWindow(window.startHour, duration);
      // Same tech, same start — nothing happened. Don't spend a write and a
      // toast on a drag that landed where it began.
      if (dispatch.assignedUserId === techId) {
        const currentStart = zonedHour(dispatch.arrivalWindowStart, timeZone);
        if (currentStart != null && Math.abs(currentStart - moved.startHour) < 0.01) return;
      }
      move.mutate({
        dispatch,
        techId,
        techName,
        windowLabel: formatWindow(moved.startHour, moved.endHour),
        window: moved,
      });
    },
    [railItems, allDispatches, allTechs, assign, move, timeZone],
  );

  // Pulling work back off the board is always allowed — it's a decision, not
  // a mistake to guard against. The mutation picks delete or cancel based on
  // whether a technician has been told yet.
  const unscheduleFromRail = useCallback(
    (payload: Record<string, unknown>) => {
      const dispatch = allDispatches.find((d) => d.id === payload.dispatchId);
      if (dispatch) unschedule.mutate(dispatch);
    },
    [allDispatches, unschedule],
  );
  unscheduleRef.current = unscheduleFromRail;

  const releaseMutation = useMutation({
    mutationFn: () => dispatchBoardApi.release({ date, regionIds }),
    onSuccess: ({ released }) => {
      invalidateDispatchBoard(queryClient);
      showSuccess(t('dispatchBoard.release.done', { count: released }));
    },
    onError: (err) => showError(t('dispatchBoard.release.failed'), extractApiError(err)),
  });

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

  // Day: "Thu, Mar 19", or "Today" when it is. Week: the span the SERVER
  // resolved, so the label can never disagree with the columns.
  const scopeLabel = isWeek
    ? formatDayRange(week?.days ?? [])
    : date === todayInZone
      ? t('dispatchBoard.dateNav.today')
      : formatBoardDate(date);

  const boardBody = () => {
    if (isWeek ? weekLoading : isLoading) {
      return <LoadingState label={t('dispatchBoard.states.loading')} />;
    }

    if (isWeek ? weekError : error) {
      return (
        <ErrorState
          title={t('dispatchBoard.states.errorTitle')}
          description={t('dispatchBoard.states.errorBody')}
          action={
            <Button size="xs" onClick={() => (isWeek ? refetchWeek() : refetch())}>
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
    if ((isWeek ? week?.techs ?? [] : allTechs).length === 0) {
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

    if (isWeek) {
      return (
        <DispatchWeek
          groups={weekGroups}
          days={week?.days ?? []}
          density={density}
          collapsed={collapsed}
          onToggleGroup={(key) =>
            setCollapsed((prev) =>
              prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
            )
          }
          capacityStops={week?.defaultStopsPerDay ?? null}
          today={todayInZone}
          // The week's job is to route you to the right day, so a cell is a
          // target: it hands the dispatcher the day board they were hunting
          // for, scope intact.
          onOpenDay={(day) => setParams({ date: day, view: null })}
        />
      );
    }

    // Deliberately NOT an empty state here. Rows ARE the board: they are the
    // drop targets, and they tell a dispatcher who is free. Replacing the grid
    // with "nothing scheduled" hides the two things the reader came for and
    // leaves nowhere to drop work. The filter case says so above the grid
    // instead, where the lanes survive.
    return (
      <>
        {visibleDispatches.length === 0 && (
          <div className="flex items-center gap-2 border-b border-border bg-bg-elev-2 px-3.5 py-2 text-[11.5px] text-fg-muted">
            <span>
              {hasFilters
                ? t('dispatchBoard.states.emptyFilteredTitle', { entity: dispatchesLabel })
                : t('dispatchBoard.states.emptyBody', { entity: dispatchesLabel })}
            </span>
            {hasFilters && (
              <Button plain size="xxs" onClick={clearFilters}>
                {t('dispatchBoard.states.clearFilters')}
              </Button>
            )}
          </div>
        )}
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
        workOrderHref={workOrderHref}
        onContextDispatch={(dispatch, at) => setMenu({ dispatch, ...at })}
        axis={axis}
        nowHour={nowHour}
          capacityStops={board?.defaultStopsPerDay ?? null}
          timeZone={timeZone}
          onDrop={handleDrop}
        />
      </>
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
            {/* Day or week. Labelled by GRANULARITY, not by "Today" — the
                toggle still says what it is once you have stepped to
                Thursday, and it doesn't collide with the Today reset. */}
            <ToggleGroup
              value={isWeek ? 'week' : 'day'}
              onChange={(value) => setParam('view', value === 'week' ? 'week' : null)}
              size="sm"
              aria-label={t('dispatchBoard.view.label')}
            >
              <ToggleGroupOption value="day">{t('dispatchBoard.view.day')}</ToggleGroupOption>
              <ToggleGroupOption value="week">{t('dispatchBoard.view.week')}</ToggleGroupOption>
            </ToggleGroup>

            <Button
              plain
              size="xs"
              aria-label={t(isWeek ? 'dispatchBoard.dateNav.previousWeek' : 'dispatchBoard.dateNav.previous')}
              onClick={() => setParam('date', shiftDay(date, isWeek ? -7 : -1))}
            >
              <ChevronLeftIcon />
            </Button>
            {/* The board used to show no date at all: stepping forward with a
                chevron left the dispatcher guessing which day they were on. */}
            <span className="min-w-[92px] text-center text-[12px] font-semibold text-fg-strong">
              {scopeLabel}
            </span>
            <Button
              plain
              size="xs"
              aria-label={t(isWeek ? 'dispatchBoard.dateNav.nextWeek' : 'dispatchBoard.dateNav.next')}
              onClick={() => setParam('date', shiftDay(date, isWeek ? 7 : 1))}
            >
              <ChevronRightIcon />
            </Button>
            <Button size="xs" onClick={() => setParam('date', null)} disabled={date === todayInZone}>
              {t('dispatchBoard.dateNav.today')}
            </Button>

            {/* Present only when there is something to release — and only on
                the day board, since release takes a single day's scope and a
                count spanning the week could not act on itself. */}
            {!isWeek && counts.unreleased > 0 && (
              <Button
                color="accent"
                size="xs"
                onClick={() => setConfirmRelease(true)}
                disabled={releaseMutation.isPending}
              >
                {t('dispatchBoard.release.action', { count: counts.unreleased })}
              </Button>
            )}
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

        {/* ── Band 3 — exceptions as FILTERS, never as stat cards ──
             Day only: every chip is a predicate over individual dispatches,
             and the week read carries aggregates. Showing chips that could
             not filter anything is what rev 3 did with "Unassigned". */}
        {!isWeek && (
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
        )}

        {/* ── Body — unscheduled rail, then the board ────────────── */}
        <div className="db-body">
          <aside ref={railRef} className={`db-rail${railOver ? ' over' : ''}`}>
            <div className="db-rail-head">
              <span className="text-[10.5px] font-bold tracking-[0.06em] text-fg-muted uppercase">
                {t('dispatchBoard.rail.heading')}
              </span>
              <Pill tone={railItems.some((w) => w.priority === 'URGENT') ? 'danger' : 'neutral'}>
                {String(railItems.length)}
              </Pill>
            </div>
            <div className="db-rail-list">
              {railItems.length === 0 ? (
                <EmptyState
                  compact
                  title={t('dispatchBoard.rail.emptyTitle')}
                  description={t('dispatchBoard.rail.emptyBody')}
                />
              ) : (
                railItems.map((wo) => (
                  <UnscheduledRailCard
                    key={wo.workOrderId}
                    workOrder={wo}
                    regionName={regionName(wo.dispatchRegionId)}
                    divisionName={
                      divisions.find((d) => d.id === wo.divisionId)?.name ?? null
                    }
                    workOrderHref={workOrderHref}
                    onOpen={setComposeFor}
                  />
                ))
              )}
            </div>
          </aside>

          <div className="db-board">
            <div ref={scrollRef} className="db-scroll">
              {boardBody()}
            </div>
          </div>
        </div>
      </div>

      {/* Releasing texts every one of those technicians and there is no
          un-send, so this one asks first — unlike the drag operations, which
          are reversible with a real inverse mutation. */}
      <ConfirmDialog
        isOpen={confirmRelease}
        onClose={() => setConfirmRelease(false)}
        onConfirm={() => releaseMutation.mutate()}
        title={t('dispatchBoard.release.confirmTitle', { count: counts.unreleased })}
        message={t('dispatchBoard.release.confirmBody', { count: counts.unreleased })}
        confirmLabel={t('dispatchBoard.release.confirmAction')}
        isPending={releaseMutation.isPending}
      />

      {/* The rail is the board's only path into the composer — no standalone
          Schedule button. The rail already IS the work-order picker: scoped,
          sorted by priority then age, and on screen. */}
      {/* Edit reuses the same composer, prefilled — the board owns no
          scheduling form of its own. */}
      <DispatchFormDrawer
        open={editDispatch != null && editWorkOrder != null}
        onClose={() => setEditDispatch(null)}
        workOrderId={editDispatch?.workOrderId ?? ''}
        workItems={editWorkOrder?.workItems ?? []}
        dispatch={editDispatch}
      />

      <DispatchFormDrawer
        open={composeFor != null && composeWorkOrder != null}
        onClose={() => setComposeFor(null)}
        workOrderId={composeFor?.workOrderId ?? ''}
        workItems={composeWorkOrder?.workItems ?? []}
        workOrderNumber={composeFor?.workOrderNumber}
        locationName={composeFor?.customerName}
      />

      {/* Right-click is the fast path on a board: it reaches the work order —
          the one thing the dispatch drawer cannot give a dispatcher — and the
          common verbs, without a drawer round-trip. */}
      <BlockContextMenu
        menu={menu}
        workOrderHref={workOrderHref}
        onClose={() => setMenu(null)}
        onOpenDetail={setOpenDispatch}
        onRelease={(d) => release.mutate(d)}
        onReassign={setEditDispatch}
        onUnschedule={(d) => unschedule.mutate(d)}
      />

      {/* The board owns no detail surface — it opens the existing drawer,
          now with its write paths live. Undo on the toast only lasts a few
          seconds, so this is where unassigning actually lives: Cancel keeps
          the visit with a reason (the audit trail a customer conversation
          depends on), Delete removes a mistake that never happened. */}
      <DispatchDetailDrawer
        dispatch={openDispatch}
        onClose={() => setOpenDispatch(null)}
        onEdit={(d) => {
          setOpenDispatch(null);
          setEditDispatch(d);
        }}
        onDelete={() => {
          // Use the board's own row, not the drawer's callback argument —
          // the drawer hands back a plain Dispatch, and unschedule needs
          // `releasedAt` and `version` to decide between delete and cancel.
          // Same path the rail drop takes, so both routes behave alike.
          const target = openDispatch;
          setOpenDispatch(null);
          if (target) unschedule.mutate(target);
        }}
        onViewWorkItems={() => {
          if (openDispatch) goToWorkOrder(openDispatch.workOrderId);
        }}
        // The drawer is a visit; the board reached it from somewhere other
        // than the job, so it carries the way back to the job.
        workOrder={
          openDispatch
            ? {
                number: openDispatch.workOrderNumber,
                href: workOrderHref(openDispatch.workOrderId),
                serviceLocationId: openDispatch.serviceLocationId,
              }
            : undefined
        }
      />
    </AppLayout>
  );
}
