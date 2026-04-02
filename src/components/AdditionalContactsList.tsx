import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { contactApi, type AdditionalContact } from '../api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './catalyst/table';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { Subheading } from './catalyst/heading';
import { PencilIcon, TrashIcon, PlusIcon, PhoneIcon, EnvelopeIcon, BellIcon } from '@heroicons/react/24/outline';
import AdditionalContactFormDialog from './AdditionalContactFormDialog';
import NotificationPreferencesDialog from './NotificationPreferencesDialog';
import ConfirmDialog from './ConfirmDialog';
import { formatPhone } from '../utils/formatPhone';

interface AdditionalContactsListProps {
  contacts: AdditionalContact[];
  parentId: string;
  parentType: 'customer' | 'serviceLocation';
  customerId: string; // Always required for notification preferences
  queryKey: string[];
  canEdit?: boolean;
  showAddButton?: boolean;
}

export default function AdditionalContactsList({
  contacts,
  parentId,
  parentType,
  customerId,
  queryKey,
  canEdit = true,
  showAddButton = true,
}: AdditionalContactsListProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<AdditionalContact | null>(null);
  const [contactToDelete, setContactToDelete] = useState<AdditionalContact | null>(null);
  const [notificationContact, setNotificationContact] = useState<AdditionalContact | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => {
      if (parentType === 'customer') {
        return contactApi.deleteCustomerContact(parentId, contactId);
      } else {
        return contactApi.deleteServiceLocationContact(parentId, contactId);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setContactToDelete(null);
    },
    onError: (error: unknown) => {
      const errorMessage = error instanceof Error && 'response' in error
        ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message)
        : undefined;
      alert(errorMessage || t('common.form.errorDelete', { entity: t('contacts.entity') }));
    },
  });

  const handleAdd = () => {
    setSelectedContact(null);
    setIsFormDialogOpen(true);
  };

  const handleEdit = (contact: AdditionalContact) => {
    setSelectedContact(contact);
    setIsFormDialogOpen(true);
  };

  const handleCloseFormDialog = () => {
    setIsFormDialogOpen(false);
    setSelectedContact(null);
  };

  const handleDelete = (contact: AdditionalContact) => {
    setContactToDelete(contact);
  };

  const handleManageNotifications = (contact: AdditionalContact) => {
    setNotificationContact(contact);
  };

  const confirmDelete = () => {
    if (contactToDelete) {
      deleteMutation.mutate(contactToDelete.id);
    }
  };

  if (contacts.length === 0 && !showAddButton) {
    return null;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Subheading>{t('contacts.title')}</Subheading>
        {canEdit && showAddButton && (
          <Button plain onClick={handleAdd} className="text-sm">
            <PlusIcon className="size-4" />
            {t('contacts.actions.add')}
          </Button>
        )}
      </div>

      {contacts.length === 0 ? (
        <div className="mt-2">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">{t('contacts.noContacts')}</Text>
        </div>
      ) : (
        <div className="mt-2">
          <Table dense className="[--gutter:theme(spacing.1)] text-sm">
            <TableHead>
              <TableRow>
                <TableHeader>{t('common.form.name')}</TableHeader>
                <TableHeader>{t('contacts.table.contact')}</TableHeader>
                <TableHeader>{t('common.form.notes')}</TableHeader>
                {canEdit && <TableHeader className="w-40 text-right">{t('common.actions.title')}</TableHeader>}
              </TableRow>
            </TableHead>
            <TableBody>
              {contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell className="font-medium">{contact.name}</TableCell>
                  <TableCell>
                    <div className="space-y-0.5">
                      {contact.phone && (
                        <div className="flex items-center gap-1 text-xs">
                          <PhoneIcon className="h-3 w-3 text-zinc-400 flex-shrink-0" />
                          <a href={`tel:${contact.phone}`} className="hover:underline">
                            {formatPhone(contact.phone)}
                          </a>
                        </div>
                      )}
                      {contact.email && (
                        <div className="flex items-center gap-1 text-xs">
                          <EnvelopeIcon className="h-3 w-3 text-zinc-400 flex-shrink-0" />
                          <a href={`mailto:${contact.email}`} className="hover:underline">
                            {contact.email}
                          </a>
                        </div>
                      )}
                      {!contact.phone && !contact.email && (
                        <Text className="text-xs">-</Text>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {contact.notes ? (
                      <Text className="text-xs line-clamp-2" title={contact.notes}>
                        {contact.notes}
                      </Text>
                    ) : (
                      <Text className="text-xs">-</Text>
                    )}
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <div className="flex gap-2 justify-end">
                        <Button
                          plain
                          onClick={() => handleManageNotifications(contact)}
                          title={t('notifications.preferences.manage')}
                        >
                          <BellIcon className="size-4" />
                        </Button>
                        <Button plain onClick={() => handleEdit(contact)} title={t('common.edit')}>
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button plain onClick={() => handleDelete(contact)} title={t('common.delete')}>
                          <TrashIcon className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AdditionalContactFormDialog
        isOpen={isFormDialogOpen}
        onClose={handleCloseFormDialog}
        parentId={parentId}
        parentType={parentType}
        customerId={customerId}
        contact={selectedContact}
        queryKey={queryKey}
      />

      <ConfirmDialog
        isOpen={!!contactToDelete}
        onClose={() => setContactToDelete(null)}
        onConfirm={confirmDelete}
        title={t('contacts.delete.title')}
        message={t('contacts.delete.message', { name: contactToDelete?.name || '' })}
        confirmLabel={t('common.delete')}
        isDestructive
      />

      <NotificationPreferencesDialog
        isOpen={!!notificationContact}
        onClose={() => setNotificationContact(null)}
        customerId={customerId}
        contact={notificationContact}
        contactName={notificationContact?.name || ''}
      />
    </div>
  );
}
