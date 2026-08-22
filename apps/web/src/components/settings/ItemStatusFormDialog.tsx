import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { useGlossary } from '../../contexts/GlossaryContext';
import {
  workItemStatusesApi,
  STATUS_CATEGORIES,
  type WorkItemStatus,
  type CreateWorkItemStatusRequest,
  type UpdateWorkItemStatusRequest,
  type StatusCategory,
  type SeededRowImmutableBody,
} from '../../api/setup';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Description, ErrorMessage, Field, FieldGroup, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Select } from '../catalyst/select';
import { CheckboxField, Checkbox } from '../catalyst/checkbox';
import { Button } from '../catalyst/button';
import { AccentPicker } from '../ui/AccentPicker';
import { dense } from '../ui/dense';
import { STATUS_ACCENT_OPTIONS } from '../../utils/roleColor';
import { showError, extractApiError } from '../../lib/toast';
import { toUpperSnake } from '../../lib/code';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  status?: WorkItemStatus;
  nextSortOrder: number;
  queryKey: readonly unknown[];
}

const CATEGORY_LABELS: Record<StatusCategory, string> = {
  NOT_STARTED: 'Not Started',
  AWAITING_SCHEDULE: 'Awaiting Schedule',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function ItemStatusFormDialog({
  isOpen,
  onClose,
  status,
  nextSortOrder,
  queryKey,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const workItem = getName('work_item');
  const isEdit = !!status;
  const isSeeded = status?.isSeeded ?? false;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [statusCategory, setStatusCategory] = useState<StatusCategory>('NOT_STARTED');
  const [originalCategory, setOriginalCategory] = useState<StatusCategory>('NOT_STARTED');
  const [isTerminal, setIsTerminal] = useState(false);
  const [accentId, setAccentId] = useState<string>(STATUS_ACCENT_OPTIONS[0].id);
  const [codeImmutableError, setCodeImmutableError] = useState<string | null>(null);

  // Reset form whenever the dialog opens. In edit mode we treat code as
  // user-set — no live re-derive from name — so renames don't silently
  // rewrite integration-stable identifiers.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(status?.name ?? '');
    setCode(status?.code ?? '');
    setCodeManuallyEdited(false);
    setStatusCategory(status?.statusCategory ?? 'NOT_STARTED');
    setOriginalCategory(status?.statusCategory ?? 'NOT_STARTED');
    setIsTerminal(status?.isTerminal ?? false);
    setAccentId(status?.accentId ?? STATUS_ACCENT_OPTIONS[0].id);
    setCodeImmutableError(null);
  }, [isOpen, status]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEdit && !codeManuallyEdited) setCode(toUpperSnake(value));
  };

  const handleCodeChange = (value: string) => {
    setCode(value.toUpperCase());
    setCodeManuallyEdited(true);
    if (codeImmutableError) setCodeImmutableError(null);
  };

  const createMutation = useMutation({
    mutationFn: (req: CreateWorkItemStatusRequest) => workItemStatusesApi.create(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onClose();
    },
    onError: (err) => handleSubmitError(err, false),
  });

  const updateMutation = useMutation({
    mutationFn: (req: UpdateWorkItemStatusRequest) => workItemStatusesApi.update(status!.id, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onClose();
    },
    onError: (err) => handleSubmitError(err, true),
  });

  // 422 SEEDED_ROW_IMMUTABLE on a PATCH that snuck a code change through
  // (e.g. stale isSeeded flag client-side). Surface inline on the code
  // field rather than as a toast.
  const handleSubmitError = (err: unknown, editing: boolean) => {
    const httpStatus =
      err instanceof Error && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
    const body =
      err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: SeededRowImmutableBody } }).response?.data ?? null)
        : null;
    if (httpStatus === 422 && body?.code === 'SEEDED_ROW_IMMUTABLE') {
      setCodeImmutableError(
        body.message ?? t('settings.itemStatuses.codeLockedHint')
      );
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      return;
    }
    showError(
      editing
        ? t('settings.itemStatuses.errorUpdate')
        : t('settings.itemStatuses.errorCreate'),
      extractApiError(err)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (isEdit) {
      updateMutation.mutate({
        name: name.trim(),
        statusCategory,
        accentId,
        isTerminal,
      });
    } else {
      createMutation.mutate({
        name: name.trim(),
        code: code.trim(),
        statusCategory,
        accentId,
        isTerminal,
        sortOrder: nextSortOrder,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const categoryChangedOnSeeded =
    isEdit && isSeeded && statusCategory !== originalCategory;

  return (
    <Dialog open={isOpen} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isEdit
            ? t('settings.itemStatuses.form.titleEdit', { name: status.name })
            : t('settings.itemStatuses.form.titleAdd', { workItem })}
        </DialogTitle>
        <DialogBody>
          <FieldGroup>
            <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-2 sm:gap-4">
              <Field size="xs">
                <Label size="xs" required>
                  {t('common.form.name')}
                </Label>
                <Input
                  size="xs"
                  name="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                  autoFocus
                />
              </Field>
              <Field size="xs">
                <Label size="xs" required>
                  {t('common.form.code')}
                </Label>
                <Input
                  size="xs"
                  name="code"
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  pattern="[A-Z][A-Z0-9_]*"
                  disabled={isSeeded}
                  required
                  className="font-mono tracking-wider"
                />
                {codeImmutableError ? (
                  <ErrorMessage size="xs">{codeImmutableError}</ErrorMessage>
                ) : (
                  <Description size="xs">
                    {isSeeded
                      ? t('settings.itemStatuses.codeLockedHint')
                      : t('settings.itemStatuses.codeHint')}
                  </Description>
                )}
              </Field>
            </div>
            <Field size="xs">
              <Label size="xs" required>
                {t('settings.itemStatuses.table.category')}
              </Label>
              <Select
                className={dense.select}
                name="statusCategory"
                value={statusCategory}
                onChange={(e) => setStatusCategory(e.target.value as StatusCategory)}
                required
              >
                {STATUS_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </Select>
              {categoryChangedOnSeeded ? (
                <ErrorMessage size="xs">
                  {t('settings.itemStatuses.categoryChangedWarning')}
                </ErrorMessage>
              ) : (
                <Description size="xs">
                  {t('settings.itemStatuses.categoryHelper')}
                </Description>
              )}
            </Field>
            <Field size="xs">
              <Label size="xs" required>
                {t('settings.itemStatuses.colorLabel')}
              </Label>
              <AccentPicker
                value={accentId}
                onChange={setAccentId}
                options={STATUS_ACCENT_OPTIONS}
              />
              <Description size="xs">
                {t('settings.itemStatuses.colorHint')}
              </Description>
            </Field>
            <CheckboxField>
              <Checkbox
                color="accent"
                name="isTerminal"
                checked={isTerminal}
                onChange={setIsTerminal}
              />
              <Label>{t('settings.itemStatuses.table.terminal')}</Label>
              <Description>
                {t('settings.itemStatuses.isTerminalHelper', { workItem })}
              </Description>
            </CheckboxField>
          </FieldGroup>
        </DialogBody>
        <DialogActions>
          <Button plain type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            color="accent"
            disabled={isPending || !name.trim() || !code.trim()}
          >
            {isPending
              ? t('common.saving')
              : isEdit
                ? t('settings.itemStatuses.form.save')
                : t('settings.itemStatuses.form.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export { CATEGORY_LABELS };
