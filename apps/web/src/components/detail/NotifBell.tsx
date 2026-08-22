import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { BellIcon } from '@heroicons/react/24/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/24/solid';
import { notificationApi } from '../../api/setup';

// Notification bell — filled when the contact has any alert enabled. Self-fetches
// its opt-in state (cache-shared with the preferences dialog + the Contacts tab)
// unless `active` is passed explicitly. Shared by the location Site-contact card
// and the customer overview Contacts card so both render the same affordance.
export default function NotifBell({
  customerId,
  contactId,
  onClick,
  active,
}: {
  customerId: string;
  contactId: string;
  onClick: () => void;
  active?: boolean;
}) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['notification-preferences', 'contact', customerId, contactId],
    queryFn: () => notificationApi.getContactPreferences(customerId, contactId),
    enabled: active === undefined && !!customerId && !!contactId,
  });
  const on = active ?? (data ?? []).some((p) => p.optIn);
  return (
    <button
      onClick={onClick}
      title={t('notifications.preferences.tooltip')}
      aria-label={t('notifications.preferences.tooltip')}
      className={on ? 'text-fg-accent hover:text-fg-accent' : 'text-fg-dim hover:text-fg-strong'}
    >
      {on ? <BellSolidIcon className="size-3.5" /> : <BellIcon className="size-3.5" />}
    </button>
  );
}
