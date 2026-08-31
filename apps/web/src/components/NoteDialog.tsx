import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import { useTranslation } from '@dispatch/i18n';
import type { NoteDto } from '../api/setup';
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Description, Field, Label } from './catalyst/fieldset';
import { Textarea } from './catalyst/textarea';
import { Checkbox, CheckboxField } from './catalyst/checkbox';

// Focused add/edit dialog for a record note (service location or customer).
// Controlled: the parent owns the mutation + cache invalidation and passes a
// save handler, so the same dialog serves any note parent. `author` and
// timestamps are server-set — never fields here.
interface NoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // null = add (empty form); otherwise edit the given note.
  note: NoteDto | null;
  onSave: (values: { body: string; pinned: boolean }) => void;
  saving: boolean;
}

export default function NoteDialog({ isOpen, onClose, note, onSave, saving }: NoteDialogProps) {
  const { t } = useTranslation();
  const isEdit = !!note;

  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [error, setError] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset the form whenever the dialog opens or the target note changes.
  // Form initialization from props — the documented exception to the
  // set-state-in-effect rule (see CLAUDE.md).
  useEffect(() => {
    if (!isOpen) return;
    setBody(note?.body ?? '');
    setPinned(note?.pinned ?? false);
    setError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, note?.id]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) {
      setError(true);
      textareaRef.current?.focus();
      return;
    }
    onSave({ body: trimmed, pinned });
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <DialogTitle>{isEdit ? t('notes.edit') : t('notes.add')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Field>
            <Label>{t('notes.bodyLabel')}</Label>
            <Textarea
              ref={textareaRef}
              name="body"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (error) setError(false);
              }}
              rows={5}
              autoFocus
              invalid={error}
            />
            {error && <div className="mt-1 text-[11px] text-danger-500">{t('notes.bodyRequired')}</div>}
          </Field>

          <CheckboxField className="mt-4">
            <Checkbox name="pinned" checked={pinned} onChange={setPinned} />
            <Label>{t('notes.pin')}</Label>
            <Description>{t('notes.pinDescription')}</Description>
          </CheckboxField>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="accent" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
