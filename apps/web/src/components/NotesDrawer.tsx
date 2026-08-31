// "Show all" surface for notes — a right-side slide-over (NOT a modal): the
// record stays visible behind it because notes are an annotation you consult
// while looking at the record. Leads with an inline composer (the most common
// reason to open it), then search, then a Pinned section + an All-notes list
// with client-side "Load more" paging. Reuses the shared NoteRow so it never
// drifts from the overview card. Open state is URL-addressable (the parent owns
// the ?notes flag), so Esc / scrim / back-button all close it.
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { NoteDto } from '../api/setup';
import {
  SlideOver,
  SlideOverHeader,
  SlideOverTitle,
  SlideOverBody,
} from './catalyst/slideover';
import { Button } from './catalyst/button';
import { Textarea } from './catalyst/textarea';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Label } from './catalyst/fieldset';
import { NoteRow, PinIcon } from './NoteRow';

// Reveal the All-notes list a page at a time — the full set is already in hand
// (one fetch), so this is a pure client-side slice, not server paging.
const PAGE = 12;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.05em] text-fg-muted">
      {children}
    </div>
  );
}

export default function NotesDrawer({
  open,
  onClose,
  notes,
  canEdit,
  onCreate,
  onEdit,
  onPin,
  onDelete,
  creating,
}: {
  open: boolean;
  onClose: () => void;
  notes: NoteDto[];
  canEdit: boolean;
  onCreate: (values: { body: string; pinned: boolean }) => Promise<unknown>;
  onEdit: (note: NoteDto) => void;
  onPin: (note: NoteDto) => void;
  onDelete: (note: NoteDto) => void;
  creating: boolean;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  const ql = query.trim().toLowerCase();
  const match = (n: NoteDto) =>
    !ql || n.body.toLowerCase().includes(ql) || (n.authorName ?? '').toLowerCase().includes(ql);
  const pinnedNotes = notes.filter((n) => n.pinned && match(n));
  const unpinned = notes.filter((n) => !n.pinned && match(n));
  const shown = unpinned.slice(0, page * PAGE);
  const remaining = unpinned.length - shown.length;
  const nothingMatches = pinnedNotes.length === 0 && unpinned.length === 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await onCreate({ body: trimmed, pinned });
      setBody('');
      setPinned(false);
    } catch {
      // The parent surfaced the error; keep the draft so it isn't lost.
    }
  };

  return (
    <SlideOver open={open} onClose={onClose} className="!max-w-[460px]">
      <SlideOverHeader onClose={onClose}>
        <SlideOverTitle className="flex items-center gap-2 text-base">
          <PinIcon className="size-4 text-fg-muted" />
          {t('notes.title')}
          <span className="text-sm font-normal text-fg-muted">· {notes.length}</span>
        </SlideOverTitle>
      </SlideOverHeader>

      {/* Inline composer — leads the drawer; composing is why you open it. */}
      {canEdit && (
        <form onSubmit={submit} className="border-b border-border-soft px-6 py-3">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            resizable={false}
            placeholder={t('notes.addPlaceholder')}
            aria-label={t('notes.bodyLabel')}
          />
          <div className="mt-2 flex items-center justify-between">
            <CheckboxField>
              <Checkbox checked={pinned} onChange={setPinned} />
              <Label>{t('notes.pin')}</Label>
            </CheckboxField>
            <Button type="submit" color="accent" size="xs" disabled={!body.trim() || creating}>
              {creating ? t('common.saving') : t('notes.add')}
            </Button>
          </div>
        </form>
      )}

      {/* Search — at 50 notes this is how you find "gate code", not scrolling. */}
      <div className="border-b border-border-soft px-6 py-2.5">
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-bg px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t('notes.searchPlaceholder')}
            aria-label={t('notes.searchPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label={t('common.clear')}
              className="px-1 text-[13px] leading-none text-fg-dim hover:text-fg-strong"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <SlideOverBody className="!px-6 !py-4">
        {pinnedNotes.length > 0 && (
          <div className="mb-4">
            <SectionLabel>{t('notes.pinnedPrefix')} · {pinnedNotes.length}</SectionLabel>
            <div className="flex flex-col gap-2">
              {pinnedNotes.map((n) => (
                <NoteRow key={n.id} note={n} canEdit={canEdit} onEdit={onEdit} onPin={onPin} onDelete={onDelete} />
              ))}
            </div>
          </div>
        )}

        {unpinned.length > 0 && (
          <>
            <SectionLabel>{ql ? t('notes.matchesLabel') : t('notes.allLabel')} · {unpinned.length}</SectionLabel>
            <div className="flex flex-col gap-2">
              {shown.map((n) => (
                <NoteRow key={n.id} note={n} canEdit={canEdit} onEdit={onEdit} onPin={onPin} onDelete={onDelete} />
              ))}
            </div>
            {remaining > 0 && (
              <Button outline size="xs" className="mt-3 w-full" onClick={() => setPage((p) => p + 1)}>
                {t('notes.loadMore', { count: Math.min(PAGE, remaining) })}
              </Button>
            )}
          </>
        )}

        {nothingMatches && (
          <div className="py-8 text-center text-[12.5px] text-fg-muted">
            {ql ? t('notes.noMatch', { query: query.trim() }) : t('notes.empty')}
          </div>
        )}
      </SlideOverBody>
    </SlideOver>
  );
}
