import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  notificationApi,
  NotificationChannel,
  type NotificationPreferenceDto,
  type AdditionalContact,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { CheckboxField, Checkbox } from './catalyst/checkbox';
import { Label } from './catalyst/fieldset';

interface NotificationPreferencesDialogProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  contact?: AdditionalContact | null;
  contactName: string;
}

export default function NotificationPreferencesDialog({
  isOpen,
  onClose,
  customerId,
  contact,
  contactName,
}: NotificationPreferencesDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [localPreferences, setLocalPreferences] = useState<Map<string, boolean>>(new Map());

  // Determine if this is for primary customer or additional contact
  const contactId = contact?.id;
  const queryKey = contactId
    ? ['notification-preferences', 'contact', customerId, contactId]
    : ['notification-preferences', 'customer', customerId];

  // Fetch preferences
  const {
    data: preferences = [],
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () =>
      contactId
        ? notificationApi.getContactPreferences(customerId, contactId)
        : notificationApi.getCustomerPreferences(customerId),
    enabled: isOpen,
  });

  // Initialize local state when preferences load
  useEffect(() => {
    if (preferences.length > 0) {
      const prefMap = new Map<string, boolean>();
      preferences.forEach((pref) => {
        const key = `${pref.notificationTypeId}-${pref.channel}`;
        prefMap.set(key, pref.optIn);
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Initializing form state from fetched data
      setLocalPreferences(prefMap);
    }
  }, [preferences]);

  // Update preference mutation
  const updateMutation = useMutation({
    mutationFn: async ({
      preferenceId,
      optIn,
    }: {
      preferenceId: string;
      optIn: boolean;
    }) => {
      return notificationApi.updatePreference(preferenceId, { optIn });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
          : undefined;
      alert(errorMessage || t('notifications.preferences.errorUpdate'));
    },
  });

  const handleToggle = (pref: NotificationPreferenceDto, newValue: boolean) => {
    // Update local state immediately for responsive UI
    const key = `${pref.notificationTypeId}-${pref.channel}`;
    setLocalPreferences((prev) => new Map(prev).set(key, newValue));

    // Update on server
    updateMutation.mutate({ preferenceId: pref.id, optIn: newValue });
  };

  const getPreferenceKey = (typeId: string, channel: NotificationChannel) => {
    return `${typeId}-${channel}`;
  };

  const isChecked = (typeId: string, channel: NotificationChannel) => {
    const key = getPreferenceKey(typeId, channel);
    return localPreferences.get(key) ?? false;
  };

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
        channels: NotificationPreferenceDto[];
      }
    >
  );

  const notificationTypes = Object.values(groupedPreferences);

  return (
    <Dialog open={isOpen} onClose={onClose} size="2xl">
      <DialogTitle>{t('notifications.preferences.title')}</DialogTitle>
      <DialogDescription>
        {t('notifications.preferences.description', { name: contactName })}
      </DialogDescription>

      <DialogBody>
        {isLoading && (
          <div className="py-8 text-center">
            <Text>{t('common.loading')}</Text>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <Text className="text-red-800 dark:text-red-400">
              {t('notifications.preferences.errorLoad')}
            </Text>
          </div>
        )}

        {!isLoading && !error && notificationTypes.length === 0 && (
          <div className="py-8 text-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              {t('notifications.preferences.noPreferences')}
            </Text>
          </div>
        )}

        {!isLoading && !error && notificationTypes.length > 0 && (
          <div className="space-y-6">
            {notificationTypes.map((notificationType) => (
              <div key={notificationType.id} className="space-y-3">
                <Text className="font-semibold">{notificationType.name}</Text>
                <div className="ml-4 space-y-2">
                  {notificationType.channels.map((pref) => (
                    <CheckboxField key={pref.id}>
                      <Checkbox
                        checked={isChecked(pref.notificationTypeId, pref.channel)}
                        onChange={(checked) => handleToggle(pref, checked)}
                        disabled={updateMutation.isPending}
                      />
                      <Label>
                        {pref.channel === NotificationChannel.EMAIL
                          ? t('notifications.preferences.channelEmail')
                          : pref.channel === NotificationChannel.SMS
                            ? t('notifications.preferences.channelSms')
                            : t('notifications.preferences.channelPush')}
                      </Label>
                    </CheckboxField>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
