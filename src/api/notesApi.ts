import apiClient from './client';

export interface WorkOrderNote {
  id: string;
  workOrderId: string;
  body: string;
  /** Null on backfilled notes (original author unknown). Always set on POSTs. */
  createdByUserId: string | null;
  /** Server-denormalized; null when createdByUserId is null. */
  createdByUserName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Soft-delete timestamp. Notes with deletedAt set are not returned by list(). */
  deletedAt?: string | null;
}

export interface CreateNoteRequest {
  body: string;
}

export const notesApi = {
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

  delete: async (workOrderId: string, noteId: string): Promise<void> => {
    await apiClient.delete(`/work-orders/${workOrderId}/notes/${noteId}`);
  },
};

export default notesApi;
