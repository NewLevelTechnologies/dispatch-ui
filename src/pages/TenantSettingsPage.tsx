import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tenantSettingsApi, type UpdateTenantSettingsRequest } from '../api';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Subheading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Field, FieldGroup, Fieldset, Label, Description } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Textarea } from '../components/catalyst/textarea';
import { CheckboxField, Checkbox } from '../components/catalyst/checkbox';
import { Divider } from '../components/catalyst/divider';

export default function TenantSettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Fetch settings
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });

  // Initialize form data
  const [formData, setFormData] = useState<UpdateTenantSettingsRequest>({});

  // Update form data when settings load
  useEffect(() => {
    if (settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFormData({
        companyName: settings.companyName,
        companyNameShort: settings.companyNameShort,
        companySlogan: settings.companySlogan,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        streetAddress: settings.streetAddress,
        city: settings.city,
        state: settings.state,
        zipCode: settings.zipCode,
        phone: settings.phone,
        fax: settings.fax,
        email: settings.email,
        timezone: settings.timezone,
        defaultTaxRate: settings.defaultTaxRate,
        invoiceTerms: settings.invoiceTerms,
        enableOnlineBooking: settings.enableOnlineBooking,
        enableSmsNotifications: settings.enableSmsNotifications,
        enableEmailNotifications: settings.enableEmailNotifications,
      });
    }
  }, [settings]);

  // Update settings mutation
  const updateMutation = useMutation({
    mutationFn: (data: UpdateTenantSettingsRequest) => tenantSettingsApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      alert(t('tenantSettings.messages.settingsUpdatedSuccess'));
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('tenantSettings.messages.errorUpdateSettings'));
    },
  });

  // Upload logo mutation
  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => tenantSettingsApi.uploadLogo(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      setLogoFile(null);
      setLogoPreview(null);
      alert(t('tenantSettings.messages.logoUploadedSuccess'));
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('tenantSettings.messages.errorUploadLogo'));
    },
  });

  const handleChange = (field: keyof UpdateTenantSettingsRequest, value: string | number | boolean | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > 5 * 1024 * 1024) {
      alert(t('tenantSettings.messages.fileSizeTooLarge'));
      return;
    }

    // Validate file type
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      alert(t('tenantSettings.messages.invalidFileType'));
      return;
    }

    setLogoFile(file);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleLogoUpload = () => {
    if (!logoFile) return;
    uploadLogoMutation.mutate(logoFile);
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8">
          <p className="text-zinc-500 dark:text-zinc-400">{t('tenantSettings.messages.loadingSettings')}</p>
        </div>
      </AppLayout>
    );
  }

  if (error) {
    return (
      <AppLayout>
        <div className="p-8">
          <p className="text-red-600">{t('tenantSettings.messages.errorLoadingSettings')}</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl">
        <Heading>{t('entities.tenantSettings')}</Heading>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {t('tenantSettings.description')}
        </p>

        <Divider className="my-8" />

        <form onSubmit={handleSubmit}>
          {/* Company Information */}
          <Fieldset className="mb-8">
            <Subheading>{t('tenantSettings.sections.companyInfo')}</Subheading>
            <FieldGroup className="mt-4">
              <Field>
                <Label>{t('tenantSettings.form.companyName')} *</Label>
                <Input
                  name="companyName"
                  value={formData.companyName || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('companyName', e.target.value)}
                  required
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('tenantSettings.form.companyNameShort')}</Label>
                  <Description>{t('tenantSettings.form.companyNameShortHelper')}</Description>
                  <Input
                    name="companyNameShort"
                    value={formData.companyNameShort || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('companyNameShort', e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>{t('tenantSettings.form.companySlogan')}</Label>
                  <Description>{t('tenantSettings.form.companySloganHelper')}</Description>
                  <Input
                    name="companySlogan"
                    value={formData.companySlogan || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('companySlogan', e.target.value)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>

          <Divider className="my-8" />

          {/* Branding & Logo */}
          <Fieldset className="mb-8">
            <Subheading>{t('tenantSettings.sections.branding')}</Subheading>
            <FieldGroup className="mt-4">
              <Field>
                <Label>{t('tenantSettings.form.logo')}</Label>
                <Description>{t('tenantSettings.form.logoHelper')}</Description>
                {(logoPreview || settings?.logoThumbnailUrl) && (
                  <div className="mt-2 mb-4">
                    <img
                      src={logoPreview || settings?.logoThumbnailUrl || ''}
                      alt="Company logo"
                      className="h-32 w-32 object-contain rounded border border-zinc-200 dark:border-zinc-700"
                    />
                  </div>
                )}
                <div className="flex gap-2 items-center">
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleLogoChange}
                    className="text-sm"
                  />
                  {logoFile && (
                    <Button
                      type="button"
                      onClick={handleLogoUpload}
                      disabled={uploadLogoMutation.isPending}
                    >
                      {uploadLogoMutation.isPending ? t('common.saving') : t('tenantSettings.form.uploadLogo')}
                    </Button>
                  )}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('tenantSettings.form.primaryColor')} *</Label>
                  <Description>{t('tenantSettings.form.primaryColorHelper')}</Description>
                  <Input
                    name="primaryColor"
                    type="color"
                    value={formData.primaryColor || '#1976d2'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('primaryColor', e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('tenantSettings.form.secondaryColor')} *</Label>
                  <Description>{t('tenantSettings.form.secondaryColorHelper')}</Description>
                  <Input
                    name="secondaryColor"
                    type="color"
                    value={formData.secondaryColor || '#dc004e'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('secondaryColor', e.target.value)}
                    required
                  />
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>

          <Divider className="my-8" />

          {/* Contact Information */}
          <Fieldset className="mb-8">
            <Subheading>{t('tenantSettings.sections.contactInfo')}</Subheading>
            <FieldGroup className="mt-4">
              <Field>
                <Label>{t('tenantSettings.form.streetAddress')}</Label>
                <Input
                  name="streetAddress"
                  value={formData.streetAddress || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('streetAddress', e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-3 gap-4">
                <Field>
                  <Label>{t('tenantSettings.form.city')}</Label>
                  <Input
                    name="city"
                    value={formData.city || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('city', e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>{t('tenantSettings.form.state')}</Label>
                  <Description>{t('tenantSettings.form.stateHelper')}</Description>
                  <Input
                    name="state"
                    value={formData.state || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('state', e.target.value)}
                    maxLength={2}
                  />
                </Field>

                <Field>
                  <Label>{t('tenantSettings.form.zipCode')}</Label>
                  <Input
                    name="zipCode"
                    value={formData.zipCode || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('zipCode', e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Field>
                  <Label>{t('tenantSettings.form.phone')}</Label>
                  <Input
                    name="phone"
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('phone', e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>{t('tenantSettings.form.fax')}</Label>
                  <Input
                    name="fax"
                    type="tel"
                    value={formData.fax || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('fax', e.target.value)}
                  />
                </Field>

                <Field>
                  <Label>{t('tenantSettings.form.email')}</Label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('email', e.target.value)}
                  />
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>

          <Divider className="my-8" />

          {/* Business Settings */}
          <Fieldset className="mb-8">
            <Subheading>{t('tenantSettings.sections.businessSettings')}</Subheading>
            <FieldGroup className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <Label>{t('tenantSettings.form.timezone')} *</Label>
                  <Description>{t('tenantSettings.form.timezoneHelper')}</Description>
                  <Input
                    name="timezone"
                    value={formData.timezone || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('timezone', e.target.value)}
                    placeholder="America/New_York"
                    required
                  />
                </Field>

                <Field>
                  <Label>{t('tenantSettings.form.defaultTaxRate')}</Label>
                  <Description>{t('tenantSettings.form.defaultTaxRateHelper')}</Description>
                  <Input
                    name="defaultTaxRate"
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={formData.defaultTaxRate || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('defaultTaxRate', parseFloat(e.target.value))}
                  />
                </Field>
              </div>

              <Field>
                <Label>{t('tenantSettings.form.invoiceTerms')}</Label>
                <Description>{t('tenantSettings.form.invoiceTermsHelper')}</Description>
                <Textarea
                  name="invoiceTerms"
                  value={formData.invoiceTerms || ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange('invoiceTerms', e.target.value)}
                  rows={2}
                />
              </Field>
            </FieldGroup>
          </Fieldset>

          <Divider className="my-8" />

          {/* Feature Flags */}
          <Fieldset className="mb-8">
            <Subheading>{t('tenantSettings.sections.featureFlags')}</Subheading>
            <FieldGroup className="mt-4">
              <CheckboxField>
                <Checkbox
                  name="enableOnlineBooking"
                  checked={formData.enableOnlineBooking || false}
                  onChange={(checked) => handleChange('enableOnlineBooking', checked)}
                />
                <Label>{t('tenantSettings.form.enableOnlineBooking')}</Label>
              </CheckboxField>

              <CheckboxField>
                <Checkbox
                  name="enableSmsNotifications"
                  checked={formData.enableSmsNotifications || false}
                  onChange={(checked) => handleChange('enableSmsNotifications', checked)}
                />
                <Label>{t('tenantSettings.form.enableSmsNotifications')}</Label>
              </CheckboxField>

              <CheckboxField>
                <Checkbox
                  name="enableEmailNotifications"
                  checked={formData.enableEmailNotifications || false}
                  onChange={(checked) => handleChange('enableEmailNotifications', checked)}
                />
                <Label>{t('tenantSettings.form.enableEmailNotifications')}</Label>
              </CheckboxField>
            </FieldGroup>
          </Fieldset>

          <Divider className="my-8" />

          <div className="flex justify-end gap-4">
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('common.saving') : t('common.update')}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
