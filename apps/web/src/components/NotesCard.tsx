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
import { useTranslation } from '@dispatch/i18n';
import type { NoteDto } from '../api/setup';
import { Card } from './catalyst/card';
import { CardTitle, CardLink } from './customer-detail/shared';
import { NoteRow } from './NoteRow';
import { useEntityNotes, type NoteEntityType } from './useEntityNotes';

export type { NoteEntityType };

// All pinned notes always show; this caps the unpinned tail in the card. Beyond
// it, the drawer carries the rest.
const UNPINNED_PREVIEW = 3;

export default function NotesCard({
  entityType,
  entityId,
  canEdit = true,
  canAdd = canEdit,
  initialData,
}: {
  entityType: NoteEntityType;
  entityId: string;
  // Pin / edit / delete existing notes.
  canEdit?: boolean;
  // Write a new note. Defaults to canEdit; work orders let anyone who can see
  // the job add one, even when they can't change anything else.
  canAdd?: boolean;
  // First-paint seed for entities whose detail payload embeds the full notes
  // array (service location). Must be the complete set, not a preview.
  initialData?: NoteDto[];
}) {
  const { t } = useTranslation();
  const { notes, openAdd, openEdit, openDrawer, pin, requestDelete, overlays } = useEntityNotes({
    entityType,
    entityId,
    canEdit,
    canAdd,
    initialData,
  });

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
          canAdd ? (
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
                onPin={pin}
                onDelete={requestDelete}
              />
            ))}
            {hasMore && (
              <CardLink className="self-start" onClick={openDrawer}>
                {t('notes.showAll', { count: notes.length })} →
              </CardLink>
            )}
          </div>
        )}
      </Card>

      {overlays}
    </>
  );
}
