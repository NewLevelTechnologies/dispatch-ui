import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import { dispatchRegionApi, type DispatchRegion, type CreateDispatchRegionRequest, type UpdateDispatchRegionRequest } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label, Description } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Select } from './catalyst/select';
import { US_STATES } from '../constants/states';

interface DispatchRegionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  region?: DispatchRegion;
}

export default function DispatchRegionFormDialog({ isOpen, onClose, region }: DispatchRegionFormDialogProps) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const isEdit = !!region;

  const [formData, setFormData] = useState<CreateDispatchRegionRequest | UpdateDispatchRegionRequest>({
    name: '',
    abbreviation: '',
    description: '',
    state: '',
    logoUrl: '',
    tabDisplayName: '',
    sortOrder: 0,
  });

  // Intentionally setting form state based on props in useEffect
  // This is the recommended pattern for initializing controlled forms when a dialog opens
  useEffect(() => {
    if (!isOpen) return;

    const initialData = region
      ? {
          name: region.name,
          abbreviation: region.abbreviation,
          description: region.description || '',
          state: region.state || '',
          logoUrl: region.logoUrl || '',
          tabDisplayName: region.tabDisplayName || '',
          sortOrder: region.sortOrder,
        }
      : {
          name: '',
          abbreviation: '',
          description: '',
          state: '',
          logoUrl: '',
          tabDisplayName: '',
          sortOrder: 0,
        };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFormData(initialData);
  }, [isOpen, region]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: (data: CreateDispatchRegionRequest) => dispatchRegionApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: `${getName('dispatch')} ${t('entities.region')}` }));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateDispatchRegionRequest) => {
      if (!region) throw new Error('No region to update');
      return dispatchRegionApi.update(region.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatch-regions'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: `${getName('dispatch')} ${t('entities.region')}` }));
    },
  });

  const handleChange = (field: keyof typeof formData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Clean up empty optional fields
    const cleanedData = {
      name: formData.name,
      abbreviation: formData.abbreviation,
      ...(formData.description?.trim() && { description: formData.description.trim() }),
      ...(formData.state?.trim() && { state: formData.state.trim() }),
      ...(formData.logoUrl?.trim() && { logoUrl: formData.logoUrl.trim() }),
      ...(formData.tabDisplayName?.trim() && { tabDisplayName: formData.tabDisplayName.trim() }),
      sortOrder: formData.sortOrder ?? 0,
    };

    if (isEdit) {
      updateMutation.mutate(cleanedData);
    } else {
      createMutation.mutate(cleanedData as CreateDispatchRegionRequest);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>
        {t(isEdit ? 'dispatchRegions.form.titleEdit' : 'dispatchRegions.form.titleCreate')}
      </DialogTitle>
      <DialogDescription>
        {t(isEdit ? 'dispatchRegions.form.descriptionEdit' : 'dispatchRegions.form.descriptionCreate')}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Fieldset>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('dispatchRegions.form.name')} *</Label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('name', e.target.value)}
                    maxLength={100}
                    required
                    autoFocus
                  />
                  <Description>{t('dispatchRegions.form.nameHelper')}</Description>
                </Field>
                <Field>
                  <Label>{t('dispatchRegions.form.abbreviation')} *</Label>
                  <Input
                    name="abbreviation"
                    value={formData.abbreviation}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('abbreviation', e.target.value.toUpperCase())}
                    maxLength={20}
                    required
                  />
                  <Description>{t('dispatchRegions.form.abbreviationHelper')}</Description>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('dispatchRegions.form.state')}</Label>
                  <Select
                    name="state"
                    value={formData.state || ''}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleChange('state', e.target.value)}
                  >
                    <option value="">{t('common.form.select')}</option>
                    {US_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field>
                  <Label>{t('dispatchRegions.form.sortOrder')}</Label>
                  <Input
                    name="sortOrder"
                    type="number"
                    value={formData.sortOrder ?? 0}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('sortOrder', parseInt(e.target.value) || 0)}
                  />
                  <Description>{t('dispatchRegions.form.sortOrderHelper')}</Description>
                </Field>
              </div>

              <Field>
                <Label>{t('dispatchRegions.form.tabDisplayName')}</Label>
                <Input
                  name="tabDisplayName"
                  value={formData.tabDisplayName || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('tabDisplayName', e.target.value)}
                  maxLength={50}
                />
                <Description>{t('dispatchRegions.form.tabDisplayNameHelper')}</Description>
              </Field>

              <Field>
                <Label>{t('dispatchRegions.form.description')}</Label>
                <Textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange('description', e.target.value)}
                  rows={2}
                />
              </Field>

              <Field>
                <Label>{t('dispatchRegions.form.logoUrl')}</Label>
                <Input
                  name="logoUrl"
                  type="url"
                  value={formData.logoUrl || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('logoUrl', e.target.value)}
                  maxLength={500}
                />
                <Description>{t('dispatchRegions.form.logoUrlHelper')}</Description>
              </Field>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
