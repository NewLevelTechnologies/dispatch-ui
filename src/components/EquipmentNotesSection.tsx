import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  EQUIPMENT_NOTE_BODY_MAX_CHARS,
  equipmentNotesApi,
  type EquipmentNote,
} from '../api';
import { Button } from './catalyst/button';
import { Textarea } from './catalyst/textarea';
import { PlusIcon } from '@heroicons/react/24/outline';
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
  /** Cancelled / archived WOs collapse the composer + edit affordances.
   *  Existing notes still display. */
  readOnly?: boolean;
}

/**
 * Equipment Notes sub-section per `WORK_ORDER_DETAIL_DESIGN.md` §3.3 / §5a.
 *
 * Always renders (even at noteCount = 0) with a "+ Add note" affordance —
 * the design explicitly calls out "always renders ... when empty
 * (encourages capture)." Helper text below the heading distinguishes
 * equipment notes ("saved with this equipment") from WO-scoped activity
 * stream notes — legacy users came from a system that didn't separate
 * them.
 *
 * Presentational regarding fetching: the parent passes the projected
 * recentNotes / noteCount. Mutations (create) live here because they're
 * local to the composer and don't ripple up. On success we invalidate the
 * cross-surface caches that carry the projection.
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

  const createMutation = useMutation({
    mutationFn: (body: string) => equipmentNotesApi.create(equipmentId, { body }),
    onSuccess: () => {
      invalidate();
      setDraft('');
      setIsComposing(false);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('equipment.notes.errorCreate'));
    },
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
      {/* Helper text — disambiguates from WO activity rail notes. CSRs
          coming from legacy systems wrote per-equipment service knowledge
          where the new system put per-WO conversation; this line redirects. */}
      <p className="mt-0.5 text-xs italic text-zinc-500 dark:text-zinc-400">
        {t('equipment.notes.helper')}
      </p>

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

      {/* Recent notes preview */}
      {recentNotes.length > 0 && (
        <ul className="mt-2 space-y-2">
          {recentNotes.map((note) => (
            <li
              key={note.id}
              className="rounded-md bg-zinc-50 p-2 ring-1 ring-zinc-200 dark:bg-zinc-900/50 dark:ring-zinc-800"
            >
              <p className="whitespace-pre-wrap text-sm text-zinc-900 dark:text-zinc-100">
                {note.body}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {note.authorName ?? t('equipment.notes.systemAuthor')}
                {' · '}
                {formatRelativeTime(note.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}

      {/* Overflow hint when more notes exist than the recentNotes
          projection includes. Routes the user to the equipment detail
          page where the full list + edit/delete live (PR2). */}
      {overflow > 0 && (
        <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          {t('equipment.notes.viewAll', { count: overflow })}
        </p>
      )}
    </section>
  );
}
