// One note block + the pushpin glyph — shared by the overview NotesCard peek and
// the NotesDrawer so the two surfaces never drift. Amber left-rail + tint when
// pinned; body leads, meta line below (author · time · edited), hover actions
// (pin/edit/delete). Display is "unchanged from current" per the notes design.
import { useTranslation } from '@dispatch/i18n';
import { PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { NoteDto } from '../api/setup';
import { TimeAgo } from './TimeAgo';

// Thumbtack glyph — heroicons has no pushpin. `solid` fills it (active/pinned);
// outline is the "Pin" action.
export function PinIcon({ className, solid }: { className?: string; solid?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 4h6M9.5 4l-.5 6L6.5 13h11L15 10l-.5-6M12 13v7" />
    </svg>
  );
}

export function NoteRow({
  note,
  canEdit,
  onEdit,
  onPin,
  onDelete,
}: {
  note: NoteDto;
  canEdit: boolean;
  onEdit: (note: NoteDto) => void;
  onPin: (note: NoteDto) => void;
  onDelete: (note: NoteDto) => void;
}) {
  const { t } = useTranslation();
  const edited = !!note.updatedAt && note.updatedAt !== note.createdAt;
  return (
    <div
      className="group/note relative rounded-[6px] border-l-[3px] px-2.5 py-2"
      style={{
        background: note.pinned
          ? 'color-mix(in oklch, var(--warning-500) 9%, var(--bg-elev))'
          : 'var(--bg-elev-2)',
        borderLeftColor: note.pinned ? 'var(--warning-500)' : 'var(--border-strong)',
      }}
    >
      <div
        className="whitespace-pre-wrap text-[12px] leading-normal text-fg"
        style={{ overflowWrap: 'anywhere', paddingRight: canEdit ? 56 : 0 }}
      >
        {note.body}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-fg-dim">
        {note.pinned && (
          <span className="inline-flex items-center gap-1 font-semibold text-[var(--warning-fg)]">
            <PinIcon className="size-3" solid />
            {t('notes.pinnedPrefix')} ·
          </span>
        )}
        {note.authorName && <span>{note.authorName}</span>}
        {note.authorName && <span aria-hidden>·</span>}
        <TimeAgo iso={note.createdAt} />
        {edited && <span aria-hidden>·</span>}
        {edited && <span>{t('notes.edited')}</span>}
      </div>
      {canEdit && (
        <div className="absolute right-2 top-1.5 flex items-center gap-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/note:opacity-100">
          <button
            type="button"
            onClick={() => onPin(note)}
            aria-label={note.pinned ? t('notes.actions.unpin') : t('notes.actions.pin')}
            title={note.pinned ? t('notes.actions.unpin') : t('notes.actions.pin')}
            className={note.pinned ? 'text-[var(--warning-fg)] hover:opacity-80' : 'text-fg-dim hover:text-fg-strong'}
          >
            <PinIcon className="size-3.5" solid={note.pinned} />
          </button>
          <button
            type="button"
            onClick={() => onEdit(note)}
            aria-label={t('common.edit')}
            title={t('common.edit')}
            className="text-fg-dim hover:text-fg-strong"
          >
            <PencilIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(note)}
            aria-label={t('common.delete')}
            title={t('common.delete')}
            className="text-fg-dim hover:text-danger-500"
          >
            <TrashIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
