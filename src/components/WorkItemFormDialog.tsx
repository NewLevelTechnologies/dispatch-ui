import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workOrderApi,
  workItemStatusesApi,
  type WorkItemResponse,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Textarea } from './catalyst/textarea';
import { Select } from './catalyst/select';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  /** When provided → edit mode; otherwise → create mode. */
  workItem?: WorkItemResponse | null;
  /** Locks the dialog to read-only when the parent WO is cancelled / archived. */
  readOnly?: boolean;
}

interface FormState {
  description: string;
  statusId: string;
}

const EMPTY_FORM: FormState = { description: '', statusId: '' };

/**
 * Create / edit a single work item from the WO detail page.
 * - Status edits also have an inline pill on each row (`WorkItemStatusPill`);
 *   this dialog is the surface for description edits and adding new items.
 * - Cancelled / archived WOs render the dialog in read-only mode for safety.
 */
export default function WorkItemFormDialog({
  isOpen,
  onClose,
  workOrderId,
  workItem,
  readOnly = false,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [formData, setFormData] = useState<FormState>(EMPTY_FORM);

  const isEdit = !!workItem?.id;

  const { data: statuses = [] } = useQuery({
    queryKey: ['work-item-statuses'],
    queryFn: () => workItemStatusesApi.getAll(),
    enabled: isOpen,
  });
  const activeStatuses = statuses.filter((s) => s.isActive);

  useEffect(() => {
    if (!isOpen) return;
    /* eslint-disable react-hooks/set-state-in-effect -- standard form-init pattern */
    if (workItem) {
      setFormData({
        description: workItem.description,
        statusId: workItem.statusId ?? '',
      });
    } else {
      setFormData(EMPTY_FORM);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, workItem]);

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-order-activity', workOrderId] });
    onClose();
  };

  const onError = (err: unknown, fallbackKey: string) => {
    const msg =
      err instanceof Error && 'response' in err
        ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
    alert(msg || t(fallbackKey, { entity: getName('work_item') }));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      workOrderApi.createWorkItem(workOrderId, {
        description: formData.description.trim(),
        statusId: formData.statusId || undefined,
      }),
    onSuccess,
    onError: (err) => onError(err, 'common.form.errorCreate'),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      workOrderApi.updateWorkItem(workOrderId, workItem!.id, {
        description: formData.description.trim(),
        statusId: formData.statusId || undefined,
      }),
    onSuccess,
    onError: (err) => onError(err, 'common.form.errorUpdate'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (readOnly) return;
    if (!formData.description.trim()) {
      alert(t('workOrders.workItems.descriptionRequired'));
      return;
    }
    if (isEdit) {
      updateMutation.mutate();
    } else {
      createMutation.mutate();
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const title = isEdit
    ? t('common.actions.edit', { entity: getName('work_item') })
    : t('common.actions.add', { entity: getName('work_item') });

  return (
    <Dialog open={isOpen} onClose={onClose} size="2xl">
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>
        <form
          id="work-item-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <Fieldset>
            <FieldGroup>
              <Field>
                <Label>{t('common.form.description')}</Label>
                <Textarea
                  name="description"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  rows={4}
                  required
                  autoFocus
                  disabled={readOnly}
                />
              </Field>
              {activeStatuses.length > 0 && (
                <Field>
                  <Label>{t('workOrders.table.statusHeader')}</Label>
                  <Select
                    name="statusId"
                    value={formData.statusId}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, statusId: e.target.value }))
                    }
                    disabled={readOnly}
                  >
                    <option value="">{t('common.form.select')}</option>
                    {activeStatuses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </FieldGroup>
          </Fieldset>
        </form>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {readOnly ? t('common.close') : t('common.cancel')}
        </Button>
        {!readOnly && (
          <Button type="submit" form="work-item-form" disabled={isSaving}>
            {isSaving
              ? t('common.saving')
              : t(isEdit ? 'common.update' : 'common.create')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
