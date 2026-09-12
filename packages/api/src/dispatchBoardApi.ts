// Dispatch board read — GET /scheduling/board
//
// The board's own read, separate from `dispatchesApi.getAll()` (the paged
// tenant-wide dispatch list). Two reasons they don't share: the board is
// day-bounded and unpaged (~300 rows), and it carries `techs[]` — rows exist
// for technicians with no work, which a dispatch list can't express.
//
// The unscheduled rail is a SECOND endpoint, not part of this envelope: it
// paginates and filters independently of the grid. See `getUnscheduled`.
//
// Contract per claude_designs/dispatch-board.md §2.2. Only
// `/api/v1/scheduling*` reaches scheduling-service at the ALB, so every path
// here lives under `/scheduling`.
import apiClient from './client';
import type { DispatchStatus } from './schedulingApi';
import type { WorkOrderPriority } from './workOrderApi';

// NOTE: there is deliberately no `location` on BoardTech. Nothing in the
// platform captures technician position, so the field would be null for every
// tech forever — and a type that promises data no producer writes is the same
// lie as a fabricated default. The map's position-overlay design (handoff
// §3.5) stands for whenever a producer exists; add the field then.

// One absence span from an `availability` row with status = OFF, clipped
// server-side to the requested day — so a week of PTO arrives as that day's
// slice and the client never intersects anything.
//
// A LIST, not one object: nothing prevents two absences on the same day
// (no uniqueness on (user, date) at the entity or the table, and the
// availability API permits it). A dentist appointment at 9 plus leaving at 3
// is one tech and two rows; collapsing them would render an arbitrary label
// over an arbitrary span.
export interface TechTimeOff {
  startsAt: string;
  endsAt: string;
  // The LABELLING distinction, not a redundancy: all-day reads "Out —
  // Vacation" while a span reads "Out 8:00–12:00".
  //
  // Also set defensively by the server when a row's stored times don't
  // overlap the requested day at all — reachable while the entity still
  // stores a bare duration rather than instants. A row exists, so the tech
  // is off; rendering them available is the one error this board cannot
  // afford to make permissively. The §0b reshape removes the ambiguity.
  allDay: boolean;
  label: string;
}

// A board row. NOT every user: the server filters to enabled AND
// performsFieldWork (from tenant_roles.performs_field_work), so a CSR or
// dispatcher who merely has dispatch regions is not a row. The flag itself is
// not echoed — the filtering already happened.
export interface BoardTech {
  id: string;
  name: string;
  // M:N. FILTERING matches any of these, so narrowing to East Valley still
  // finds the Phoenix tech who also covers it.
  regionIds: string[];
  // GROUPING keys off this one, so a tech renders exactly once. Null when no
  // assignment is marked primary.
  primaryRegionId: string | null;
  // Booked stops today — the load bar's numerator. Server-computed over the
  // whole day, NOT over whatever the exception chips currently show: counting
  // the filtered set would shrink every bar the moment a chip is on.
  stopCount: number;
  // Empty = available all day. Each span hatches its own slice of the lane
  // and rejects drops there — a tech out all morning is still bookable in the
  // afternoon, which is the whole point of spans over a boolean.
  timeOff?: TechTimeOff[];
}

// Mirrors BoardDispatchResponse. Deliberately NOT `extends DispatchBoardRow`:
// that projection carries notes/createdAt/updatedAt/workOrderTypeName, none of
// which the board read sends, and inheriting them would be a type that lies
// about the payload.
//
// Region NAMES are not in scheduling-service — it holds only the user↔region
// link — so ids are joined to names client-side from
// `dispatchRegionApi.getAll()` (GET /tenant/dispatch-regions).
export interface BoardDispatch {
  id: string;
  seq: number;
  status: DispatchStatus;
  // The block geometry is the arrival WINDOW, never a start/end time.
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  // Minutes. Nullable and defaulted nowhere — null renders as an outline with
  // no fill, which is the honest "we promised a window, we don't know how long
  // the work takes". Never substitute a default.
  estimatedDuration: number | null;
  // Null = on deck, not yet handed to the tech. ORTHOGONAL to status: a
  // dispatch can be unreleased at any status. Never derive this from status.
  releasedAt: string | null;
  // Round-trips on PUT for stale-read protection; a mismatch is a 409.
  version: number;
  assignedUserId: string;
  assignedUserName: string | null;
  workOrderId: string;
  workOrderNumber: string | null;
  workOrderTypeId: string | null;
  workOrderSummary: string | null;
  customerId: string | null;
  customerName: string | null;
  priority: WorkOrderPriority | null;
  // Agreement-generated work; the board marks it with a recurrence glyph.
  recurring: boolean;
  serviceLocationId: string | null;
  serviceLocationCity: string | null;
  serviceLocationState: string | null;
  // Null when the site never geocoded. The map reports these via
  // `dispatchesMissingCoordinates` rather than dropping the pins.
  latitude: number | null;
  longitude: number | null;
  // Derived per read, never stored: every reschedule invalidates a route's
  // legs. Null on the first stop, and null when either end lacks coordinates —
  // the board suppresses the connector rather than inventing a number.
  driveMinFromPrev: number | null;
  arrivedAt: string | null;
  departedAt: string | null;
  addressedWorkItemIds: string[];
}

export interface DispatchBoard {
  // Echoed so a client can tell a stale response from a current one after a
  // fast date change.
  date: string;
  // The tenant's IANA zone, which `date` was resolved in. The axis and the
  // now-line are drawn in it — taking the zone from the browser instead puts
  // every block in the wrong column for anyone outside the tenant's zone.
  timeZone: string;
  techs: BoardTech[];
  dispatches: BoardDispatch[];
  // How many of the day's dispatches sit at a location with no coordinates.
  // The map has to say "3 jobs have no location" rather than silently
  // dropping those pins.
  dispatchesMissingCoordinates: number;
  // Load-bar denominator, from scheduling-service config
  // (`app.dispatch.default-stops-per-day`). Absent = render the stop count
  // with NO bar. The board's own rule is that a load bar needs a real
  // denominator or it is decoration, and this number has already drifted
  // twice against a hardcoded copy. Deliberately no client fallback.
  defaultStopsPerDay?: number;
}

