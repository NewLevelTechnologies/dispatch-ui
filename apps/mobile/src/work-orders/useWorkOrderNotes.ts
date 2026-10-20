import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notesApi } from '../api/setup';

/**
 * Work-order-scoped notes — `notesApi` (plural), not the singular
 * `noteApi.ts` (customer/service-location notes only). Server-ordered
 * pinned-first then newest-first, so no client sort needed.
 */
export function useWorkOrderNotes(workOrderId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['work-order-notes', workOrderId];

  const query = useQuery({
    queryKey,
    queryFn: () => notesApi.list(workOrderId),
  });

  const createNote = useMutation({
    mutationFn: (body: string) => notesApi.create(workOrderId, { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    addNote: createNote.mutate,
    isAdding: createNote.isPending,
    addNoteError: createNote.error,
  };
}
