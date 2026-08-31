import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  divisionsApi,
  type Division,
} from '../../api/setup';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Description, ErrorMessage, Field, FieldGroup, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Button } from '../catalyst/button';
import { showError, extractApiError } from '../../lib/toast';
import { toUpperSnake } from '../../lib/code';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item?: Division;
  nextSortOrder: number;
  queryKey: readonly unknown[];
}

export default function DivisionFormDialog({
  isOpen,
  onClose,
  item,
  nextSortOrder,
  queryKey,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const isEdit = !!item;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setCodeManuallyEdited(false);
  }, [isOpen, item]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEdit && !codeManuallyEdited) {
      setCode(toUpperSnake(value));
    }
  };

  const handleCodeChange = (value: string) => {
    setCode(value.toUpperCase());
    setCodeManuallyEdited(true);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      divisionsApi.create({
        name: name.trim(),
        code: code.trim(),
        sortOrder: nextSortOrder,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onClose();
    },
    onError: (err) =>
      showError(t('settings.divisions.errorCreate'), extractApiError(err)),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      divisionsApi.update(item!.id, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onClose();
    },
    onError: (err) =>
      showError(t('settings.divisions.errorUpdate'), extractApiError(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const codeChangedFromOriginal = isEdit && code.trim() !== item.code;

  return (
    <Dialog open={isOpen} onClose={onClose} size="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isEdit
            ? t('settings.divisions.form.titleEdit', { name: item.name })
            : t('settings.divisions.form.titleAdd')}
        </DialogTitle>
        <DialogBody>
          <FieldGroup>
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
                maxLength={50}
                required
                className="font-mono tracking-wider"
              />
              {codeChangedFromOriginal ? (
                <ErrorMessage size="xs">
                  {t('settings.divisions.codeChangedWarning')}
                </ErrorMessage>
              ) : (
                <Description size="xs">
                  {isEdit
                    ? t('settings.divisions.codeImmutable')
                    : t('settings.divisions.codeHint')}
                </Description>
              )}
            </Field>
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
                ? t('settings.divisions.form.save')
                : t('settings.divisions.form.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
