import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { tenantSettingsApi, type UpdateTenantSettingsRequest } from '../api';
import { useHasCapability } from '../hooks/useCurrentUser';
import AppLayout from '../components/AppLayout';
import { Heading, Subheading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Field, FieldGroup, Label, Description } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Textarea } from '../components/catalyst/textarea';
import { CheckboxField, Checkbox } from '../components/catalyst/checkbox';
import { Divider } from '../components/catalyst/divider';
import { US_STATES } from '../constants/states';
import { US_TIMEZONES } from '../constants/timezones';

export default function TenantSettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const canEdit = useHasCapability('EDIT_SETTINGS');
  const [isEditing, setIsEditing] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setIsEditing(false);
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
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

  // View mode - display settings
  if (!isEditing) {
    return (
      <AppLayout>
        <div className="p-8 max-w-7xl">
          <div className="flex items-start justify-between mb-6">
            <div>
              <Heading>{t('entities.tenantSettings')}</Heading>
              <Text className="mt-1">{t('tenantSettings.description')}</Text>
            </div>
            {canEdit && (
              <Button onClick={() => setIsEditing(true)}>{t('common.edit')}</Button>
            )}
          </div>

          <Divider className="my-4" />

          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            {/* Company Information */}
            <div>
              <Subheading className="mb-3">{t('tenantSettings.sections.companyInfo')}</Subheading>
              <div className="space-y-1 text-sm text-zinc-900 dark:text-white">
                <div className="text-base font-semibold">{settings?.companyName || '-'}</div>
                {settings?.streetAddress && <div>{settings.streetAddress}</div>}
                {(settings?.city || settings?.state || settings?.zipCode) && (
                  <div>
                    {[settings.city, [settings.state, settings.zipCode].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                  </div>
                )}
                {settings?.phone && <div>{settings.phone}</div>}
                {settings?.email && <div>{settings.email}</div>}
              </div>
            </div>

            {/* Branding & Logo */}
            <div>
              <Subheading className="mb-3">{t('tenantSettings.sections.branding')}</Subheading>
              <dl className="space-y-3">
                {settings?.logoThumbnailUrl && (
                  <div>
                    <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-2">{t('tenantSettings.form.logo')}</dt>
                    <dd>
                      <img
                        src={settings.logoThumbnailUrl}
                        alt="Company logo"
                        className="h-20 w-20 object-contain rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                      />
                    </dd>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('tenantSettings.form.primaryColor')}</dt>
                    <dd className="mt-0.5 flex items-center gap-2">
                      <div className="h-5 w-5 rounded border border-zinc-200 dark:border-zinc-700" style={{ backgroundColor: settings?.primaryColor }} />
                      <span className="text-sm text-zinc-900 dark:text-white">{settings?.primaryColor || '-'}</span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('tenantSettings.form.secondaryColor')}</dt>
                    <dd className="mt-0.5 flex items-center gap-2">
                      <div className="h-5 w-5 rounded border border-zinc-200 dark:border-zinc-700" style={{ backgroundColor: settings?.secondaryColor }} />
                      <span className="text-sm text-zinc-900 dark:text-white">{settings?.secondaryColor || '-'}</span>
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            {/* Business Settings */}
            <div>
              <Subheading className="mb-3">{t('tenantSettings.sections.businessSettings')}</Subheading>
              <dl className="space-y-2">
                <div>
                  <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('tenantSettings.form.timezone')}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">{settings?.timezone || '-'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('tenantSettings.form.defaultTaxRate')}</dt>
                  <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">
                    {settings?.defaultTaxRate ? `${(settings.defaultTaxRate * 100).toFixed(2)}%` : '-'}
                  </dd>
                </div>
                {settings?.invoiceTerms && (
                  <div>
                    <dt className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('tenantSettings.form.invoiceTerms')}</dt>
                    <dd className="mt-0.5 text-sm text-zinc-900 dark:text-white">{settings.invoiceTerms}</dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Feature Flags */}
            <div className="col-span-2">
              <Subheading className="mb-3">{t('tenantSettings.sections.featureFlags')}</Subheading>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-900 dark:text-white">{t('tenantSettings.form.enableOnlineBooking')}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${settings?.enableOnlineBooking ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {settings?.enableOnlineBooking ? t('common.enabled') : t('common.disabled')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-900 dark:text-white">{t('tenantSettings.form.enableSmsNotifications')}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${settings?.enableSmsNotifications ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {settings?.enableSmsNotifications ? t('common.enabled') : t('common.disabled')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-900 dark:text-white">{t('tenantSettings.form.enableEmailNotifications')}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${settings?.enableEmailNotifications ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {settings?.enableEmailNotifications ? t('common.enabled') : t('common.disabled')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }
  // Edit mode - form for editing settings
  return (
    <AppLayout>
      <div className="p-8 max-w-7xl">
        <div className="flex items-start justify-between mb-6">
          <div>
            <Heading>{t('entities.tenantSettings')}</Heading>
            <Text className="mt-1">{t('tenantSettings.description')}</Text>
          </div>
        </div>

        <Divider className="my-4" />

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-x-12 gap-y-6">
            {/* Company Information - Left */}
            <div>
              <Subheading className="mb-3">{t('tenantSettings.sections.companyInfo')}</Subheading>
              <FieldGroup className="space-y-3">
                <Field>
                  <Label>{t('tenantSettings.form.companyName')} *</Label>
                  <Input
                    name="companyName"
                    value={formData.companyName || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('companyName', e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <Label>{t('tenantSettings.form.companyNameShort')}</Label>
                  <Input
                    name="companyNameShort"
                    value={formData.companyNameShort || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('companyNameShort', e.target.value)}
                    placeholder="Acme"
                  />
                </Field>
                <Field>
                  <Label>{t('tenantSettings.form.companySlogan')}</Label>
                  <Input
                    name="companySlogan"
                    value={formData.companySlogan || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('companySlogan', e.target.value)}
                    placeholder="Your tagline here"
                  />
                </Field>
                <Field>
                  <Label>{t('tenantSettings.form.streetAddress')}</Label>
                  <Input
                    name="streetAddress"
                    value={formData.streetAddress || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('streetAddress', e.target.value)}
                  />
                </Field>
                <div className="grid grid-cols-3 gap-3">
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
                    <Label>{t('tenantSettings.form.zipCode')}</Label>
                    <Input
                      name="zipCode"
                      value={formData.zipCode || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('zipCode', e.target.value)}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
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
            </div>

            {/* Branding & Logo - Right */}
            <div>
              <Subheading className="mb-3">{t('tenantSettings.sections.branding')}</Subheading>
              <FieldGroup className="space-y-3">
                <Field>
                  <Label>{t('tenantSettings.form.logo')}</Label>
                  {(logoPreview || settings?.logoThumbnailUrl) && (
                    <div className="mb-2">
                      <img
                        src={logoPreview || settings?.logoThumbnailUrl || ''}
                        alt="Company logo"
                        className="h-20 w-20 object-contain rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800"
                      />
                    </div>
                  )}
                  <div className="flex gap-2 items-center">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleLogoChange}
                      className="text-sm text-zinc-900 dark:text-zinc-100 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-900/20 dark:file:text-indigo-400 dark:hover:file:bg-indigo-900/30"
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
                  <Description>{t('tenantSettings.form.logoHelper')}</Description>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>{t('tenantSettings.form.primaryColor')} *</Label>
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
            </div>

            {/* Business Settings - Right */}
            <div>
              <Subheading className="mb-3">{t('tenantSettings.sections.businessSettings')}</Subheading>
              <FieldGroup className="space-y-3">
                <Field>
                  <Label>{t('tenantSettings.form.timezone')} *</Label>
                  <Select
                    name="timezone"
                    value={formData.timezone || ''}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleChange('timezone', e.target.value)}
                    required
                  >
                    <option value="">{t('common.form.select')}</option>
                    {US_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </Select>
                  <Description>{t('tenantSettings.form.timezoneHelper')}</Description>
                </Field>
                <Field>
                  <Label>{t('tenantSettings.form.defaultTaxRate')}</Label>
                  <Input
                    name="defaultTaxRate"
                    type="number"
                    step="0.0001"
                    min="0"
                    max="1"
                    value={formData.defaultTaxRate || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleChange('defaultTaxRate', parseFloat(e.target.value))}
                    placeholder="0.0825"
                  />
                  <Description>{t('tenantSettings.form.defaultTaxRateHelper')}</Description>
                </Field>
                <Field>
                  <Label>{t('tenantSettings.form.invoiceTerms')}</Label>
                  <Textarea
                    name="invoiceTerms"
                    value={formData.invoiceTerms || ''}
                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleChange('invoiceTerms', e.target.value)}
                    rows={2}
                    placeholder="Net 30"
                  />
                </Field>
              </FieldGroup>
            </div>

            {/* Feature Flags - Full Width */}
            <div className="col-span-2">
              <Subheading className="mb-3">{t('tenantSettings.sections.featureFlags')}</Subheading>
              <FieldGroup className="space-y-2">
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
            </div>
          </div>

          <Divider className="my-6" />

          <div className="flex justify-end gap-3">
            <Button plain onClick={() => setIsEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? t('common.saving') : t('common.update')}
            </Button>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