// ── Week ────────────────────────────────────────────────────────────
// A different READ, not a different spine. Seven days of a 60-tech shop is
// ~2,000 dispatches and the week grid renders none of them individually, so
// the server aggregates to one cell per tech per day rather than the client
// calling the day read seven times.

/** One tech, one day. Deliberately NOT booked hours: no labor estimate exists
 *  anywhere in the platform, which is the same reason the day board's load bar
 *  counts stops. */
export interface BoardWeekCell {
  date: string;
  // Excludes cancelled and no-show — work the tech will not drive to.
  stopCount: number;
  hasUrgent: boolean;
  // Any dispatch that day still on deck. At week scale this is the "which
  // days still have unhanded-over work" glance, which is the whole reason a
  // dispatcher opens the week while staging.
  hasUnreleased: boolean;
  // Time off overlapping this day. Per CELL, not per row — a tech can be out
  // Thursday and working Friday.
  off: boolean;
}

export interface BoardWeekTech {
  id: string;
  name: string;
  regionIds: string[];
  primaryRegionId: string | null;
  // Always one entry per day in `days`, zero-filled, so the grid renders
  // without gap-handling. A tech with no work all week is still a row.
  cells: BoardWeekCell[];
}

export interface BoardWeek {
  weekStart: string;
  // Exclusive — the same half-open convention as the day read.
  weekEnd: string;
  timeZone: string;
  // The seven dates, in order. Rendered from the SERVER's idea of the week
  // rather than recomputed, so a week containing a DST change still has
  // exactly seven columns and the two sides cannot disagree.
  days: string[];
  defaultStopsPerDay?: number;
  techs: BoardWeekTech[];
}

export interface GetWeekParams {
  // Any date in the week; the server resolves the week it belongs to in the
  // TENANT's timezone and echoes the days it used.
  weekStart: string;
  regionIds?: string[];
}

export interface GetBoardParams {
  // Local calendar date (YYYY-MM-DD), resolved to an instant range server-side
  // in the TENANT's timezone — not the browser's and not the server's.
  date: string;
  // Narrows within what the server already allows. Scope is enforced
  // server-side from the caller's own regions; this only ever subtracts.
  regionIds?: string[];
}

// One rail card per WORK ORDER, not per work item: a WO with three items may
// need two visits, and which items a visit covers is the composer's decision.
export interface UnscheduledWorkOrder {
  // `workOrderId`, NOT `id` — the row is a work order, not a dispatch.
  workOrderId: string;
  workOrderNumber: string;
  workOrderSummary: string | null;
  workOrderTypeId: string | null;
  customerId: string;
  customerName: string;
  serviceLocationId: string;
  serviceLocationCity: string;
  serviceLocationState: string;
  latitude: number | null;
  longitude: number | null;
  priority: WorkOrderPriority;
  // Correct at creation and then stale until the order is next updated —
  // work-order-service publishes no event for item add/remove. The same
  // caveat applies to `workOrderSummary`, derived from the items.
  itemCount: number;
  recurring: boolean;
  // The card renders both, and the division filter applies to the rail as
  // well as the grid. Ids only — names are joined client-side.
  dispatchRegionId: string | null;
  divisionId: string | null;
  // The rail sorts on priority, then age from here.
  createdAt: string;
}

export interface UnscheduledPage {
  content: UnscheduledWorkOrder[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export interface GetUnscheduledParams {
  regionIds?: string[];
  q?: string;
  page?: number;
  size?: number;
}

export interface ReleaseRequest {
  date: string;
  regionIds?: string[];
}

export interface ReleaseResponse {
  released: number;
}

export const dispatchBoardApi = {
  // The grid read. Day-bounded and unpaged by design — a tenant-day is ~300
  // rows, and paging a timeline would mean paging techs, which breaks the
  // "every tech has a row" premise.
  getBoard: async (params: GetBoardParams): Promise<DispatchBoard> => {
    const response = await apiClient.get<DispatchBoard>('/scheduling/board', { params });
    return response.data;
  },

  // The week read. A separate endpoint rather than seven day reads: the
  // aggregate is ~420 cells where the rows would be ~2,000 dispatches, and
  // the grouping happens in one query instead of in the client.
  getWeek: async (params: GetWeekParams): Promise<BoardWeek> => {
    const response = await apiClient.get<BoardWeek>('/scheduling/board/week', { params });
    return response.data;
  },

  // The rail read. Paged separately from the grid so scrolling the inbox
  // never refetches the board.
  getUnscheduled: async (params: GetUnscheduledParams = {}): Promise<UnscheduledPage> => {
    const { page = 0, size = 50, ...rest } = params;
    const response = await apiClient.get<UnscheduledPage>('/scheduling/board/unscheduled', {
      params: { ...rest, page, size },
    });
    return response.data;
  },

  // Bulk release takes a SCOPE, not an id list: an id list would let a client
  // release dispatches outside its own regions, and scope is a permission.
  // The server recomputes the unreleased set, so the button can't act on a
  // stale board either.
  release: async (request: ReleaseRequest): Promise<ReleaseResponse> => {
    const response = await apiClient.post<ReleaseResponse>(
      '/scheduling/dispatches/release',
      request,
    );
    return response.data;
  },
};

export type { DispatchStatus };

export default dispatchBoardApi;
