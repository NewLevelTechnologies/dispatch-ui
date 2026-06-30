import apiClient from './client';

// Shared note subsystem for customers and their service locations. Both parents
// expose the same NoteDto shape; edit/pin/unpin/delete act on a bare note id
// (`/notes/{id}`), so they're parent-agnostic.
//
// NOT to be confused with:
//   - `notesApi`          → work-order notes (`/work-orders/{id}/notes`)
//   - `equipmentNotesApi` → equipment notes  (`/equipment/{id}/notes`)
// Those are separate, pre-existing APIs under work-order-service.

export interface NoteDto {
  id: string;
  body: string;
  /** Server-maintained; pinned notes sort first. */
  pinned: boolean;
  /**
   * Set server-side from the JWT (the FE never sends it). Null on notes
   * backfilled from the legacy single-string `notes` field.
   */
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateNoteRequest {
  /** Required; blank body is a validation error server-side. */
  body: string;
  /** Optional — pin at creation. Defaults to false server-side. */
  pinned?: boolean;
}

// PATCH is partial: send `body` to edit text, `pinned` to toggle the pin, or
// both. Omit a field to leave it unchanged.
export interface UpdateNoteRequest {
  body?: string;
  pinned?: boolean;
}

export const noteApi = {
  // Service-location notes — returned pinned-first by the server.
  listForServiceLocation: async (serviceLocationId: string): Promise<NoteDto[]> => {
    const response = await apiClient.get<NoteDto[]>(`/service-locations/${serviceLocationId}/notes`);
    return response.data;
  },
  createForServiceLocation: async (serviceLocationId: string, request: CreateNoteRequest): Promise<NoteDto> => {
    const response = await apiClient.post<NoteDto>(`/service-locations/${serviceLocationId}/notes`, request);
    return response.data;
  },

  // Customer notes — same shape, ready for the customer-detail screen.
  listForCustomer: async (customerId: string): Promise<NoteDto[]> => {
    const response = await apiClient.get<NoteDto[]>(`/customers/${customerId}/notes`);
    return response.data;
  },
  createForCustomer: async (customerId: string, request: CreateNoteRequest): Promise<NoteDto> => {
    const response = await apiClient.post<NoteDto>(`/customers/${customerId}/notes`, request);
    return response.data;
  },

  // Parent-agnostic mutations on a single note.
  update: async (noteId: string, request: UpdateNoteRequest): Promise<NoteDto> => {
    const response = await apiClient.patch<NoteDto>(`/notes/${noteId}`, request);
    return response.data;
  },
  delete: async (noteId: string): Promise<void> => {
    await apiClient.delete(`/notes/${noteId}`);
  },
};

export default noteApi;
