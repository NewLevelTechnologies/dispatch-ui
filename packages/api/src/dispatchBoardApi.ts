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
import type { DispatchBoardRow, DispatchStatus } from './schedulingApi';
import type { WorkOrderPriority } from './workOrderApi';

// Where a technician's position came from. Telematics and the mobile app
// coexist in one fleet, and plenty of techs report neither — see `location`.
export type TechLocationSource = 'telematics' | 'app';

export interface TechLocation {
  lat: number;
  lng: number;
  // Timestamp of the fix. The UI derives staleness from it rather than the
  // server pre-computing "stale", so the threshold stays a display decision.
  at: string;
  source: TechLocationSource;
}

// Present only when an `availability` row with status = OFF covers the
// requested date. Its presence is what makes the row undroppable.
export interface TechTimeOff {
  allDay: boolean;
  label: string;
}

// A board row. NOT every user: the server filters to
// `enabled && roles.any { performsFieldWork }` (dispatch-board.md §2.2), so a
// CSR or dispatcher who merely has dispatch regions assigned is not a row.
// `performsFieldWork` is echoed for display/debugging; do not re-filter on it.
export interface BoardTech {
  id: string;
  name: string;
  performsFieldWork: boolean;
  // M:N — a tech can cover several regions but renders in exactly one group
  // (their primary), with filtering matching on any of them.
  regionIds: string[];
  primaryRegionId: string | null;
  // Absent = available. Present = out for the date; row hatches and rejects drops.
  availability?: TechTimeOff | null;
  // Absent = no signal at all, which must render as NOTHING — not an error,
  // not a zero state. Most fleets have techs in all three tiers.
  location?: TechLocation | null;
}

// Extends the DENORMALIZED board projection, not the bare `Dispatch`: a block
// renders the WO number, the WO summary and the customer name, and §2.1 says
// the board read reuses `DispatchRepository.searchBoard`, which already
// LEFT-joins work_order_cache and user_cache for exactly those fields.
//
// Region NAMES are not in scheduling-service — it holds only the user↔region
// link. The board joins ids to names client-side from
// `dispatchRegionApi.getAll()` (GET /tenant/dispatch-regions).
export interface BoardDispatch extends DispatchBoardRow {
  // Derived server-side, never stored: straight-line distance from the
  // previous stop × a per-region road factor. Null on a tech's first stop.
  driveMinFromPrev: number | null;
  // Null = staged "on deck", not yet released to the tech. ORTHOGONAL to
  // status — a SCHEDULED and an EN_ROUTE dispatch can both be unreleased.
  // Never derive this from status.
  releasedAt: string | null;
  // Optimistic-concurrency token. Round-trips on PUT; a mismatch is a 409.
  version: number;

  // GAP (dispatch-board.md §2.2 vs §3.3): the design puts a 4px danger rail
  // on URGENT blocks and a ⟳ glyph on agreement work, but neither field is in
  // the specified `dispatches[]` contract. Both live on the WORK ORDER, so the
  // board read has to denormalize them the way it already denormalizes
  // customerName. Typed optional and rendered defensively so the board
  // degrades quietly until they land — but URGENT is the most operationally
  // important signal on this surface, so it should not stay missing.
  priority?: WorkOrderPriority;
  recurring?: boolean;
}

export interface DispatchBoard {
  techs: BoardTech[];
  dispatches: BoardDispatch[];
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
  id: string;
  workOrderNumber: string | null;
  workOrderSummary: string | null;
  customerId: string | null;
  customerName: string | null;
  locationId: string | null;
  priority: WorkOrderPriority;
  // Count only — the rail does not carry the items themselves. Opening the
  // composer fetches them (the drawer requires a full WorkItemResponse[]).
  itemCount: number;
  // Agreement/PM work, derived from agreementId / sourceType upstream.
  recurring: boolean;
  createdAt: string;
  // GAP (dispatch-board.md §2.2 vs the mock): the rail CARD renders a
  // division and a region line, and the board's division filter has to apply
  // to the rail as well as the grid — but neither `divisionId` nor
  // `dispatchRegionId` is in the specified contract. Both exist on
  // `WorkOrder`. Left off the type deliberately rather than invented; add
  // them here once BE confirms, and join ids to names client-side the same
  // way tech regions are joined.
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
