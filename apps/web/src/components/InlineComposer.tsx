import { useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { Textarea } from './catalyst/textarea';
import { Button } from './catalyst/button';

interface Props {
  /** Seed value (the current field text). */
  value?: string;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  maxLength?: number;
  /**
   * Called with the trimmed value on Save. May be async; if it throws, the
   * composer stays open so the entry isn't lost (the caller surfaces the error).
   */
  onSave: (value: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Shared inline, section-scoped editor (mock `InlineComposer`): an autofocused
 * textarea with Cancel / Save, Save disabled while empty. The one editing
 * affordance across the work-item card (complaint, diagnosis) — same shape as
 * the Add-note composer. Never a modal: a work item is a continuously-touched
 * operational record, so editing happens in place beside its context.
 */
export default function InlineComposer({
  value = '',
  rows = 2,
  placeholder,
  ariaLabel,
  maxLength,
  onSave,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  const canSave = text.trim().length > 0 && !saving;

  const submit = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(text.trim());
    } catch {
      // Surfaced by the caller; keep the composer open so the draft survives.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5">
      <Textarea
        autoFocus
        rows={rows}
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        onChange={(e) => setText(e.target.value)}
        // Esc cancels; ⌘/Ctrl+Enter saves (plain Enter stays a newline).
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            if (!saving) onCancel();
          } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button plain size="xs" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button color="accent" size="xs" onClick={submit} disabled={!canSave}>
          {saving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
