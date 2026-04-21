import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import { dispatchRegionApi, type DispatchRegion, type CreateDispatchRegionRequest, type UpdateDispatchRegionRequest } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
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
  const [showOptionalFields, setShowOptionalFields] = useState(false);

  const [formData, setFormData] = useState<CreateDispatchRegionRequest | UpdateDispatchRegionRequest>({
    name: '',
    abbreviation: '',
    description: '',
    state: '',
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
          tabDisplayName: region.tabDisplayName || '',
          sortOrder: region.sortOrder,
        }
      : {
          name: '',
          abbreviation: '',
          description: '',
          state: '',
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
      let errorMessage: string | undefined;

      if (error instanceof Error && 'response' in error) {
        const axiosError = error as { response?: { data?: unknown } };
        const data = axiosError.response?.data;

        if (typeof data === 'string') {
          errorMessage = data;
        } else if (data && typeof data === 'object') {
          errorMessage = (data as { message?: string }).message || (data as { error?: string }).error;
        }
      }

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
      let errorMessage: string | undefined;

      if (error instanceof Error && 'response' in error) {
        const axiosError = error as { response?: { data?: unknown } };
        const data = axiosError.response?.data;

        if (typeof data === 'string') {
          errorMessage = data;
        } else if (data && typeof data === 'object') {
          errorMessage = (data as { message?: string }).message || (data as { error?: string }).error;
        }
      }

      alert(errorMessage || t('common.form.errorUpdate', { entity: `${getName('dispatch')} ${t('entities.region')}` }));
    },
  });

  const handleChange = (field: keyof typeof formData, value: string | number | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      name: formData.name,
      abbreviation: formData.abbreviation,
      description: formData.description?.trim() || '',
      state: formData.state?.trim() || '',
      tabDisplayName: formData.tabDisplayName?.trim() || '',
      sortOrder: formData.sortOrder ?? 0,
    };

    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data as CreateDispatchRegionRequest);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose}>
      <DialogTitle>
        {t(isEdit ? 'dispatchRegions.form.titleEdit' : 'dispatchRegions.form.titleCreate', { dispatch: getName('dispatch') })}
      </DialogTitle>
      <DialogDescription>
        {t(isEdit ? 'dispatchRegions.form.descriptionEdit' : 'dispatchRegions.form.descriptionCreate', { dispatch: getName('dispatch') })}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          <Fieldset>
            <FieldGroup className="space-y-2">
              {/* Name + Abbreviation */}
              <div className="grid grid-cols-3 gap-2">
                <Field className="col-span-2">
                  <Label className="text-xs">{t('dispatchRegions.form.name')} *</Label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('name', e.target.value)}
                    maxLength={100}
                    required
                    autoFocus
                    placeholder="Atlanta Region"
                  />
                </Field>
                <Field>
                  <Label className="text-xs">{t('dispatchRegions.form.abbreviation')} *</Label>
                  <Input
                    name="abbreviation"
                    value={formData.abbreviation}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('abbreviation', e.target.value.toUpperCase())}
                    maxLength={20}
                    required
                    placeholder="ATL"
                  />
                </Field>
              </div>

              {/* Optional fields - collapsible */}
              <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowOptionalFields(!showOptionalFields)}
                  className="flex w-full items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
                >
                  <svg className={`h-4 w-4 transition-transform ${showOptionalFields ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {t('common.form.optional')} (4)
                </button>
                {showOptionalFields && (
                  <div className="mt-2 space-y-2 pl-6">
                    {/* State + Sort Order */}
                    <div className="grid grid-cols-2 gap-2">
                      <Field>
                        <Label className="text-xs">{t('dispatchRegions.form.state')}</Label>
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
                        <Label className="text-xs">{t('dispatchRegions.form.sortOrder')}</Label>
                        <Input
                          name="sortOrder"
                          type="number"
                          value={formData.sortOrder ?? 0}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('sortOrder', parseInt(e.target.value) || 0)}
                        />
                      </Field>
                    </div>

                  {/* Tab Display Name */}
                  <Field>
                    <Label className="text-xs">{t('dispatchRegions.form.tabDisplayName', { dispatch: getName('dispatch') })}</Label>
                    <Input
                      name="tabDisplayName"
                      value={formData.tabDisplayName || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('tabDisplayName', e.target.value)}
                      maxLength={50}
                      placeholder="Optional"
                    />
                  </Field>

                  {/* Description */}
                  <Field>
                    <Label className="text-xs">{t('dispatchRegions.form.description')}</Label>
                    <Textarea
                      name="description"
                      value={formData.description || ''}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange('description', e.target.value)}
                      rows={2}
                      placeholder="Optional"
                    />
                  </Field>
                </div>
              )}
            </div>
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
