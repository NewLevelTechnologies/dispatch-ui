// Technician "My day" — GET /scheduling/my-day
//
// The caller's own day, AS RELEASED TO THEM. Always the signed-in user;
// there is no user parameter. Contract: dispatch-api
// handoff/FE_HANDOFF_my_day.md.
//
// What "as released" means for a client:
// - Never-released (on deck) work isn't returned at all.
// - A job moved but not re-released keeps the window the tech was SENT. So
//   never take a window from GET /scheduling/dispatches/{id}: that's the live
//   one, which may be an unreleased change.
// - A job reassigned, unscheduled or cancelled but not yet released stays on
//   the day as SCHEDULED with `version: null`; status and detail calls on it
//   404 until the removal is released.
import apiClient from './client';
import type { DispatchStatus } from './schedulingApi';
import type { WorkOrderPriority } from './workOrderApi';

export interface MyDayStop {
  dispatchId: string;
  // "Trip N". Null only when the dispatch was deleted and its removal is
  // still pending release.
  seq: number | null;
  status: DispatchStatus;
  // The RELEASED window.
  arrivalWindowStart: string;
  arrivalWindowEnd: string;
  releasedAt: string;
  // Round-trip on PUT /scheduling/dispatches/{id}. Null when this is no
  // longer the tech's live work (a removal pending release).
  version: number | null;
  estimatedDuration: number | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  departedAt: string | null;
  // Null on the first stop, or when either site lacks coordinates.
  driveMinFromPrev: number | null;
  workOrderId: string;
  workOrderNumber: string | null;
  workOrderSummary: string | null;
  workOrderTypeId: string | null;
  priority: WorkOrderPriority | null;
  // Agreement-generated work.
  recurring: boolean;
  customerId: string | null;
  customerName: string | null;
  serviceLocationId: string | null;
  serviceLocationName: string | null;
  serviceLocationStreet: string | null;
  serviceLocationCity: string | null;
  serviceLocationState: string | null;
  serviceLocationZip: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MyDayResponse {
  date: string;
  timeZone: string;
  // Arrival order, as sent.
  stops: MyDayStop[];
}

export const myDayApi = {
  // `date` is a tenant-local YYYY-MM-DD; omitted, the server uses today in the
  // tenant's zone — so a client never sends instants.
  getDay: async (date?: string): Promise<MyDayResponse> => {
    const response = await apiClient.get<MyDayResponse>('/scheduling/my-day', {
      params: date ? { date } : undefined,
    });
    return response.data;
  },
};
