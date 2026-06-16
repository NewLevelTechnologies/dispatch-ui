import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  dispatchRegionApi,
  type CreateDispatchRegionRequest,
  type DispatchRegion,
  type UpdateDispatchRegionRequest,
} from '../api';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Description, Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { extractApiError } from '../lib/toast';

interface DispatchRegionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  region?: DispatchRegion;
  nextSortOrder: number;
}

export default function DispatchRegionFormDialog({
  isOpen,
  onClose,
  region,
  nextSortOrder,
}: DispatchRegionFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const isEdit = Boolean(region);
  const regionSingular = getName('dispatch_region');

  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setName(region?.name ?? '');
    setAbbreviation(region?.abbreviation ?? '');
  }, [isOpen, region]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createMutation = useMutation({
    mutationFn: (payload: CreateDispatchRegionRequest) =>
      dispatchRegionApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] });
      onClose();
    },
    onError: (err) =>
      setErrorMessage(
        extractApiError(err) ??
          t('common.form.errorCreate', { entity: regionSingular }),
      ),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateDispatchRegionRequest) => {
      if (!region) throw new Error('No region to update');
      return dispatchRegionApi.update(region.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] });
      onClose();
    },
    onError: (err) =>
      setErrorMessage(
        extractApiError(err) ??
          t('common.form.errorUpdate', { entity: regionSingular }),
      ),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const trimmedName = name.trim();
  const trimmedAbbreviation = abbreviation.trim();
  const canSubmit = trimmedName.length > 0 && trimmedAbbreviation.length > 0 && !isSaving;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!trimmedName || !trimmedAbbreviation) return;
    if (isEdit) {
      updateMutation.mutate({ name: trimmedName, abbreviation: trimmedAbbreviation });
    } else {
      createMutation.mutate({
        name: trimmedName,
        abbreviation: trimmedAbbreviation,
        sortOrder: nextSortOrder,
      });
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="sm">
      <DialogTitle>
        {isEdit
          ? t('settings.dispatchRegions.titleEdit', { region: regionSingular })
          : t('settings.dispatchRegions.titleAdd', { region: regionSingular })}
      </DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20"
            >
              {errorMessage}
            </div>
          )}
          <Fieldset>
            <FieldGroup className="!space-y-3">
              {/* Equal-width columns: Name and Abbreviation sit side-by-side
                  on sm+, stack on mobile. The hint that used to live inline
                  on the label drops to a Description below the abbreviation
                  input where it has room to read straight across without
                  wrapping under a narrow column. */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <Field size="xs">
                  <Label size="xs" required>
                    {t('settings.dispatchRegions.field.name')}
                  </Label>
                  <Input
                    size="xs"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    required
                    autoFocus
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs" required>
                    {t('settings.dispatchRegions.field.abbreviation')}
                  </Label>
                  <Input
                    size="xs"
                    name="abbreviation"
                    value={abbreviation}
                    onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
                    maxLength={6}
                    required
                    className="font-mono tracking-wider tabular-nums"
                  />
                  <Description size="xs">
                    {t('settings.dispatchRegions.field.abbreviationHint')}
                  </Description>
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="accent" disabled={!canSubmit}>
            {isSaving
              ? t('common.saving')
              : isEdit
                ? t('common.update')
                : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
