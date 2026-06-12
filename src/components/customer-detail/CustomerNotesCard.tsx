/* eslint-disable i18next/no-literal-string -- dense detail card; entity-facing strings go through t()/glossary, inline separators + short labels stay literal to match ServiceLocationDetailPage. */
// Customer notes — pinned-first knowledge the desk keeps on an account
// (billing quirks, escalation protocol, "runs slow, don't panic"). Shared shape
// with the location notes card (same NoteDto + NoteDialog); this is the
// customer-parent binding. Reused by the SINGLE variant later.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';
import { noteApi, type NoteDto } from '../../api';
import { Card } from '../catalyst/card';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import IconButton from '../IconButton';
import NoteDialog from '../NoteDialog';
import ConfirmDialog from '../ConfirmDialog';
import { showError, showSuccess, extractApiError } from '../../lib/toast';
import { CardLink } from './shared';
import { formatDateShort } from './format';

export default function CustomerNotesCard({
  customerId,
  canEdit = true,
}: {
  customerId: string;
  canEdit?: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoteDto | null>(null);
  const [deleting, setDeleting] = useState<NoteDto | null>(null);

  const queryKey = ['customer-notes', customerId] as const;
  const { data: notes = [] } = useQuery({
    queryKey,
    queryFn: () => noteApi.listForCustomer(customerId),
    enabled: !!customerId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveMutation = useMutation({
    mutationFn: (values: { body: string; pinned: boolean }) =>
      editing
        ? noteApi.update(editing.id, values)
        : noteApi.createForCustomer(customerId, values),
    onSuccess: () => {
      invalidate();
      setDialogOpen(false);
      setEditing(null);
      showSuccess(editing ? 'Note updated' : 'Note added');
    },
    onError: (err) => showError("Couldn't save note", extractApiError(err) ?? undefined),
  });

  const pinMutation = useMutation({
    mutationFn: (note: NoteDto) => noteApi.update(note.id, { pinned: !note.pinned }),
    onSuccess: invalidate,
    onError: (err) => showError("Couldn't update note", extractApiError(err) ?? undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (note: NoteDto) => noteApi.delete(note.id),
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
          <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
            No notes yet.
          </div>
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
                    <span className="text-[10.5px] text-fg-dim">{formatDateShort(n.createdAt)}</span>
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
                <div className="mt-0.5 whitespace-pre-wrap text-[12px] leading-normal text-fg">
                  {n.body}
                </div>
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
