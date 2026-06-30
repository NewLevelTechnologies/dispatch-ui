import apiClient from './client';

export interface WorkOrderNote {
  id: string;
  workOrderId: string;
  body: string;
  /** Pinned-first ordering; server-maintained. (feature/wo-notes-pinned-edit) */
  pinned: boolean;
  /** Null on backfilled notes (original author unknown). Always set on POSTs. */
  createdByUserId: string | null;
  /** Server-denormalized; null when createdByUserId is null. */
  createdByUserName: string | null;
  createdAt: string;
  /** "Edited" marker = updatedAt > createdAt (no separate editedAt). */
  updatedAt: string;
  /** Soft-delete timestamp. Notes with deletedAt set are not returned by list(). */
  deletedAt?: string | null;
}

export interface CreateNoteRequest {
  body: string;
  /** Pin at creation; defaults to false server-side. */
  pinned?: boolean;
}

// PATCH is partial: send `body` to edit text, `pinned` to toggle the pin, or
// both. Omit a field to leave it unchanged.
export interface UpdateNoteRequest {
  body?: string;
  pinned?: boolean;
}

export const notesApi = {
  // Returns pinned-first, then newest-first (server-ordered).
  list: async (workOrderId: string): Promise<WorkOrderNote[]> => {
    const response = await apiClient.get<WorkOrderNote[]>(
      `/work-orders/${workOrderId}/notes`
    );
    return response.data;
  },

  create: async (workOrderId: string, request: CreateNoteRequest): Promise<WorkOrderNote> => {
    const response = await apiClient.post<WorkOrderNote>(
      `/work-orders/${workOrderId}/notes`,
      request
    );
    return response.data;
  },

  update: async (
    workOrderId: string,
    noteId: string,
    request: UpdateNoteRequest
  ): Promise<WorkOrderNote> => {
    const response = await apiClient.patch<WorkOrderNote>(
      `/work-orders/${workOrderId}/notes/${noteId}`,
      request
    );
    return response.data;
  },

  delete: async (workOrderId: string, noteId: string): Promise<void> => {
    await apiClient.delete(`/work-orders/${workOrderId}/notes/${noteId}`);
  },
};

export default notesApi;
