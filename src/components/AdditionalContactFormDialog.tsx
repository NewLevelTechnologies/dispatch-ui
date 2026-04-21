import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PatternFormat } from 'react-number-format';
import { contactApi, notificationApi, type AdditionalContact, type CreateAdditionalContactRequest } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Textarea } from './catalyst/textarea';
import { Checkbox } from './catalyst/checkbox';
import { Text, Strong } from './catalyst/text';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './catalyst/table';
import { validateEmail } from '../utils/validation';

interface AdditionalContactFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentId: string;
  parentType: 'customer' | 'serviceLocation';
  customerId: string;
  contact?: AdditionalContact | null;
  queryKey: string[];
}

export default function AdditionalContactFormDialog({
  isOpen,
  onClose,
  parentId,
  parentType,
  customerId,
  contact,
  queryKey,
}: AdditionalContactFormDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isEdit = !!contact;

  const [formData, setFormData] = useState<CreateAdditionalContactRequest>({
    name: '',
    phone: null,
    email: null,
    notes: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preferencesState, setPreferencesState] = useState<Map<string, boolean>>(new Map());
  const [showPreferences, setShowPreferences] = useState(false);

  // Fetch notification preferences (only for existing contacts to avoid race condition)
  const { data: preferences = [] } = useQuery({
    queryKey: ['notification-preferences', 'contact', customerId, contact?.id],
    queryFn: () => notificationApi.getContactPreferences(customerId, contact!.id),
    enabled: isOpen && isEdit, // Only fetch for existing contacts
  });

  // Initialize form data from contact prop or empty form
  const initialFormData: CreateAdditionalContactRequest = contact
    ? {
        name: contact.name,
        phone: contact.phone || null,
        email: contact.email || null,
        notes: contact.notes || null,
      }
    : {
        name: '',
        phone: null,
        email: null,
        notes: null,
      };

  // Initialize preferences state from fetched data
  useEffect(() => {
    if (preferences.length > 0) {
      const prefMap = new Map<string, boolean>();
      preferences.forEach((pref) => {
        const key = `${pref.notificationTypeId}-${pref.channel}`;
        prefMap.set(key, pref.optIn);
      });
      setPreferencesState(prefMap);
    }
  }, [preferences]);

  // Reset form when dialog opens/closes or contact changes
  useEffect(() => {
    if (isOpen) {
      setFormData(initialFormData);
      setErrors({});
      setShowPreferences(isEdit); // Show preferences only for existing contacts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, contact?.id]);

  // Group preferences by notification type
  const groupedPreferences = preferences.reduce(
    (acc, pref) => {
      if (!acc[pref.notificationTypeId]) {
        acc[pref.notificationTypeId] = {
          id: pref.notificationTypeId,
          name: pref.notificationTypeName,
          key: pref.notificationTypeKey,
          channels: [],
        };
      }
      acc[pref.notificationTypeId].channels.push(pref);
      return acc;
    },
    {} as Record<
      string,
      {
        id: string;
        name: string;
        key: string;
        channels: typeof preferences;
      }
    >
  );

  const notificationTypes = Object.values(groupedPreferences);

  const createMutation = useMutation({
    mutationFn: async (data: CreateAdditionalContactRequest) => {
      // Create contact only - preferences can be set via bell icon after creation
      return parentType === 'customer'
        ? await contactApi.createCustomerContact(parentId, data)
        : await contactApi.createServiceLocationContact(parentId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorCreate', { entity: t('contacts.entity') }));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: CreateAdditionalContactRequest) => {
      if (!contact) throw new Error('No contact to update');

      // Update contact first
      const updatedContact = parentType === 'customer'
        ? await contactApi.updateCustomerContact(parentId, contact.id, data)
        : await contactApi.updateServiceLocationContact(parentId, contact.id, data);

      // Then update/create preferences if any changed
      const preferencesToSave = preferences.filter((pref) => {
        const key = `${pref.notificationTypeId}-${pref.channel}`;
        return preferencesState.has(key) && preferencesState.get(key) !== pref.optIn;
      });

      if (preferencesToSave.length > 0) {
        await Promise.all(
          preferencesToSave.map((pref) => {
            const key = `${pref.notificationTypeId}-${pref.channel}`;
            const optIn = preferencesState.get(key) ?? false;

            // If preference has an ID, update it. Otherwise, create it.
            if (pref.id) {
              return notificationApi.updatePreference(pref.id, { optIn });
            } else {
              // Create new preference
              return notificationApi.createPreference({
                customerId,
                contactId: contact.id,
                notificationTypeId: pref.notificationTypeId,
                optIn,
              });
            }
          })
        );
      }

      return updatedContact;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
      onClose();
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorUpdate', { entity: t('contacts.entity') }));
    },
  });

  const handleChange = (field: keyof CreateAdditionalContactRequest, value: string | null) => {
    setFormData((prev) => ({ ...prev, [field]: value || null }));
    // Clear error for this field
    if (errors[field]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name?.trim()) {
      newErrors.name = t('common.form.required', { field: t('common.form.name') });
    }

    if (formData.email && !validateEmail(formData.email)) {
      newErrors.email = t('common.form.invalidEmail');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePreferenceToggle = (notificationTypeId: string, channel: string, checked: boolean) => {
    const key = `${notificationTypeId}-${channel}`;
    setPreferencesState((prev) => new Map(prev).set(key, checked));
  };

  const isPreferenceChecked = (notificationTypeId: string, channel: string): boolean => {
    const key = `${notificationTypeId}-${channel}`;
    return preferencesState.get(key) ?? false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (isEdit) {
      updateMutation.mutate(formData);
    } else {
      createMutation.mutate(formData);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={isOpen} onClose={onClose} size="2xl">
      <DialogTitle>
        {isEdit ? t('contacts.form.titleEdit') : t('contacts.form.titleCreate')}
      </DialogTitle>
      <DialogDescription>
        {isEdit ? t('contacts.form.descriptionEdit') : t('contacts.form.descriptionCreate')}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <Fieldset>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field>
                  <Label>{t('common.form.name')} *</Label>
                  <Input
                    name="name"
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    required
                    invalid={!!errors.name}
                  />
                  {errors.name && <div className="text-xs text-red-600 mt-1">{errors.name}</div>}
                </Field>

                <Field>
                  <Label>{t('common.form.phone')}</Label>
                  <PatternFormat
                    format="(###) ###-####"
                    mask="_"
                    customInput={Input}
                    name="phone"
                    value={formData.phone || ''}
                    onValueChange={(values) => handleChange('phone', values.value)}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.email')}</Label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleChange('email', e.target.value)}
                    invalid={!!errors.email}
                  />
                  {errors.email && <div className="text-xs text-red-600 mt-1">{errors.email}</div>}
                </Field>

                <Field>
                  <Label>{t('common.form.notes')}</Label>
                  <Textarea
                    name="notes"
                    value={formData.notes || ''}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    rows={1}
                  />
                </Field>
              </div>
            </FieldGroup>
          </Fieldset>

          {/* Notification Preferences Section - Only show for existing contacts */}
          {isEdit && notificationTypes.length > 0 && (
            <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowPreferences(!showPreferences)}
                className="flex w-full items-center justify-between text-left"
              >
                <div className="flex-1">
                  <Strong className="text-sm">{t('notifications.preferences.title')}</Strong>
                  <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                    {t('notifications.preferences.formDescription')}
                  </Text>
                </div>
                <svg
                  className={`h-5 w-5 text-zinc-500 transition-transform ${showPreferences ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showPreferences && (
                <div className="mt-2">
                  <Table dense className="[--gutter:theme(spacing.1)] text-xs">
                  <TableHead>
                    <TableRow>
                      <TableHeader>{t('notifications.preferences.notificationType')}</TableHeader>
                      <TableHeader className="w-16 text-center">{t('notifications.preferences.channelEmail')}</TableHeader>
                      <TableHeader className="w-16 text-center">{t('notifications.preferences.channelSms')}</TableHeader>
                      <TableHeader className="w-16 text-center">{t('notifications.preferences.channelPush')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {notificationTypes.map((notificationType) => {
                      const emailPref = notificationType.channels.find((p) => p.channel === 'EMAIL');
                      const smsPref = notificationType.channels.find((p) => p.channel === 'SMS');
                      const pushPref = notificationType.channels.find((p) => p.channel === 'PUSH');

                      return (
                        <TableRow key={notificationType.id}>
                          <TableCell className="font-medium">{notificationType.name}</TableCell>
                          <TableCell className="text-center">
                            {emailPref && (
                              <Checkbox
                                checked={isPreferenceChecked(emailPref.notificationTypeId, emailPref.channel)}
                                onChange={(checked) =>
                                  handlePreferenceToggle(emailPref.notificationTypeId, emailPref.channel, checked)
                                }
                                disabled={isSubmitting}
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {smsPref && (
                              <Checkbox
                                checked={isPreferenceChecked(smsPref.notificationTypeId, smsPref.channel)}
                                onChange={(checked) =>
                                  handlePreferenceToggle(smsPref.notificationTypeId, smsPref.channel, checked)
                                }
                                disabled={isSubmitting}
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {pushPref && (
                              <Checkbox
                                checked={isPreferenceChecked(pushPref.notificationTypeId, pushPref.channel)}
                                onChange={(checked) =>
                                  handlePreferenceToggle(pushPref.notificationTypeId, pushPref.channel, checked)
                                }
                                disabled={isSubmitting}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('common.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
