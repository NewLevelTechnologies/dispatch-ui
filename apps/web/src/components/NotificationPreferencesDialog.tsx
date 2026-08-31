import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { DevicePhoneMobileIcon, EnvelopeIcon } from '@heroicons/react/24/outline';
import {
  notificationApi,
  NotificationChannel,
  type NotificationPreferenceDto,
  type AdditionalContact,
} from '../api/setup';
import { formatPhone } from '@dispatch/utils';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { Checkbox } from './catalyst/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './catalyst/table';

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
    mutationFn: async ({ pref, optIn }: { pref: NotificationPreferenceDto; optIn: boolean }) => {
      // If preference has an ID, update it. Otherwise, create it.
      if (pref.id) {
        return notificationApi.updatePreference(pref.id, { optIn });
      }
      return notificationApi.createPreference({
        customerId,
        contactId: contactId ?? null,
        notificationTypeId: pref.notificationTypeId,
        optIn,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error: unknown) => {
      const errorMessage =
        error instanceof Error && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(errorMessage || t('notifications.preferences.errorUpdate'));
    },
  });

  const isChecked = (typeId: string, channel: NotificationChannel) =>
    localPreferences.get(`${typeId}-${channel}`) ?? false;

  const handleToggle = (pref: NotificationPreferenceDto, newValue: boolean) => {
    // Optimistic local update for a responsive matrix; server write follows.
    setLocalPreferences((prev) => new Map(prev).set(`${pref.notificationTypeId}-${pref.channel}`, newValue));
    updateMutation.mutate({ pref, optIn: newValue });
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
    {} as Record<string, { id: string; name: string; key: string; channels: NotificationPreferenceDto[] }>
  );
  const notificationTypes = Object.values(groupedPreferences);

  // Channel availability has two gates: the notification type must support the
  // channel (a pref row exists), AND — for a contact — the contact must have an
  // address for it (email for EMAIL, mobile for SMS). Push isn't address-gated.
  // For customer-level prefs (no contact) only the pref-row gate applies.
  const smsNumber = contact?.mobilePhone ?? null;
  const channelHasAddress = (channel: NotificationChannel): boolean => {
    if (!contact) return true;
    if (channel === NotificationChannel.EMAIL) return !!contact.email;
    if (channel === NotificationChannel.SMS) return !!smsNumber;
    return true; // PUSH
  };

  const channelColumns = [
    { channel: NotificationChannel.EMAIL, label: t('notifications.preferences.channelEmail') },
    { channel: NotificationChannel.SMS, label: t('notifications.preferences.channelSms') },
    { channel: NotificationChannel.PUSH, label: t('notifications.preferences.channelPush') },
  ];

  const prefFor = (typeId: string, channel: NotificationChannel) =>
    groupedPreferences[typeId]?.channels.find((p) => p.channel === channel);

  // Available cells in a column (pref row exists AND address gate passes) —
  // backs both the "toggle all" header state and its click target.
  const availableInColumn = (channel: NotificationChannel): NotificationPreferenceDto[] => {
    if (!channelHasAddress(channel)) return [];
    return notificationTypes
      .map((nt) => prefFor(nt.id, channel))
      .filter((p): p is NotificationPreferenceDto => !!p);
  };

  const toggleColumn = (channel: NotificationChannel, newValue: boolean) => {
    availableInColumn(channel).forEach((pref) => {
      if (isChecked(pref.notificationTypeId, channel) !== newValue) handleToggle(pref, newValue);
    });
  };

  // Hints under the matrix when a contact lacks an address a channel needs.
  const showSmsHint = !!contact && !smsNumber;
  const showEmailHint = !!contact && !contact.email;

  return (
    <Dialog open={isOpen} onClose={onClose} size="2xl">
      <DialogTitle>{t('notifications.preferences.title')}</DialogTitle>
      <DialogDescription>{t('notifications.preferences.description', { name: contactName })}</DialogDescription>

      {/* Scope line — ties the SMS / Email routing to the contact's real
          number + address so it's clear where alerts actually land. */}
      {contact && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-fg-muted">
          <span>{t('notifications.preferences.scopeIntro', { name: contactName })}</span>
          {smsNumber && (
            <span className="inline-flex items-center gap-1 font-mono text-fg-strong">
              <DevicePhoneMobileIcon className="size-3.5 text-fg-muted" />
              {formatPhone(smsNumber)}
            </span>
          )}
          {contact.email && (
            <span className="inline-flex items-center gap-1 text-fg-strong">
              <EnvelopeIcon className="size-3.5 text-fg-muted" />
              {contact.email}
            </span>
          )}
          {!smsNumber && !contact.email && (
            <span style={{ color: 'var(--warning-fg)' }}>{t('notifications.preferences.noAddresses')}</span>
          )}
        </div>
      )}

      <DialogBody>
        {isLoading && (
          <div className="py-8 text-center">
            <Text>{t('common.loading')}</Text>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <Text className="text-red-800 dark:text-red-400">{t('notifications.preferences.errorLoad')}</Text>
          </div>
        )}

        {!isLoading && !error && notificationTypes.length === 0 && (
          <div className="py-8 text-center">
            <Text className="text-zinc-500 dark:text-zinc-400">{t('notifications.preferences.noPreferences')}</Text>
          </div>
        )}

        {!isLoading && !error && notificationTypes.length > 0 && (
          <>
            <Table dense className="[--gutter:theme(spacing.2)] text-sm">
              <TableHead>
                <TableRow>
                  <TableHeader>{t('notifications.preferences.notificationType')}</TableHeader>
                  {channelColumns.map(({ channel, label }) => {
                    const available = availableInColumn(channel);
                    const allOn = available.length > 0 && available.every((p) => isChecked(p.notificationTypeId, channel));
                    const someOn = available.some((p) => isChecked(p.notificationTypeId, channel));
                    return (
                      <TableHeader key={channel} className="text-center">
                        {/* Column header toggles the whole column — the common
                            "turn on Email for everything" action. */}
                        <label className="inline-flex cursor-pointer items-center gap-1.5">
                          {available.length > 0 && (
                            <Checkbox
                              color="accent"
                              aria-label={t('notifications.preferences.toggleAll', { channel: label })}
                              checked={allOn}
                              indeterminate={someOn && !allOn}
                              onChange={(checked) => toggleColumn(channel, checked)}
                              disabled={updateMutation.isPending}
                            />
                          )}
                          <span>{label}</span>
                        </label>
                      </TableHeader>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {notificationTypes.map((nt) => (
                  <TableRow key={nt.id}>
                    <TableCell className="font-medium text-fg-strong">{nt.name}</TableCell>
                    {channelColumns.map(({ channel }) => {
                      const pref = prefFor(nt.id, channel);
                      const available = !!pref && channelHasAddress(channel);
                      return (
                        <TableCell key={channel} className="text-center">
                          {available ? (
                            <Checkbox
                              color="accent"
                              checked={isChecked(nt.id, channel)}
                              onChange={(checked) => handleToggle(pref!, checked)}
                              disabled={updateMutation.isPending}
                            />
                          ) : (
                            // Unavailable (channel doesn't apply or no address) —
                            // an explicit muted dash, never an ambiguous blank.
                            <span className="text-fg-dim" title={t('notifications.preferences.unavailable')}>
                              —
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {(showSmsHint || showEmailHint) && (
              <div className="mt-2 space-y-0.5 text-[11px] text-fg-dim">
                {showEmailHint && <div>{t('notifications.preferences.emailUnavailable')}</div>}
                {showSmsHint && <div>{t('notifications.preferences.smsUnavailable')}</div>}
              </div>
            )}
          </>
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
