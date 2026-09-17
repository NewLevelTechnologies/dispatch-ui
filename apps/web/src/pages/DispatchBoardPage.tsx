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
import { ChevronLeftIcon, ChevronRightIcon, MapIcon } from '@heroicons/react/24/outline';
import {
  dispatchBoardApi,
  dispatchRegionApi,
  divisionsApi,
  workOrderApi,
  type BoardDispatch,
  type BoardTech,
  type UnscheduledWorkOrder,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Select } from '../components/catalyst/select';
import { ListSearch } from '../components/ui/ListToolbar';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { FilterChip, FilterChipRow } from '../components/ui/FilterChipRow';
import BoardLegend from '../components/dispatch/BoardLegend';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Pill } from '../components/ui/Pill';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import ConfirmDialog from '../components/ConfirmDialog';
import DispatchDetailDrawer, { type DispatchSeed } from '../components/DispatchDetailDrawer';
import DispatchMapView from '../components/dispatch/DispatchMapView';
import type { MapPrefill } from '../components/DispatchFormDrawer';
import DispatchFormDrawer from '../components/DispatchFormDrawer';
import DispatchTimeline from '../components/dispatch/DispatchTimeline';
import DispatchWeek from '../components/dispatch/DispatchWeek';
import TimeOffDialog from '../components/dispatch/TimeOffDialog';
import BlockContextMenu, { type BlockMenu } from '../components/dispatch/BlockContextMenu';
import UnscheduledRailCard from '../components/dispatch/UnscheduledRailCard';
import {
  DENSITY_METRICS,
  autoDensityFor,
  type Density,
} from '../components/dispatch/spine';
import { buildAxis, formatHour, formatWindow, zonedDate, zonedHour } from '../lib/boardTime';
import { foldEmptyRows } from '../lib/boardRows';
import { nearestStops } from '../lib/nearestStop';
import { withBackContext } from '../lib/backContext';
import { movedWindow } from '../lib/boardDrop';
import { useBoardMutations } from './dispatch/useBoardMutations';
import { extractApiError, showError, showSuccess } from '../lib/toast';
import { invalidateDispatchBoard } from '../utils/invalidateRoleConsumers';
import { isHiddenByDefault } from '../lib/dispatchStatus';
import { siteLabel } from '../lib/siteLabel';

// The tenant's nominal working day. The axis widens to contain anything
// outside it (an overnight emergency must not be clipped) but never narrows.
// Poll cadence. 30s is the handoff's number: fast enough that a second
// dispatcher's change lands before it matters, slow enough that a 60-tech
// board isn't refetching a few hundred rows constantly. If that payload gets
// heavy the answer is a delta endpoint, not a longer interval.
const BOARD_POLL_MS = 30_000;

const DAY_START = 6;
const DAY_END = 20;

/** Grid filters. "Unassigned" is deliberately absent: unassigned work is not
 *  on the grid, so it was never a grid filter — the rail header carries that
 *  count instead. */
type ChipTone = 'neutral' | 'warning' | 'danger' | 'violet';

type ExceptionId = 'urgent' | 'unreleased' | 'noshow' | 'cancelled' | 'longdrive' | 'recurring';

const LONG_DRIVE_MINUTES = 30;

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

/** Compact form for the date nav: "Sep 13". The subtitle carries the full
 *  "Sunday, September 13" — this one has two chevrons either side of it. */
