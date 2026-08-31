import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { useGlossary } from '../../contexts/GlossaryContext';
import {
  workOrderTypesApi,
  type WorkOrderType,
  type WorkOrderTypeColorOwner,
  type AccentConflictBody,
} from '../../api/setup';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../catalyst/dialog';
import { Description, ErrorMessage, Field, Label } from '../catalyst/fieldset';
import { Input } from '../catalyst/input';
import { Button } from '../catalyst/button';
import { AccentPicker } from '../ui/AccentPicker';
import { ROLE_ACCENT_OPTIONS } from '@dispatch/utils';
import { showError, extractApiError } from '../../lib/toast';
import { toUpperSnake } from '../../lib/code';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  item?: WorkOrderType;
  nextSortOrder: number;
  colorsInUse: Record<string, WorkOrderTypeColorOwner>;
  queryKey: readonly unknown[];
}

export default function WorkOrderTypeFormDialog({
  isOpen,
  onClose,
  item,
  nextSortOrder,
  colorsInUse,
  queryKey,
}: Props) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const workOrder = getName('work_order');
  const isEdit = !!item;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [accentId, setAccentId] = useState<string>('blue');
  const [accentConflict, setAccentConflict] = useState<string | null>(null);

  // Reset form whenever the dialog opens. In edit mode we treat code as
  // user-set: no live re-derive from name, no auto-sync — renaming a type
  // must not silently rewrite the code that integrations key off.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(item?.name ?? '');
    setCode(item?.code ?? '');
    setCodeManuallyEdited(false);
    setAccentConflict(null);
    if (item?.accentId) {
      setAccentId(item.accentId);
    } else {
      // First swatch not already claimed by another type — never land on a
      // dimmed swatch the moment the dialog opens in add mode.
      const firstFree =
        ROLE_ACCENT_OPTIONS.find((o) => !(o.id in colorsInUse))?.id ?? 'blue';
      setAccentId(firstFree);
    }
  }, [isOpen, item, colorsInUse]);

  // Filter the current type's own entry out so the picker shows its
  // existing color as "selected" rather than "taken by another type".
  const pickerColorsInUse = useMemo(() => {
    if (!isEdit) return colorsInUse;
    const filtered: Record<string, WorkOrderTypeColorOwner> = {};
    for (const [k, v] of Object.entries(colorsInUse)) {
      if (v.typeId !== item.id) filtered[k] = v;
    }
    return filtered;
  }, [isEdit, item, colorsInUse]);

  // Auto-derive code from name during ADD only, and only until the user
  // has touched the code field. Editing an existing type leaves the code
  // alone, since renames must not break references.
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

  const handleAccentChange = (id: string) => {
    setAccentId(id);
    if (accentConflict) setAccentConflict(null);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      workOrderTypesApi.create({
        name: name.trim(),
        code: code.trim(),
        accentId,
        sortOrder: nextSortOrder,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onClose();
    },
    onError: (err) => handleSubmitError(err, false),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      workOrderTypesApi.update(item!.id, {
        name: name.trim(),
        accentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      onClose();
    },
    onError: (err) => handleSubmitError(err, true),
  });

  const handleSubmitError = (err: unknown, editing: boolean) => {
    const status =
      err instanceof Error && 'response' in err
        ? (err as { response?: { status?: number } }).response?.status
        : undefined;
    const body =
      err instanceof Error && 'response' in err
        ? ((err as { response?: { data?: AccentConflictBody } }).response?.data ?? null)
        : null;
    if (status === 409 && (body?.code === 'ACCENT_ID_TAKEN' || body?.field === 'accentId')) {
      setAccentConflict(body.conflictingTypeName ?? 'another type');
      queryClient.invalidateQueries({ queryKey: [...queryKey] });
      return;
    }
    showError(
      editing
        ? t('settings.workOrderTypes.errorUpdate', { workOrder })
        : t('settings.workOrderTypes.errorCreate', { workOrder }),
      extractApiError(err)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const codeChangedFromOriginal = isEdit && code.trim() !== item.code;

  return (
    <Dialog open={isOpen} onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {isEdit
            ? t('settings.workOrderTypes.form.titleEdit', { name: item.name })
            : t('settings.workOrderTypes.form.titleAdd', { workOrder })}
        </DialogTitle>
        <DialogBody>
          <div className="grid grid-cols-1 items-start gap-2.5 sm:grid-cols-[1.4fr_1fr]">
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
                {t('settings.workOrderTypes.colorLabel')}
              </Label>
              <AccentPicker
                value={accentId}
                onChange={handleAccentChange}
                colorsInUse={pickerColorsInUse}
                formatTakenLabel={(owner) =>
                  t('settings.workOrderTypes.colorTakenBy', { name: owner.typeName })
                }
              />
              {accentConflict && (
                <ErrorMessage size="xs">
                  {t('settings.workOrderTypes.colorConflict', { typeName: accentConflict })}
                </ErrorMessage>
              )}
              {!accentConflict && (
                <Description size="xs">
                  {t('settings.workOrderTypes.colorHint', { workOrder })}
                </Description>
              )}
            </Field>
          </div>
          <div className="mt-2.5">
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
                required
              />
              {codeChangedFromOriginal ? (
                <ErrorMessage size="xs">
                  {t('settings.workOrderTypes.codeChangedWarning')}
                </ErrorMessage>
              ) : (
                <Description size="xs">
                  {isEdit
                    ? t('settings.workOrderTypes.codeImmutable')
                    : t('settings.workOrderTypes.codeHint')}
                </Description>
              )}
            </Field>
          </div>
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
                ? t('settings.workOrderTypes.form.save')
                : t('settings.workOrderTypes.form.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
