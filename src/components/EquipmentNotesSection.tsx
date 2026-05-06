import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  EQUIPMENT_NOTE_BODY_MAX_CHARS,
  equipmentNotesApi,
  type EquipmentNote,
} from '../api';
import { Button } from './catalyst/button';
import { Textarea } from './catalyst/textarea';
import { PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { formatRelativeTime } from '../utils/formatRelativeTime';

interface Props {
  equipmentId: string;
  /** The recentNotes projection (up to 3, newest first) shipped on
   *  EquipmentResponse / WorkItemEquipmentSummary. The full list lives at
   *  GET /equipment/{id}/notes; we don't fetch it inline because the
   *  preview is enough on the abbreviated WO surface — full history
   *  belongs on the dedicated equipment detail page surface. */
  recentNotes: EquipmentNote[];
  /** Total notes for this equipment. Used to decide whether to surface a
   *  "+N more" indicator next to the heading. */
  noteCount: number;
  /** Cancelled / archived WOs collapse the composer + edit / delete
   *  affordances. Existing notes still display read-only. */
  readOnly?: boolean;
}

/**
 * Equipment Notes sub-section per `WORK_ORDER_DETAIL_DESIGN.md` §3.3 / §5a.
 *
 * Always renders (even at noteCount = 0) with a "+ Add note" affordance —
 * the design explicitly calls out "always renders ... when empty
 * (encourages capture)."
 *
 * Per-note edit + delete live inline (matching the photos lightbox's
 * inline-management pattern): click a note's body to swap to an inline
 * textarea, Cmd/Ctrl+Enter or blur saves, Esc reverts. A small trash
 * icon on each row confirms then deletes.
 *
 * Presentational regarding fetching: the parent passes the projected
 * recentNotes / noteCount. Mutations live here because they're local to
 * each note and don't ripple up. On success we invalidate the cross-
 * surface caches that carry the projection.
 */
export default function EquipmentNotesSection({
  equipmentId,
  recentNotes,
  noteCount,
  readOnly = false,
}: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isComposing, setIsComposing] = useState(false);
  const [draft, setDraft] = useState('');

  // recentNotes affects WorkItemEquipmentSummary projections (WO row
  // expansion), EquipmentResponse (drawer + detail page), AND the
  // standalone /equipment/{id}/notes list. Bust all three families so the
  // surface a user is currently on AND any other open surface refresh in
  // lockstep.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-notes', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
  };

  const surfaceError = (err: unknown, fallbackKey: string) => {
    const msg =
      err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    alert(msg || t(fallbackKey));
  };

  const createMutation = useMutation({
    mutationFn: (body: string) => equipmentNotesApi.create(equipmentId, { body }),
    onSuccess: () => {
      invalidate();
      setDraft('');
      setIsComposing(false);
    },
    onError: (err) => surfaceError(err, 'equipment.notes.errorCreate'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      equipmentNotesApi.update(equipmentId, noteId, { body }),
    onSuccess: invalidate,
    onError: (err) => surfaceError(err, 'equipment.notes.errorUpdate'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => equipmentNotesApi.delete(equipmentId, noteId),
    onSuccess: invalidate,
    onError: (err) => surfaceError(err, 'equipment.notes.errorDelete'),
  });

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  const handleCancel = () => {
    setDraft('');
    setIsComposing(false);
  };

  const overflow = noteCount - recentNotes.length;

  return (
    <section
      aria-label={t('equipment.notes.heading')}
      className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('equipment.notes.headingWithCount', { count: noteCount })}
        </div>
        {!readOnly && !isComposing && (
          <button
            type="button"
            onClick={() => setIsComposing(true)}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline dark:text-blue-400"
          >
            <PlusIcon className="size-4" />
            {t('equipment.notes.addNote')}
          </button>
        )}
      </div>

      {/* Composer */}
      {!readOnly && isComposing && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('equipment.notes.composerPlaceholder')}
            rows={3}
            maxLength={EQUIPMENT_NOTE_BODY_MAX_CHARS}
            disabled={createMutation.isPending}
            aria-label={t('equipment.notes.composerLabel')}
          />
          <div className="flex items-center justify-end gap-2">
            <Button plain onClick={handleCancel} disabled={createMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!draft.trim() || createMutation.isPending}
            >
              {createMutation.isPending
                ? t('common.saving')
                : t('common.save')}
            </Button>
          </div>
        </div>
      )}

      {/* Recent notes preview — divided list (no per-note card chrome)
          so the section reads as part of the surrounding equipment block
          density rather than an inset surface. */}
      {recentNotes.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
          {recentNotes.map((note) => (
            <NoteRow
              key={note.id}
              note={note}
              readOnly={readOnly}
              onSave={(body) =>
                updateMutation.mutateAsync({ noteId: note.id, body })
              }
              onDelete={() => {
                if (!window.confirm(t('equipment.notes.deleteConfirm'))) return;
                deleteMutation.mutate(note.id);
              }}
              isPending={
                (updateMutation.isPending &&
                  updateMutation.variables?.noteId === note.id) ||
                (deleteMutation.isPending && deleteMutation.variables === note.id)
              }
            />
          ))}
        </ul>
      )}

      {/* Overflow hint when more notes exist than the recentNotes
          projection includes. Routes the user to the equipment detail
          page where the full list lives. */}
      {overflow > 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {t('equipment.notes.viewAll', { count: overflow })}
        </p>
      )}
    </section>
  );
}

