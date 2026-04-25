import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  workItemStatusesApi,
  STATUS_CATEGORIES,
  type WorkItemStatus,
  type CreateWorkItemStatusRequest,
  type UpdateWorkItemStatusRequest,
  type StatusCategory,
} from '../../api';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Field, FieldGroup, Label, Description } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { CheckboxField, Checkbox } from '../catalyst/checkbox';
import { Button } from '../catalyst/button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  status?: WorkItemStatus;
  nextSortOrder: number;
}

const codeFromName = (name: string): string =>
  name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);

const QUERY_KEY = ['work-item-statuses'];

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  CANCELLED: 'Cancelled',
};

export default function ItemStatusFormDialog({ isOpen, onClose, status, nextSortOrder }: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = !!status;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [statusCategory, setStatusCategory] = useState<StatusCategory>('NOT_STARTED');
  const [isTerminal, setIsTerminal] = useState(false);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366F1');

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(status?.name ?? '');
      setCode(status?.code ?? '');
      setCodeManuallyEdited(false);
      setStatusCategory(status?.statusCategory ?? 'NOT_STARTED');
      setIsTerminal(status?.isTerminal ?? false);
      setDescription(status?.description ?? '');
      setColor(status?.color ?? '#6366F1');
    }
  }, [isOpen, status]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEdit && !codeManuallyEdited) setCode(codeFromName(value));
  };

  const createMutation = useMutation({
    mutationFn: (req: CreateWorkItemStatusRequest) => workItemStatusesApi.create(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to create status');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (req: UpdateWorkItemStatusRequest) => workItemStatusesApi.update(status!.id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || 'Failed to update status');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedDescription = description.trim();
    if (isEdit) {
      updateMutation.mutate({
        name: name.trim(),
        statusCategory,
        isTerminal,
        description: trimmedDescription || null,
        color,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        code: code.trim(),
        statusCategory,
        isTerminal,
        description: trimmedDescription || null,
        color,
        sortOrder: nextSortOrder,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose} size="xl">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isEdit ? t('common.edit') : t('common.create')} {t('settings.nav.itemStatuses').replace(/es$/, '')}
        </DialogTitle>
        <DialogBody>
          <FieldGroup>
            <Field>
              <Label>{t('common.form.name')} *</Label>
              <Input
                name="name"
                value={name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <Label>{t('common.form.code')} *</Label>
              <Input
                name="code"
                value={code}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setCode(e.target.value.toUpperCase());
                  setCodeManuallyEdited(true);
                }}
                pattern="[A-Z][A-Z0-9_]*"
                required
                disabled={isEdit}
              />
              <Description>
                {isEdit ? t('settings.taxonomy.codeImmutable') : t('settings.taxonomy.codeHelper')}
              </Description>
            </Field>
            <Field>
              <Label>{t('settings.itemStatuses.table.category')} *</Label>
              <Select
                name="statusCategory"
                value={statusCategory}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusCategory(e.target.value as StatusCategory)}
                required
              >
                {STATUS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                ))}
              </Select>
              <Description>{t('settings.itemStatuses.categoryHelper')}</Description>
            </Field>
            <CheckboxField>
              <Checkbox
                name="isTerminal"
                checked={isTerminal}
                onChange={(checked) => setIsTerminal(checked)}
              />
              <Label>{t('settings.itemStatuses.table.terminal')}</Label>
              <Description>{t('settings.itemStatuses.isTerminalHelper')}</Description>
            </CheckboxField>
            <Field>
              <Label>{t('common.form.description')}</Label>
              <Input
                name="description"
                value={description}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
              />
            </Field>
            <Field>
              <Label>{t('common.form.color')}</Label>
              <div className="flex gap-2 items-center">
                <Input
                  name="color"
                  type="color"
                  value={color}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
                  className="w-20"
                />
                <Input
                  type="text"
                  value={color}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColor(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
            </Field>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export { CATEGORY_LABELS };
