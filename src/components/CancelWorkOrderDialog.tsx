import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { workOrderApi, type WorkOrder } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, Label } from './catalyst/fieldset';
import { Textarea } from './catalyst/textarea';
import { Text } from './catalyst/text';

const REASON_MAX = 2000;

interface CancelWorkOrderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder | null;
}

export default function CancelWorkOrderDialog({ isOpen, onClose, workOrder }: CancelWorkOrderDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset state whenever the dialog opens for a new work order
  useEffect(() => {
    if (!isOpen) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setReason('');
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, workOrder?.id]);

  const cancelMutation = useMutation({
    mutationFn: (trimmed: string) => workOrderApi.cancel(workOrder!.id, { reason: trimmed }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      onClose();
    },
    onError: (err: unknown) => {
      const message = err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      setError(message || t('workOrders.actions.cancelError', { entity: getName('work_order') }));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t('workOrders.actions.cancelReasonRequired'));
      return;
    }
    setError(null);
    cancelMutation.mutate(trimmed);
  };

  const remaining = REASON_MAX - reason.length;

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg">
      <DialogTitle>{t('workOrders.actions.cancelTitle', { entity: getName('work_order') })}</DialogTitle>
      <DialogDescription>
        {t('workOrders.actions.cancelDescription', { entity: getName('work_order') })}
      </DialogDescription>
      <DialogBody>
        <form id="cancel-work-order-form" onSubmit={handleSubmit} className="space-y-3">
          {workOrder?.workOrderNumber && (
            <Text className="font-mono text-sm text-zinc-500">{workOrder.workOrderNumber}</Text>
          )}
          <Field>
            <Label>{t('workOrders.actions.cancelReasonLabel')}</Label>
            <Textarea
              autoFocus
              name="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))}
              placeholder={t('workOrders.actions.cancelReasonPlaceholder')}
              rows={4}
              required
              maxLength={REASON_MAX}
            />
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {t('workOrders.actions.charactersRemaining', { count: remaining })}
            </div>
          </Field>
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-sm text-red-800 ring-1 ring-red-200 dark:bg-red-950/20 dark:text-red-300 dark:ring-red-900/30">
              {error}
            </div>
          )}
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={cancelMutation.isPending}>
          {t('common.cancel')}
        </Button>
        <Button
          type="submit"
          form="cancel-work-order-form"
          color="red"
          disabled={cancelMutation.isPending || !reason.trim()}
        >
          {cancelMutation.isPending ? t('common.saving') : t('workOrders.actions.cancelButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
