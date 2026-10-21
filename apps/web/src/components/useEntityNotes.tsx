// Notes for one entity: the list query, the CRUD mutations, and the overlays
// that act on them (show-all drawer, add/edit dialog, delete confirm). The
// NotesCard renders a preview on top of it; surfaces without the card (the
// Compact work order overview) open the same drawer from their own button.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  noteApi,
  notesApi,
  equipmentNotesApi,
  agreementNotesApi,
  type NoteDto,
  type WorkOrderNote,
} from '../api/setup';
import NotesDrawer from './NotesDrawer';
import NoteDialog from './NoteDialog';
import ConfirmDialog from './ConfirmDialog';
import { showError, showSuccess, extractApiError } from '../lib/toast';

export type NoteEntityType = 'customer' | 'service_location' | 'equipment' | 'agreement' | 'work_order';

// Per-entity CRUD binding. Mutations on flat customer/location notes ignore the
// entity id (they act on `/notes/{noteId}`); equipment nests under it. List /
// create / update returns are NoteDto-shaped for every entity (EquipmentNote is
// a superset), so the card stays untyped to the entity.
interface NotesBinding {
  queryKey: readonly unknown[];
  // Caches that embed a notes copy (detail payloads) and must refresh on write.
  extraInvalidateKeys: readonly (readonly unknown[])[];
  list: () => Promise<NoteDto[]>;
  create: (values: { body: string; pinned: boolean }) => Promise<NoteDto>;
  update: (noteId: string, values: { body?: string; pinned?: boolean }) => Promise<NoteDto>;
  remove: (noteId: string) => Promise<void>;
}

// Work-order notes ship a slightly different DTO (createdByUserName vs the
// shared authorName); both now carry `pinned`. Adapt to the shared NoteDto so
// the card stays parent-agnostic.
function woNoteToDto(w: WorkOrderNote): NoteDto {
  return {
    id: w.id,
    body: w.body,
    pinned: w.pinned,
    authorName: w.createdByUserName,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

function getBinding(entityType: NoteEntityType, id: string): NotesBinding {
  switch (entityType) {
    case 'equipment':
      return {
        queryKey: ['equipment-notes', id],
        extraInvalidateKeys: [['equipment-detail', id]],
        list: () => equipmentNotesApi.list(id),
        create: (values) => equipmentNotesApi.create(id, values),
        update: (noteId, values) => equipmentNotesApi.update(id, noteId, values),
        remove: (noteId) => equipmentNotesApi.delete(id, noteId),
      };
    case 'agreement':
      return {
        queryKey: ['agreement-notes', id],
        extraInvalidateKeys: [['agreement', id]],
        list: () => agreementNotesApi.list(id),
        create: (values) => agreementNotesApi.create(id, values),
        update: (noteId, values) => agreementNotesApi.update(id, noteId, values),
        remove: (noteId) => agreementNotesApi.delete(id, noteId),
      };
    case 'customer':
      return {
        queryKey: ['customer-notes', id],
        extraInvalidateKeys: [],
        list: () => noteApi.listForCustomer(id),
        create: (values) => noteApi.createForCustomer(id, values),
        update: (noteId, values) => noteApi.update(noteId, values),
        remove: (noteId) => noteApi.delete(noteId),
      };
    case 'service_location':
      return {
        queryKey: ['service-location-notes', id],
        extraInvalidateKeys: [['service-location', id]],
        list: () => noteApi.listForServiceLocation(id),
        create: (values) => noteApi.createForServiceLocation(id, values),
        update: (noteId, values) => noteApi.update(noteId, values),
        remove: (noteId) => noteApi.delete(noteId),
      };
    case 'work_order':
      // WO notes are work-order-scoped (PATCH/DELETE under /work-orders/{id}/
      // notes/{noteId}), distinct from the parent-agnostic /notes/{id} route
      // customer/location use. Adapt WorkOrderNote → NoteDto.
      return {
        queryKey: ['work-order-notes', id],
        extraInvalidateKeys: [['work-orders', id]],
        list: () => notesApi.list(id).then((notes) => notes.map(woNoteToDto)),
        create: (values) => notesApi.create(id, values).then(woNoteToDto),
        update: (noteId, values) => notesApi.update(id, noteId, values).then(woNoteToDto),
        remove: (noteId) => notesApi.delete(id, noteId),
      };
  }
}

export function useEntityNotes({
  entityType,
  entityId,
  canEdit = true,
  canAdd = canEdit,
  initialData,
}: {
  entityType: NoteEntityType;
  entityId: string;
  canEdit?: boolean;
  canAdd?: boolean;
  initialData?: NoteDto[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoteDto | null>(null);
  const [deleting, setDeleting] = useState<NoteDto | null>(null);

  // Drawer open state lives in the URL (?notes) so Esc / scrim / back-button all
  // close it and the open view is linkable. Opening pushes a history entry (so
  // Back closes the drawer); closing replaces it (so an explicit close doesn't
  // leave a "?notes" entry that Back would reopen).
  const drawerOpen = searchParams.has('notes');
  const setDrawerOpen = (next: boolean) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (next) params.set('notes', '1');
        else params.delete('notes');
        return params;
      },
      next ? {} : { replace: true },
    );

  const binding = useMemo(() => getBinding(entityType, entityId), [entityType, entityId]);

  const { data: notes = [] } = useQuery({
    queryKey: binding.queryKey,
    queryFn: binding.list,
    enabled: !!entityId,
    initialData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: binding.queryKey });
    binding.extraInvalidateKeys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  const createMutation = useMutation({
    mutationFn: (values: { body: string; pinned: boolean }) => binding.create(values),
    onSuccess: () => {
      invalidate();
      // No-op when the create came from the drawer composer (dialog is closed).
      setDialogOpen(false);
      setEditing(null);
      showSuccess('Note added');
    },
    onError: (err) => showError("Couldn't save note", extractApiError(err) ?? undefined),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: { body: string; pinned: boolean } }) =>
      binding.update(id, values),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      showSuccess('Note updated');
    },
    onError: (err) => showError("Couldn't save note", extractApiError(err) ?? undefined),
  });

  const pinMutation = useMutation({
    mutationFn: (note: NoteDto) => binding.update(note.id, { pinned: !note.pinned }),
    onSuccess: invalidate,
    onError: (err) => showError("Couldn't update note", extractApiError(err) ?? undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (note: NoteDto) => binding.remove(note.id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      showSuccess('Note deleted');
    },
    onError: (err) => showError("Couldn't delete note", extractApiError(err) ?? undefined),
  });

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (note: NoteDto) => {
    setEditing(note);
    setDialogOpen(true);
  };
  const handleSave = (values: { body: string; pinned: boolean }) => {
    if (editing) updateMutation.mutate({ id: editing.id, values });
    else createMutation.mutate(values);
  };

  const overlays = (
    <>
      <NotesDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notes={notes}
        canEdit={canEdit}
        canAdd={canAdd}
        onCreate={(values) => createMutation.mutateAsync(values)}
        onEdit={openEdit}
        onPin={(n) => pinMutation.mutate(n)}
        onDelete={setDeleting}
        creating={createMutation.isPending}
      />

      <NoteDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        note={editing}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title={t('notes.delete.title')}
        message={t('notes.delete.message')}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </>
  );

  return {
    notes,
    openAdd,
    openEdit,
    openDrawer: () => setDrawerOpen(true),
    pin: (note: NoteDto) => pinMutation.mutate(note),
    requestDelete: setDeleting,
    overlays,
  };
}
