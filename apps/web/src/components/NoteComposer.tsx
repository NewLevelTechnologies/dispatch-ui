import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { notesApi } from '../api/setup';
import { Button } from './catalyst/button';
import { Textarea } from './catalyst/textarea';

interface Props {
  workOrderId: string;
  /**
   * When true, focus the textarea on mount (and whenever this flips true).
   * Used by ActivityDrawer so the drawer's empty state lands on the composer
   * — per §5d, the composer carries the empty state.
   */
  autoFocus?: boolean;
}

/**
 * Inline note composer above the activity stream. POSTs to
 * /work-orders/:id/notes and invalidates the activity query so the resulting
 * NOTE_ADDED event appears in the feed. The N shortcut refocuses the textarea
 * when this is mounted and no other input is focused — the page-level handler
 * owns "open the drawer when it's closed."
 */
export default function NoteComposer({ workOrderId, autoFocus }: Props) {
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

  // Autofocus on mount / when toggled true. Drawer opens → composer mounts →
  // textarea grabs focus, so the user can start typing immediately.
  useEffect(() => {
    if (autoFocus) {
      textareaRef.current?.focus();
    }
  }, [autoFocus]);

  // N shortcut refocuses the textarea while this composer is mounted
  // (i.e. while the drawer is open). The page-level handler owns "open the
  // drawer when N is pressed and the drawer is closed."
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
