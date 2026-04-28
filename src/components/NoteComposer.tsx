import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { notesApi } from '../api';
import { Button } from './catalyst/button';
import { Textarea } from './catalyst/textarea';

interface Props {
  workOrderId: string;
}

/**
 * Inline note composer above the activity stream. Functional in phase 3 —
 * POSTs to /work-orders/:id/notes and invalidates the activity query so the
 * resulting NOTE_ADDED event appears in the feed. The "N" keyboard shortcut
 * focuses the textarea when no other input is focused.
 */
export default function NoteComposer({ workOrderId }: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createMutation = useMutation({
    mutationFn: (text: string) => notesApi.create(workOrderId, { body: text }),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('workOrders.activity.composer.error'));
    },
  });

  // N shortcut focuses the textarea — only when no other input has focus and
  // no modifier keys are held. This is the only shortcut wired up at phase 3;
  // a shared useKeyboardShortcuts hook can come in phase 5 alongside the rest.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      textareaRef.current?.focus();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = () => {
    const trimmed = body.trim();
    if (!trimmed || createMutation.isPending) return;
    createMutation.mutate(trimmed);
  };

  // Cmd/Ctrl + Enter inside the textarea submits.
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isDisabled = !body.trim() || createMutation.isPending;

  return (
    <div className="mb-3">
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleTextareaKeyDown}
        placeholder={t('workOrders.activity.composer.placeholder')}
        rows={2}
        aria-label={t('workOrders.activity.composer.ariaLabel')}
      />
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          {t('workOrders.activity.composer.hint')}
        </span>
        <Button type="button" onClick={handleSubmit} disabled={isDisabled}>
          {createMutation.isPending
            ? t('workOrders.activity.composer.saving')
            : t('workOrders.activity.composer.save')}
        </Button>
      </div>
    </div>
  );
}
