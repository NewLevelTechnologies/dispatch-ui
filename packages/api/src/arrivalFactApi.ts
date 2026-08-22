import apiClient from './client';

// Structured arrival facts for a service location — the label/value list that
// sits beside the free-form arrival prose (`accessInstructions`). Facts are
// location-scoped and managed independently of the prose: gate codes, lockbox
// combos, parking, key location, etc.
//
// The prose ("Before you arrive") is still the `accessInstructions` field on
// the location and is edited via customerApi.updateServiceLocation — NOT here.
// These endpoints manage only the structured facts.

export interface ArrivalFactDto {
  id: string;
  label: string;
  value: string;
  /** Display hint — render the value monospaced (codes, combos). */
  mono: boolean;
  /** Display hint — value is a multi-line block. */
  multiline: boolean;
  /** Last-touched-by; server-stamped on create + edit. Null on backfill. */
  authorName: string | null;
  authorUserId: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateArrivalFactRequest {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
  displayOrder?: number;
}

// PATCH is partial — send only the fields you're changing.
export interface UpdateArrivalFactRequest {
  label?: string;
  value?: string;
  mono?: boolean;
  multiline?: boolean;
  displayOrder?: number;
}

export const arrivalFactApi = {
  // Ordered by displayOrder. Usable for first paint, but the detail payload
  // also carries `arrivalFacts`, so the card seeds from there and refetches
  // this as the live source for add/edit/delete.
  listForServiceLocation: async (serviceLocationId: string): Promise<ArrivalFactDto[]> => {
    const response = await apiClient.get<ArrivalFactDto[]>(
      `/service-locations/${serviceLocationId}/arrival-facts`
    );
    return response.data;
  },
  createForServiceLocation: async (
    serviceLocationId: string,
    request: CreateArrivalFactRequest
  ): Promise<ArrivalFactDto> => {
    const response = await apiClient.post<ArrivalFactDto>(
      `/service-locations/${serviceLocationId}/arrival-facts`,
      request
    );
    return response.data;
  },

  // Fact-scoped mutations (no location id in the path).
  update: async (factId: string, request: UpdateArrivalFactRequest): Promise<ArrivalFactDto> => {
    const response = await apiClient.patch<ArrivalFactDto>(`/arrival-facts/${factId}`, request);
    return response.data;
  },
  delete: async (factId: string): Promise<void> => {
    await apiClient.delete(`/arrival-facts/${factId}`);
  },

  // Tenant-learned label typeahead seed — distinct labels already in use. Grows
  // over time; empty on a fresh tenant (the card falls back to a default seed).
  suggestedLabels: async (): Promise<string[]> => {
    const response = await apiClient.get<string[]>(`/arrival-facts/suggested-labels`);
    return response.data;
  },
};

export default arrivalFactApi;
