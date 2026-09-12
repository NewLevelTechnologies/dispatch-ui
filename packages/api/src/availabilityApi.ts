// ─────────────────────────────────────────────────────────────────────
// Availability — absence spans, not a shift schedule.
//
// The entity is a SPAN: `startsAt`/`endsAt`/`allDay`, so "out all next week"
// is one row rather than five. The older shape carried a date plus a start and
// an end time — three overlapping representations of one fact — and this is
// the reshaped one.
//
// The dispatch board is a CLIENT of this, not its owner: it reads spans to
// hatch a technician's row and refuse drops there, and it writes one when a
// technician calls out, because 6:40am on the board is where that need
// actually arises.
//
// No shift templates, no approval workflow, no accrual. A row exists or it
// does not.
// ─────────────────────────────────────────────────────────────────────
import { apiClient } from './client';

/** Only OFF makes a technician unavailable to the board; the rest of the enum
 *  predates it and the board never writes them. */
export type AvailabilityStatus = 'AVAILABLE' | 'BUSY' | 'OFF' | 'UNAVAILABLE';

export interface Availability {
  id: string;
  userId: string;
  startsAt: string;
  endsAt: string;
  // The labelling distinction, not a redundancy: all-day reads "Out —
  // Vacation" while a span reads "Out 8:00–12:00".
  allDay: boolean;
  status: AvailabilityStatus;
  // What the board prints on the hatched row. Required by the server, so a
  // hatched row always says something.
  label: string;
  reason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAvailabilityRequest {
  userId: string;
  startsAt: string;
  endsAt: string;
  allDay?: boolean;
  status?: AvailabilityStatus;
  label: string;
  reason?: string | null;
  notes?: string | null;
}

export interface ListAvailabilityParams {
  userId?: string;
  status?: AvailabilityStatus;
  // `from`/`to` select spans that OVERLAP the range rather than start inside
  // it — a week-long absence is one row, so a question about Wednesday has to
  // find it from the middle.
  from?: string;
  to?: string;
  page?: number;
  size?: number;
}

export interface AvailabilityPage {
  content: Availability[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  first: boolean;
  last: boolean;
}

export const availabilityApi = {
  list: async (params: ListAvailabilityParams = {}): Promise<AvailabilityPage> => {
    const { page = 0, size = 50, ...rest } = params;
    const response = await apiClient.get<AvailabilityPage>('/scheduling/availability', {
      params: { ...rest, page, size },
    });
    return response.data;
  },

  create: async (request: CreateAvailabilityRequest): Promise<Availability> => {
    const response = await apiClient.post<Availability>('/scheduling/availability', request);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/scheduling/availability/${id}`);
  },
};

export default availabilityApi;
