// Shared notes card for the redesigned detail pages. One fetch drives the whole
// thing: the server returns notes pinned-first then newest, so the overview card
// shows ALL pinned (amber) + the 3 most recent unpinned, with a "Show all {N} →"
// link that opens the NotesDrawer (a right-side slide-over, never a modal) for
// the full set + search + paging + inline add. Notes never get a tab.
//
// `entityType` selects the binding — customer/location act on a bare
// `/notes/{id}`; equipment notes are nested under the equipment id. Both expose
// the same NoteDto shape (EquipmentNote is a structural superset), so the card
// is parent-agnostic. Replaces the former per-entity CustomerNotesCard /
// EquipmentNotesCard / inline location NotesCard.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { noteApi, equipmentNotesApi, agreementNotesApi, type NoteDto } from '../api';
import { Card } from './catalyst/card';
import { CardTitle, CardLink } from './customer-detail/shared';
import { NoteRow } from './NoteRow';
import NotesDrawer from './NotesDrawer';
import NoteDialog from './NoteDialog';
import ConfirmDialog from './ConfirmDialog';
import { showError, showSuccess, extractApiError } from '../lib/toast';

export type NoteEntityType = 'customer' | 'service_location' | 'equipment' | 'agreement';

// All pinned notes always show; this caps the unpinned tail in the card. Beyond
// it, the drawer carries the rest.
const UNPINNED_PREVIEW = 3;

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
  }
}

export default function NotesCard({
  entityType,
  entityId,
  canEdit = true,
  initialData,
}: {
  entityType: NoteEntityType;
  entityId: string;
  canEdit?: boolean;
  // First-paint seed for entities whose detail payload embeds the full notes
  // array (service location). Must be the complete set, not a preview.
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

  const pinnedCount = notes.filter((n) => n.pinned).length;
  // Server order is pinned-first then newest, so a plain split preserves it.
  const pinned = notes.filter((n) => n.pinned);
  const unpinned = notes.filter((n) => !n.pinned);
  const previewNotes = [...pinned, ...unpinned.slice(0, UNPINNED_PREVIEW)];
  const hasMore = notes.length > previewNotes.length;

  return (
    <>
      <Card
        title={
          <CardTitle>
            {t('notes.title')}
            {pinnedCount > 0 && (
              <span className="ml-1 text-[10px] font-medium text-fg-muted">
                · {t('notes.pinnedCount', { count: pinnedCount })}
              </span>
            )}
          </CardTitle>
        }
        action={
          canEdit ? (
            <CardLink onClick={openAdd}>
              + {t('common.add')}
            </CardLink>
          ) : undefined
        }
        padding="none"
      >
        {notes.length === 0 ? (
          <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">{t('notes.empty')}</div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {previewNotes.map((note) => (
              <NoteRow
                key={note.id}
                note={note}
                canEdit={canEdit}
                onEdit={openEdit}
                onPin={(n) => pinMutation.mutate(n)}
                onDelete={setDeleting}
              />
            ))}
            {hasMore && (
              <CardLink className="self-start" onClick={() => setDrawerOpen(true)}>
                {t('notes.showAll', { count: notes.length })} →
              </CardLink>
            )}
          </div>
        )}
      </Card>

      <NotesDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notes={notes}
        canEdit={canEdit}
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
}
