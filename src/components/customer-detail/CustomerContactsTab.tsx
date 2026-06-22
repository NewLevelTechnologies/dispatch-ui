/* eslint-disable i18next/no-literal-string -- dense detail page; entity-facing strings use t()/glossary, inline column labels/separators stay literal to match ServiceLocationDetailPage's Contacts tab. */
// Customer contacts — dense directory table. Mirrors the Location detail
// Contacts tab's look, but over the CUSTOMER's own contact collection
// (`customer.additionalContacts`) and its CRUD endpoints, which differ from the
// service-location contact collection — so the look is reproduced rather than
// the component reused. Add/edit/delete/notify/make-primary reuse the existing
// customer contact endpoints; the Primary pill marks the current primary.
import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PencilIcon, TrashIcon, BellIcon, UserIcon, StarIcon } from '@heroicons/react/24/outline';
import { contactApi, type AdditionalContact } from '../../api';
import { formatPhone } from '../../utils/formatPhone';
import { showError, showSuccess, extractApiError } from '../../lib/toast';
import { Card } from '../catalyst/card';
import { Pill } from '../ui/Pill';
import { DenseTable, DenseTHead, DenseRow, CellStack, CellTop, CellSub } from '../ui/DenseTable';
import ContactFormDialog from '../ContactFormDialog';
import NotificationPreferencesDialog from '../NotificationPreferencesDialog';
import ConfirmDialog from '../ConfirmDialog';
import { CardLink, CardTitle } from './shared';

function Dash() {
  return <span className="text-fg-dim">—</span>;
}

function PhoneCell({ value }: { value?: string | null }) {
  if (!value) return <Dash />;
  return (
    <a
      href={`tel:${value.replace(/\D/g, '')}`}
      className="font-mono text-[11.5px] text-fg-muted hover:text-fg-strong hover:underline"
    >
      {formatPhone(value)}
    </a>
  );
}

export default function CustomerContactsTab({
  customerId,
  contacts,
  queryKey,
  canEdit,
}: {
  customerId: string;
  contacts: AdditionalContact[];
  queryKey: string[];
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formDialog, setFormDialog] = useState<{ open: boolean; contact: AdditionalContact | null }>({
    open: false,
    contact: null,
  });
  const [toDelete, setToDelete] = useState<AdditionalContact | null>(null);
  const [notify, setNotify] = useState<AdditionalContact | null>(null);

  const rows = useMemo(
    () =>
      [...contacts].sort(
        (a, b) => Number(!!b.isPrimary) - Number(!!a.isPrimary) || a.displayOrder - b.displayOrder,
      ),
    [contacts],
  );

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => contactApi.deleteCustomerContact(customerId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setToDelete(null);
      showSuccess('Contact deleted');
    },
    onError: (err) => showError("Couldn't delete contact", extractApiError(err) ?? undefined),
  });

  const makePrimaryMutation = useMutation({
    mutationFn: (contactId: string) => contactApi.makeCustomerContactPrimary(customerId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      showSuccess('Primary contact updated');
    },
    onError: (err) => showError("Couldn't set primary contact", extractApiError(err) ?? undefined),
  });

  return (
    <>
      <Card
        title={<CardTitle icon={<UserIcon className="size-3.5" />}>{t('contacts.title')}</CardTitle>}
        action={
          canEdit ? (
            <CardLink onClick={() => setFormDialog({ open: true, contact: null })}>+ Add</CardLink>
          ) : undefined
        }
        padding="none"
      >
        {rows.length === 0 ? (
          <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">{t('contacts.noContacts')}</div>
        ) : (
          <DenseTable>
            <DenseTHead>
              <tr>
                <th>{t('common.form.name')}</th>
                <th>{t('common.form.role')}</th>
                <th>{t('common.form.mobilePhone', { defaultValue: 'Mobile' })}</th>
                <th>Office</th>
                <th>After hours</th>
                <th>{t('common.form.email')}</th>
                <th>{t('common.form.notes')}</th>
                {canEdit && <th className="right" />}
              </tr>
            </DenseTHead>
            <tbody>
              {rows.map((c) => (
                <DenseRow key={c.id}>
                  <td>
                    <CellStack>
                      <CellTop>
                        <span className="flex items-center gap-1.5">
                          <span className="font-semibold text-fg-strong">{c.name}</span>
                          {c.isPrimary && <Pill tone="info">Primary</Pill>}
                        </span>
                      </CellTop>
                      {c.role && <CellSub>{c.role}</CellSub>}
                    </CellStack>
                  </td>
                  <td className={clsx('muted', !c.role && 'dt-empty')} data-label={t('common.form.role')}>{c.role || <Dash />}</td>
                  <td className={clsx(!c.mobilePhone && 'dt-empty')} data-label={t('common.form.mobilePhone', { defaultValue: 'Mobile' })}><PhoneCell value={c.mobilePhone} /></td>
                  <td className={clsx(!c.phone && 'dt-empty')} data-label="Office"><PhoneCell value={c.phone} /></td>
                  <td className={clsx(!c.afterHoursPhone && 'dt-empty')} data-label="After hours"><PhoneCell value={c.afterHoursPhone} /></td>
                  <td className={clsx('muted', !c.email && 'dt-empty')} data-label={t('common.form.email')}>
                    {c.email ? (
                      <a href={`mailto:${c.email}`} className="text-[11.5px] text-fg-muted hover:text-fg-strong hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className={clsx('muted max-w-[200px]', !c.notes && 'dt-empty')} data-label={t('common.form.notes')}>
                    {c.notes ? (
                      <span className="block truncate" title={c.notes}>{c.notes}</span>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  {canEdit && (
                    <td className="right">
                      <div className="flex items-center justify-end gap-2 text-fg-dim">
                        {!c.isPrimary && (
                          <button
                            type="button"
                            onClick={() => makePrimaryMutation.mutate(c.id)}
                            disabled={makePrimaryMutation.isPending}
                            title="Make primary"
                            className="hover:text-fg-strong"
                          >
                            <StarIcon className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setFormDialog({ open: true, contact: c })}
                          title={t('common.edit')}
                          className="hover:text-fg-strong"
                        >
                          <PencilIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotify(c)}
                          title={t('notifications.preferences.manage')}
                          className="hover:text-fg-strong"
                        >
                          <BellIcon className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setToDelete(c)}
                          title={t('common.delete')}
                          className="hover:text-danger-500"
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </DenseRow>
              ))}
            </tbody>
          </DenseTable>
        )}
      </Card>

      <ContactFormDialog
        isOpen={formDialog.open}
        onClose={() => setFormDialog({ open: false, contact: null })}
        parentType="customer"
        parentId={customerId}
        contact={formDialog.contact}
        queryKey={queryKey}
      />

      <ConfirmDialog
        isOpen={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && deleteMutation.mutate(toDelete.id)}
        title={t('contacts.delete.title')}
        message={t('contacts.delete.message', { name: toDelete?.name || '' })}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />

      <NotificationPreferencesDialog
        isOpen={!!notify}
        onClose={() => setNotify(null)}
        customerId={customerId}
        contact={notify}
        contactName={notify?.name || ''}
      />
    </>
  );
}