interface NoteRowProps {
  note: EquipmentNote;
  readOnly: boolean;
  onSave: (body: string) => Promise<unknown>;
  onDelete: () => void;
  isPending: boolean;
}

function NoteRow({ note, readOnly, onSave, onDelete, isPending }: NoteRowProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus + select on entering edit mode.
  useEffect(() => {
    if (isEditing) {
      textareaRef.current?.focus();
      textareaRef.current?.select();
    }
  }, [isEditing]);

  const startEdit = () => {
    if (readOnly) return;
    setDraft(note.body);
    setIsEditing(true);
  };

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === note.body) {
      setIsEditing(false);
      setDraft(note.body);
      return;
    }
    try {
      await onSave(next);
      setIsEditing(false);
    } catch {
      // Stay in edit mode — parent surfaces the error via alert.
    }
  };

  const cancel = () => {
    setDraft(note.body);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <li className="py-1.5 first:pt-0 last:pb-0">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void commit();
            }
          }}
          rows={3}
          maxLength={EQUIPMENT_NOTE_BODY_MAX_CHARS}
          disabled={isPending}
          aria-label={t('equipment.notes.composerLabel')}
        />
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {t('equipment.notes.editHint')}
        </p>
      </li>
    );
  }

  return (
    <li className="group py-1.5 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={startEdit}
          disabled={readOnly}
          // Dimmer + smaller than work-item-description text — notes are
          // supporting reference material, not the primary row content.
          // text-xs matches the equipment field-label scale; the dimmer
          // zinc-600/-400 color keeps multi-sentence service notes
          // readable while letting them recede visually.
          className="flex-1 rounded text-left text-xs text-zinc-600 hover:bg-zinc-50 disabled:cursor-default disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-white/5"
          title={readOnly ? undefined : t('equipment.notes.editHover')}
        >
          <span className="whitespace-pre-wrap">{note.body}</span>
        </button>
        {!readOnly && (
          // Per-note actions only render on hover/focus to keep the row
          // scannable; tabbing exposes them too via focus-within.
          <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={startEdit}
              disabled={isPending}
              aria-label={t('common.edit')}
              className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <PencilIcon className="size-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={isPending}
              aria-label={t('common.delete')}
              className="rounded p-1 text-zinc-500 hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
            >
              <TrashIcon className="size-4" />
            </button>
          </div>
        )}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        {note.authorName ?? t('equipment.notes.systemAuthor')}
        {' · '}
        {formatRelativeTime(note.createdAt)}
      </p>
    </li>
  );
}
