/* eslint-disable i18next/no-literal-string -- dense detail card; entity-facing strings go through t()/glossary, inline separators + short labels stay literal to match the customer/location notes cards. */
// Equipment notes — same shape + UX as the customer/location notes cards
// (shared NoteDto/NoteDialog, pinned-first), bound to the equipment notes
// endpoints (nested under the equipment id). Pinning is a no-op on the backend
// until the equipment-notes-pinning migration ships; the card handles it the
// same regardless (everything renders unpinned until then).
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { equipmentNotesApi, type EquipmentNote } from '../api';
import { Card } from './catalyst/card';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import IconButton from './IconButton';
import NoteDialog from './NoteDialog';
import ConfirmDialog from './ConfirmDialog';
import { showError, showSuccess, extractApiError } from '../lib/toast';
import { CardLink } from './customer-detail/shared';
import { formatTimestamp } from '../lib/formatTimestamp';

export default function EquipmentNotesCard({
  equipmentId,
  canEdit = true,
}: {
  equipmentId: string;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EquipmentNote | null>(null);
  const [deleting, setDeleting] = useState<EquipmentNote | null>(null);

  const queryKey = ['equipment-notes', equipmentId] as const;
  const { data: notes = [] } = useQuery({
    queryKey,
    queryFn: () => equipmentNotesApi.list(equipmentId),
    enabled: !!equipmentId,
  });

  // Mutations also touch the embedded recentNotes preview on the equipment detail.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: { body: string; pinned: boolean }) =>
      editing
        ? equipmentNotesApi.update(equipmentId, editing.id, values)
        : equipmentNotesApi.create(equipmentId, values),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      showSuccess(editing ? 'Note updated' : 'Note added');
    },
    onError: (err) => showError("Couldn't save note", extractApiError(err) ?? undefined),
  });

  const pinMutation = useMutation({
    mutationFn: (note: EquipmentNote) => equipmentNotesApi.update(equipmentId, note.id, { pinned: !note.pinned }),
    onSuccess: invalidate,
    onError: (err) => showError("Couldn't update note", extractApiError(err) ?? undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (note: EquipmentNote) => equipmentNotesApi.delete(equipmentId, note.id),
    onSuccess: () => {
      invalidate();
      setDeleting(null);
      showSuccess('Note deleted');
    },
    onError: (err) => showError("Couldn't delete note", extractApiError(err) ?? undefined),
  });

  const pinnedCount = notes.filter((n) => n.pinned).length;

  return (
    <>
      <Card
        title="Notes"
        action={
          canEdit ? (
            <CardLink
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              + Add
            </CardLink>
          ) : undefined
        }
        subtitle={pinnedCount > 0 ? `${pinnedCount} pinned` : undefined}
        padding="none"
      >
        {notes.length === 0 ? (
          <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">No notes yet.</div>
        ) : (
          <div className="flex flex-col gap-2 p-3">
            {notes.map((n) => (
              <div
                key={n.id}
                className="rounded-[6px] border-l-[3px] px-2.5 py-2"
                style={{
                  background: n.pinned
                    ? 'color-mix(in oklch, var(--warning-500) 9%, var(--bg-elev))'
                    : 'var(--bg-elev-2)',
                  borderLeftColor: n.pinned ? 'var(--warning-500)' : 'var(--border-strong)',
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-baseline gap-1.5">
                    <span className="text-[11.5px] font-semibold text-fg-strong">
                      {n.pinned && 'Pinned · '}
                      {n.authorName ?? 'Unknown'}
                    </span>
                    <span className="text-[10.5px] text-fg-dim">
                      {formatTimestamp(n.createdAt)}
                      {n.updatedAt > n.createdAt && ' · edited'}
                    </span>
                  </div>
                  {canEdit && (
                    <Dropdown>
                      <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                        <EllipsisVerticalIcon className="size-4" />
                      </DropdownButton>
                      <DropdownMenu anchor="bottom end">
                        <DropdownItem
                          onClick={() => {
                            setEditing(n);
                            setDialogOpen(true);
                          }}
                        >
                          <DropdownLabel>{t('common.edit')}</DropdownLabel>
                        </DropdownItem>
                        <DropdownItem onClick={() => pinMutation.mutate(n)}>
                          <DropdownLabel>{n.pinned ? 'Unpin' : 'Pin'}</DropdownLabel>
                        </DropdownItem>
                        <DropdownItem onClick={() => setDeleting(n)}>
                          <DropdownLabel>{t('common.delete')}</DropdownLabel>
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  )}
                </div>
                <div className="mt-0.5 whitespace-pre-wrap text-[12px] leading-normal text-fg">{n.body}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <NoteDialog
        isOpen={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        note={editing}
        onSave={(values) => saveMutation.mutate(values)}
        saving={saveMutation.isPending}
      />

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete this note?"
        message="This can't be undone."
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </>
  );
}