function formatNavDate(date: string): string {
  return RANGE_LABEL.format(asUtc(date));
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
  const [hideEmpty, setHideEmpty] = useState(false);
  const [exceptions, setExceptions] = useState<ExceptionId[]>([]);
  const [menu, setMenu] = useState<BlockMenu | null>(null);
  const [timeOffTech, setTimeOffTech] = useState<BoardTech | null>(null);
  const [composeFor, setComposeFor] = useState<UnscheduledWorkOrder | null>(null);
  // Set only by a map drop. Present = the composer opens knowing WHO and
  // WHICH DAY but deliberately not the window.
  const [mapPrefill, setMapPrefill] = useState<MapPrefill | null>(null);
  // The unscheduled job the dispatcher is pointing at, wherever they are
  // pointing. ONE id, owned here, so the rail card and its map pin cannot
  // hold different answers about what is being identified.
  const [hoverWorkOrderId, setHoverWorkOrderId] = useState<string | null>(null);
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
  const divisionId = searchParams.get('division');
  // Granularity, in the URL like every other scope — "show me next week in
  // East Valley" has to be a link someone can send.
  const isWeek = searchParams.get('view') === 'week';
  // A third value of the same param rather than a second one. The map is
  // inherently a DAY view — routes are a day's sequence — so entering it from
  // the week drops the horizon back to Day rather than creating a "map of a
  // week" state that has no meaning.
  const isMap = searchParams.get('view') === 'map';
  // Which visit is open, in the URL rather than in state: the drawer is part
  // of the view someone shares, and it makes the back button work.
  const openDispatchId = searchParams.get('d');
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
  const divisionIds = useMemo(() => (divisionId ? [divisionId] : undefined), [divisionId]);

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
    queryKey: ['dispatch-board', date, regionIds, divisionIds],
    queryFn: () => dispatchBoardApi.getBoard({ date, regionIds, divisionIds }),
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
    queryKey: ['dispatch-board', 'week', weekStart, regionIds, divisionIds],
    queryFn: () => dispatchBoardApi.getWeek({ weekStart, regionIds, divisionIds }),
    refetchInterval: BOARD_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    enabled: isWeek,
  });

  // The rail moves for the same reasons the grid does — someone else
  // scheduling a job takes it out of everyone's inbox.
  const { data: unscheduled } = useQuery({
    queryKey: ['dispatch-board', 'unscheduled', regionIds, divisionIds],
    queryFn: () => dispatchBoardApi.getUnscheduled({ regionIds, divisionIds }),
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

  // Scope-bound by design: only technicians actually rendered are considered,
  // so narrowing to one region legitimately changes the answer. Recomputed on
  // any change to the queue, the visible techs or their stops — assigning one
  // job updates the hint on every other card.
  //
  // Self-hiding all the way down: no coordinates, nothing booked yet, or the
  // week's aggregate read (which carries no stops at all) each yield an empty
  // map and a card with no line, which is the honest rendering.
  const nearest = useMemo(
    () => (isWeek ? {} : nearestStops(railItems, day.shown, allDispatches, timeZone)),
    [isWeek, railItems, day.shown, allDispatches, timeZone],
  );

  // Derived, never stored: a drawer opened from a stale copy of the row would
  // keep showing it after a poll refreshed the board underneath.
  const openDispatch = useMemo(
    () => allDispatches.find((d) => d.id === openDispatchId) ?? null,
    [allDispatches, openDispatchId],
  );

  // The board's own row for the visit being edited. `DispatchSeed` carries
  // only what the form itself reads, and the job band needs the work order's
  // number and summary — which the board already has in hand.
  const editBoardRow = useMemo(
    () => allDispatches.find((d) => d.id === editDispatch?.id) ?? null,
    [allDispatches, editDispatch],
  );

  const openVisit = (dispatch: BoardDispatch | null) => setParam('d', dispatch?.id ?? null);

  // A map drop resolves to a PERSON and a DAY. It opens the composer with
  // those filled and the window left blank — it does not commit, and it is
  // the one drag on this board that doesn't. The gesture carries no time,
  // and every window the board creates must be a tenant preset, so picking
  // one here would quote a customer an arrival window nobody chose.
  const assignFromMap = (workOrderId: string, techId: string) => {
    const workOrder = railItems.find((w) => w.workOrderId === workOrderId);
    if (!workOrder) return;
    setMapPrefill({ assignedUserId: techId, date });
    setComposeFor(workOrder);
  };

  // Clicking a pin, as opposed to dragging one. Same destination as clicking
  // a rail card and deliberately UNPREFILLED: a click asks "what is this",
  // and answering it must not require starting a drag the dispatcher would
  // then have to abort.
  const openUnassignedFromMap = (workOrderId: string) => {
    const workOrder = railItems.find((w) => w.workOrderId === workOrderId);
    if (!workOrder) return;
    setMapPrefill(null);
    setComposeFor(workOrder);
  };

  // What is ON the map, as opposed to how it is drawn. Reframing keys off
  // this so a layer toggle never throws away the dispatcher's panning.
  const scopeKey = [date, regionId ?? '', divisionId ?? '', search].join('|');

  // Rail cards print the ABBREVIATION: on the identity row it competes with
  // the identifier and the age for a fixed width, and the full name buys
  // nothing there. Falls back to the name for a region that has none.
  const regionAbbrev = (id: string | null) => {
    if (!id) return null;
    const region = regions.find((r) => r.id === id);
    return region ? region.abbreviation || region.name : null;
  };

  const coveredRegionIds = useMemo(
    () => new Set(activeTechs.flatMap((tech) => tech.regionIds)),
    [activeTechs],
  );

  const regionOptions = useMemo(
    () => regions.filter((r) => coveredRegionIds.has(r.id)),
    [regions, coveredRegionIds],
  );
  const showRegionFilter = regionOptions.length > 1;
  // Division is a property of the WORK, never of a technician — so it filters
  // blocks and leaves every row standing. Offered only where the tenant
  // actually runs more than one.
  const showDivisionFilter = divisions.length > 1;
  // Server-counted, because the rows themselves never arrive — that is the
  // point of withholding them.
  const hiddenByDivision = isWeek
    ? (week?.techsHiddenByDivisionFilter ?? 0)
    : (board?.techsHiddenByDivisionFilter ?? 0);
  const showDensityPicker = shownTechs.length > 12;
  const showHideEmpty = foldableCount > 0;
  // Zero-count chips STAY — "Urgent 0" is information, and chips that appear
  // and vanish make the band jump. But an all-zeros row with nothing active is
  // six controls that do nothing, so the band itself goes.
  const showExceptionBand =
    exceptions.length > 0 || Object.values(counts).some((n) => n > 0);
  // A division filter empties blocks and leaves the rows — correct, and at 60
  // rows it reads as a broken board. Suggest the fold once it has taken out
  // more than half of them.
  const suggestHideEmpty =
    !hideEmpty && divisionId != null && foldableCount > shownTechs.length / 2;

  // A stale preference falls back to flat rather than silently grouping by a
  // control the user can no longer see.
  const autoDensity = autoDensityFor(shownTechs.length);
  const density: Density = densityPref === 'auto' ? autoDensity : densityPref;

  // Coverage on the tech cell's meta line, ABBREVIATED. The technician column
  // is 176px at dense and the line already carries the absence reason, so full
  // names do not fit: "Georgia · North Carolina · Florida · South Carolina" is
  // four regions on one row of a four-region tenant. The same argument the
  // rail card's facet row settled — here it competes with the name and the
  // load bar for a fixed width, and the full name buys nothing a tenant who
  // wrote the abbreviations does not already read.
  //
  // Null when every row would print the same thing: a single-region tenant
  // states nothing, the same self-hiding discipline as the chrome controls.
  // Ordered by the REGISTRY, never by the user's own array. A tech's
  // `regionIds` arrive in whatever order an admin ticked the boxes, so two
  // people covering the same four regions rendered as two different sets —
  // "GA · NC · FL · SC" above "SC · FL · NC · GA". Walking the tenant's
  // ordered list and keeping the members makes the line identical for
  // identical coverage, and honours a tenant who arranged their regions
  // north-to-south rather than imposing the alphabet on them.
  const regionLabel = useMemo(() => {
    const ordered = [...regions].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    return (regionIds: string[]) => {
      if (!showRegionFilter) return null;
      const covered = new Set(regionIds);
      const labels = ordered
        .filter((region) => covered.has(region.id))
        .map((region) => region.abbreviation || region.name);
      return labels.length > 0 ? labels.join(' · ') : null;
    };
  }, [regions, showRegionFilter]);

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
  const { assign, move, unschedule, release } = useBoardMutations(date, timeZone);

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
    setParams({ region: null, division: null });
  };

  const toggleException = (id: ExceptionId) =>
    setExceptions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const dispatchesLabel = getName('dispatch', true);
  const techLabel = getName('technician', true);

  // What the board is showing, spelled out: the day, how many technicians are
  // in scope, how much work is on them, and — only when it means something —
  // what time it is where the work is happening.
  //
  // The date lives here rather than in the nav because it has room to be a
  // real date. A chevron with "Thu, Mar 19" wedged between the arrows costs
  // width on every render for something the reader looks at once.
  const scopeLabel = isWeek ? formatDayRange(week?.days ?? []) : formatBoardDate(date);

  // The week's toggle steps weeks, so "today" there means the week containing
  // it, not the day.
  const isToday = isWeek
    ? todayInZone != null && weekStart === weekStartOf(todayInZone)
    : date === todayInZone;
  // Short, because it sits between two chevrons: "Sep 13", or the week's span.
  const navLabel = isWeek ? scopeLabel : formatNavDate(date);

  const subtitle = [
    scopeLabel,
    t('dispatchBoard.subtitleCount', {
      count: shownTechs.length,
      entity: techLabel.toLowerCase(),
    }),
    !isWeek &&
      t('dispatchBoard.subtitleDispatches', {
        count: visibleDispatches.length,
        entity: getName('dispatch', true).toLowerCase(),
      }),
    // A now-time on Thursday's board would be a lie, the same way the now-line
    // would be.
    !isWeek && nowHour != null && t('dispatchBoard.subtitleNow', { time: formatHour(nowHour) }),
  ]
    .filter(Boolean)
    .join(' · ');

  // Loading, error and the two empty states are facts about the board READ,
  // not about how it is drawn — so every view mode shares them rather than
  // each re-deciding what an empty day looks like.
  const boardGuard = () => {
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

    return null;
  };

  const mapBody = () => {
    const guard = boardGuard();
    // Same guards, but inside a scroll container: LoadingState and EmptyState
    // want a normal block, and the map's own container is a positioned canvas.
    if (guard) return <div className="db-scroll">{guard}</div>;
    return (
      <DispatchMapView
        // `day.shown`, not `shownTechs`: the map is always a day view, so it
        // reads the day's rows even if the horizon param still says week.
        techs={day.shown}
        byTech={byTech}
        unscheduled={railItems}
        // The rail read is a PAGE. The map has to say so, because 50 dashed
        // pins look like all of them in a way a scrolling list never does.
        unscheduledTotal={unscheduled?.totalElements ?? railItems.length}
        missingCoordinates={board?.dispatchesMissingCoordinates ?? 0}
        selectedId={openDispatchId}
        onOpenDispatch={openVisit}
        onAssign={assignFromMap}
        onOpenUnassigned={openUnassignedFromMap}
        hoverWorkOrderId={hoverWorkOrderId}
        onHoverWorkOrder={setHoverWorkOrderId}
        scopeKey={scopeKey}
      />
    );
  };

  const boardBody = () => {
    const guard = boardGuard();
    if (guard) return guard;

    if (isWeek) {
      return (
        <DispatchWeek
          techs={weekRows.shown}
          regionLabel={regionLabel}
          days={week?.days ?? []}
          density={density}
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
        {/* Only the FILTERED empty gets a line, because it offers a fix the
            grid cannot. An empty day is a legitimate board — the rows are the
            drop targets, and saying "nothing is scheduled" above a grid that
            already shows nothing scheduled is the same sentence twice. */}
        {visibleDispatches.length === 0 && hasFilters && (
          <div className="flex items-center gap-2 border-b border-border bg-bg-elev-2 px-3.5 py-2 text-[11.5px] text-fg-muted">
            <span>
              {t('dispatchBoard.states.emptyFilteredTitle', { entity: dispatchesLabel })}
            </span>
            <Button plain size="xxs" onClick={clearFilters}>
              {t('dispatchBoard.states.clearFilters')}
            </Button>
          </div>
        )}
        <DispatchTimeline
        techs={day.shown}
        regionLabel={regionLabel}
        commitments={board?.commitments ?? []}
        divisionFilter={divisionId}
        isToday={isToday}
        byTech={byTech}
        density={density}
        onOpenDispatch={openVisit}
        workOrderHref={workOrderHref}
        onContextDispatch={(dispatch, at) => setMenu({ dispatch, ...at })}
        onMarkTimeOff={setTimeOffTech}
        axis={axis}
        nowHour={nowHour}
          capacityStops={board?.defaultStopsPerDay ?? null}
          timeZone={timeZone}
          onDrop={handleDrop}
        />
      </>
    );
  };

  // The swatch on each chip is the tone the GRID gives that thing, which is
  // what ties a chip to the blocks it filters. Unreleased and cancelled are
  // deliberately un-toned: neither is a status hue out there either — one is
  // a dashed border, the other a struck-through outline.
  const chips: { id: ExceptionId; label: string; tone: ChipTone }[] = [
    { id: 'urgent', label: t('dispatchBoard.chips.urgent'), tone: 'danger' },
    { id: 'unreleased', label: t('dispatchBoard.chips.unreleased'), tone: 'neutral' },
    { id: 'noshow', label: t('dispatchBoard.chips.noshow'), tone: 'warning' },
    { id: 'cancelled', label: t('dispatchBoard.chips.cancelled'), tone: 'neutral' },
    { id: 'longdrive', label: t('dispatchBoard.chips.longdrive'), tone: 'warning' },
    { id: 'recurring', label: t('dispatchBoard.chips.recurring'), tone: 'violet' },
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
            <div className="text-[11.5px] text-fg-muted">{subtitle}</div>
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

            {/* Prev · date · next, then Today only when there is a today to
                go back to — the same self-hiding discipline as the filters,
                and the clearest possible cue that the board is showing another
                day. Every control here is 26px, matching the fields below. */}
            <Button
              plain
              size="xxs"
              aria-label={t(
                isWeek ? 'dispatchBoard.dateNav.previousWeek' : 'dispatchBoard.dateNav.previous',
              )}
              onClick={() => setParam('date', shiftDay(date, isWeek ? -7 : -1))}
            >
              <ChevronLeftIcon />
            </Button>
            {/* The date itself, and the way to reach an arbitrary one. The
                min-width keeps the cluster from resizing between "Sep 9" and
                "Sep 12". Secondary, never a filled pill — a solid fill means
                primary action or selected, and the date is neither. */}
            <span className="relative inline-flex">
              <Button outline size="xxs" className="min-w-[68px] justify-center">
                {navLabel}
              </Button>
              <input
                type="date"
                aria-label={t('dispatchBoard.dateNav.pick')}
                value={date}
                onChange={(e) => setParam('date', e.target.value || null)}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </span>
            <Button
              plain
              size="xxs"
              aria-label={t(
                isWeek ? 'dispatchBoard.dateNav.nextWeek' : 'dispatchBoard.dateNav.next',
              )}
              onClick={() => setParam('date', shiftDay(date, isWeek ? 7 : 1))}
            >
              <ChevronRightIcon />
            </Button>
            {!isToday && (
              <Button outline size="xxs" onClick={() => setParam('date', null)}>
                {t('dispatchBoard.dateNav.today')}
              </Button>
            )}

            {/* Its own control rather than a third segment in the horizon
                toggle: that toggle answers "how much time", and the map
                answers "drawn how". Turning it on from the week view lands on
                Day, since a route is a day's sequence. */}
            {/* aria-pressed alone announced the state to a screen reader and
                showed nothing to everyone else — Catalyst's Button has no
                pressed styling of its own. The mock's treatment: the active
                SURFACE, not an accent fill, because accent means selection and
                navigation in this system and a view toggle is neither. */}
            <Button
              outline
              size="xxs"
              aria-pressed={isMap}
              className="aria-pressed:bg-bg-active aria-pressed:text-fg-strong"
              onClick={() => setParam('view', isMap ? null : 'map')}
            >
              <MapIcon />
              {t('dispatchBoard.map.label')}
            </Button>

            {/* Present only when there is something to release — and only on
                the day board, since release takes a single day's scope and a
                count spanning the week could not act on itself. */}
            {!isWeek && counts.unreleased > 0 && (
              <Button
                color="accent"
                size="xxs"
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
          {/* No toolbar wrapper: the band is already the flex row, and its
              single 8px gap does all the horizontal spacing. Nesting a
              ListToolbar here brought its own margins and an items-end
              baseline into a row of equal-height chrome. */}
          <ListSearch
            compact
            placeholder={t('dispatchBoard.search.placeholder', {
              entity: getName('technician').toLowerCase(),
            })}
            value={search}
            onChange={setSearch}
          />
            {/* Filters are selects, not caret buttons. A bordered button with
                a chevron reads as a menu that performs an action, and it made
                two filters look like two different kinds of control — they
                should be identical to each other and distinct from toggles. */}
            {showRegionFilter && (
              <Select
                size="xxs"
                aria-label={t('dispatchBoard.filter.region', { entity: getName('dispatch_region') })}
                value={regionId ?? ''}
                onChange={(e) => setParam('region', e.target.value || null)}
              >
                <option value="">
                  {t('dispatchBoard.filter.allRegions', {
                    entity: getName('dispatch_region', true),
                  })}
                </option>
                {regionOptions.map((region) => (
                  <option key={region.id} value={region.id}>
                    {region.name}
                  </option>
                ))}
              </Select>
            )}

            {showDivisionFilter && (
              <Select
                size="xxs"
                aria-label={t('dispatchBoard.filter.division', { entity: getName('division') })}
                value={divisionId ?? ''}
                onChange={(e) => setParam('division', e.target.value || null)}
              >
                <option value="">
                  {t('dispatchBoard.filter.allDivisions', { entity: getName('division', true) })}
                </option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </Select>
            )}

            {showDensityPicker && (
              <Select
                size="xxs"
                aria-label={t('dispatchBoard.filter.density')}
                value={densityPref}
                onChange={(e) => setDensityPref(e.target.value as Density | 'auto')}
              >
                <option value="auto">
                  {t('dispatchBoard.density.auto', {
                    mode: t(`dispatchBoard.density.${autoDensity}`),
                  })}
                </option>
                {(Object.keys(DENSITY_METRICS) as Density[]).map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`dispatchBoard.density.${mode}`)}
                  </option>
                ))}
              </Select>
            )}

            {showHideEmpty && (
              <FilterChip
                variant="dense"
                label={t('dispatchBoard.filter.hideEmpty', { entity: techLabel.toLowerCase() })}
                count={foldableCount}
                active={hideEmpty}
                onToggle={() => setHideEmpty((v) => !v)}
              />
            )}

            {/* A filter that silently removes a technician who is free has
                taken an option away. So it says how many and offers them
                back — and "show" is a re-request rather than a hidden payload
                sitting in every response, because the unfiltered board is
                usually still cached from before the filter was applied. */}
            {hiddenByDivision > 0 && (
              <button
                type="button"
                onClick={() => setParam('division', null)}
                className="!text-[10.5px] text-fg-muted hover:text-fg-strong"
              >
                {t('dispatchBoard.filter.hiddenByDivision', { count: hiddenByDivision })}
                <span className="ml-1 !font-medium text-fg-accent underline">
                  {t('dispatchBoard.filter.showHidden')}
                </span>
              </button>
            )}

            {/* Suggested, never applied for them: rows emptied by a narrowing
                are correct behaviour that looks broken, and the dispatcher
                should be the one to decide the rows can go. */}
            {suggestHideEmpty && (
              <span className="text-[10.5px] text-fg-muted">
                {t('dispatchBoard.filter.hideEmptySuggestion', { count: foldableCount })}
              </span>
            )}

            <span className="grow" />
            {/* The one board gesture nothing else advertises. */}
            <span className="hidden text-[10.5px] text-fg-muted xl:inline">
              {t('dispatchBoard.hint.rightClick', { entity: getName('work_order').toLowerCase() })}
            </span>
            <span className="text-[10.5px] text-fg-muted">
              {t('dispatchBoard.rowCount', { count: shownTechs.length })}
            </span>
        </div>

        {/* ── Band 3 — exceptions as FILTERS, never as stat cards ──
             Day only: every chip is a predicate over individual dispatches,
             and the week read carries aggregates. Showing chips that could
             not filter anything is what rev 3 did with "Unassigned". */}
        {!isWeek && showExceptionBand && (
        <div className="db-band sub">
          <FilterChipRow className="gap-1.5">
            {chips.map((chip) => (
              <FilterChip
                key={chip.id}
                variant="dense"
                dot
                tone={chip.tone}
                label={chip.label}
                count={counts[chip.id]}
                active={exceptions.includes(chip.id)}
                onToggle={() => toggleException(chip.id)}
              />
            ))}
            {exceptions.length > 0 && (
              <Button plain size="xxs" onClick={() => setExceptions([])}>
                {t('dispatchBoard.states.clearFilters')}
              </Button>
            )}
          </FilterChipRow>
          <span className="grow" />
          {/* Below ~1100px it drops entirely rather than shrinking: the chip
              row already carries the colour vocabulary, and a clipped legend
              is worse than no legend. */}
          <div className="hidden min-[1100px]:block">
            <BoardLegend />
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
                    // Only when board scope is "all regions": printing one
                    // region on every card in a filtered board is noise.
                    regionAbbreviation={regionId ? null : regionAbbrev(wo.dispatchRegionId)}
                    nearest={nearest[wo.workOrderId]}
                    // Self-hiding, like every other scale affordance: a
                    // single-division tenant sees it on every card, which is
                    // the same defect as printing the state, and a division
                    // filter already answers the question for the whole rail.
                    divisionName={
                      showDivisionFilter && !divisionId
                        ? divisions.find((d) => d.id === wo.divisionId)?.name ?? null
                        : null
                    }
                    workOrderHref={workOrderHref}
                    onOpen={setComposeFor}
                    hovered={hoverWorkOrderId === wo.workOrderId}
                    onHover={setHoverWorkOrderId}
                  />
                ))
              )}
            </div>
          </aside>

          <div className="db-board">
            {isMap ? (
              mapBody()
            ) : (
              <div ref={scrollRef} className="db-scroll">
                {boardBody()}
              </div>
            )}
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
        // Same reasoning on the edit path: the composer covers the board, so
        // the job it belongs to is not reachable behind it either.
        workOrderNumber={editBoardRow?.workOrderNumber ?? undefined}
        workOrderHref={editDispatch ? workOrderHref(editDispatch.workOrderId) : undefined}
        // From the job, not the board row: a row only exists while it is in
        // scope, and the composer has to order its picker the same way whether
        // the dispatcher reached it from a visible row or not.
        divisionId={editWorkOrder?.divisionId}
        dispatch={editDispatch}
      />

      <DispatchFormDrawer
        open={composeFor != null && composeWorkOrder != null}
        onClose={() => {
          setComposeFor(null);
          setMapPrefill(null);
        }}
        prefill={mapPrefill}
        workOrderId={composeFor?.workOrderId ?? ''}
        workItems={composeWorkOrder?.workItems ?? []}
        workOrderNumber={composeFor?.workOrderNumber}
        locationName={composeFor ? siteLabel(composeFor) : undefined}
        // The job is not on screen anywhere else here — the rail card carries
        // its own link, but the composer covers the rail when open.
        workOrderHref={composeFor ? workOrderHref(composeFor.workOrderId) : undefined}
        divisionId={composeWorkOrder?.divisionId}
      />

      {/* Marking someone off never moves their work — the dialog says what is
          left booked instead, because a system that silently relocates a
          commitment is worse than one that tells you to deal with it. */}
      <TimeOffDialog
        tech={timeOffTech}
        date={date}
        bookedVisits={
          timeOffTech
            ? (byTech[timeOffTech.id] ?? []).filter((d) => d.status !== 'CANCELLED').length
            : 0
        }
        timeZone={timeZone}
        onClose={() => setTimeOffTech(null)}
      />

      {/* Right-click is the fast path on a board: it reaches the work order —
          the one thing the dispatch drawer cannot give a dispatcher — and the
          common verbs, without a drawer round-trip. */}
      <BlockContextMenu
        menu={menu}
        workOrderHref={workOrderHref}
        onClose={() => setMenu(null)}
        onOpenDetail={openVisit}
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
        onClose={() => openVisit(null)}
        onEdit={(d) => {
          openVisit(null);
          setEditDispatch(d);
        }}
        onDelete={() => {
          // Use the board's own row, not the drawer's callback argument —
          // the drawer hands back a plain Dispatch, and unschedule needs
          // `releasedAt` and `version` to decide between delete and cancel.
          // Same path the rail drop takes, so both routes behave alike.
          const target = openDispatch;
          openVisit(null);
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
