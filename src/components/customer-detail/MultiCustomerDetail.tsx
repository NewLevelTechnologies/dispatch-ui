/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/separators/short operational labels stay literal to keep the markup readable (same convention as ServiceLocationDetailPage). */
// MULTI customer detail — the billing-hub shell for a multi-site customer.
// One shell (back-link → header → tabs → body → lifecycle footer) shared with
// the SINGLE + BILLING_ONLY variants to come; this file is the MULTI body
// composition. Overview + Locations are the redesigned surfaces; the remaining
// tabs reuse the existing list components inside the new shell (the mock stubs
// them — they are not part of this design pass).
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  customerApi,
  equipmentApi,
  agreementApi,
  invoicesApi,
  EquipmentStatus,
  type Customer,
  type CustomerStatus,
  type Equipment,
  type EquipmentSummary,
  type UpdateCustomerRequest,
} from '../../api';
import { workOrdersListQueryOptions } from '../../api/workOrdersListQuery';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { showSuccess, showError, extractApiError } from '../../lib/toast';
import { handleConcurrentEdit } from '../../lib/conflict';
import AppLayout from '../AppLayout';
import { Heading } from '../catalyst/heading';
import { Button } from '../catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import { Pill } from '../ui/Pill';
import { Tabs } from '../ui/Tabs';
import { Callout } from '../ui/Callout';
import IconButton from '../IconButton';
import ConfirmDialog from '../ConfirmDialog';
import WorkOrderFormDialog from '../WorkOrderFormDialog';
import EquipmentFormDialog from '../EquipmentFormDialog';
import NotificationPreferencesDialog from '../NotificationPreferencesDialog';
import CustomerActivityStream from './CustomerActivityStream';
import CustomerAgreementsTab from '../CustomerAgreementsTab';
import CustomerHeaderTags from './CustomerHeaderTags';
import MultiOverviewTab, { CustomerHeaderEdit } from './MultiOverviewTab';
import MultiLocationsTab from './MultiLocationsTab';
import CustomerEquipmentTab from './CustomerEquipmentTab';
import CustomerInvoicesTab from './CustomerInvoicesTab';
import CustomerWorkOrdersTab from './CustomerWorkOrdersTab';
import CustomerContactsTab from './CustomerContactsTab';
import { OrgMark } from './shared';
import { formatDateShort } from './format';
import { formatPhone } from '../../utils/formatPhone';
import { titleCaseAddress } from '../../utils/titleCaseAddress';
import { useUrlTab } from '../../hooks/useUrlTab';

type TabId =
  | 'overview'
  | 'locations'
  | 'agreements'
  | 'equipment'
  | 'jobs'
  | 'invoices'
  | 'contacts'
  | 'activity';

const VALID_TABS: TabId[] = [
  'overview',
  'locations',
  'agreements',
  'equipment',
  'jobs',
  'invoices',
  'contacts',
  'activity',
];

export default function MultiCustomerDetail({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEditCustomers = useHasCapability('EDIT_CUSTOMERS');
  const canAddServiceLocations = useHasCapability('ADD_SERVICE_LOCATIONS');

  const [activeTab, setActiveTab] = useUrlTab(VALID_TABS, 'overview');

  const [editingHeader, setEditingHeader] = useState(false);
  const [isNewWorkOrderOpen, setIsNewWorkOrderOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isEquipmentOpen, setIsEquipmentOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [deletingEquipment, setDeletingEquipment] = useState<EquipmentSummary | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState(false);

  // Tab-count queries. These share keys with the Overview/Equipment tabs, so
  // React Query serves both the count badge and the tab body from one request.
  const { data: workOrdersData } = useQuery(workOrdersListQueryOptions({ customerId: customer.id }));
  const { data: agreementsData } = useQuery({
    queryKey: ['agreements', { customerId: customer.id }],
    queryFn: () => agreementApi.list({ customerId: customer.id }),
    enabled: !!customer.id,
  });
  const { data: equipmentPage } = useQuery({
    queryKey: ['equipment', { customerId: customer.id }],
    queryFn: () => equipmentApi.list({ customerId: customer.id, status: EquipmentStatus.ACTIVE, size: 100 }),
    enabled: !!customer.id,
  });
  // Invoice tab-count badge. Stable (customerId-only, unfiltered) so it shows the
  // customer's total — distinct from the tab body's filtered/paged query. size:1
  // keeps the payload minimal; we only read totalElements.
  const { data: invoicesCount } = useQuery({
    queryKey: ['invoices', 'customer-count', customer.id],
    queryFn: () => invoicesApi.getAll({ customerId: customer.id, size: 1 }),
    enabled: !!customer.id,
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: string) => equipmentApi.delete(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', { customerId: customer.id }] });
      // WO detail + list caches embed workItems[].equipment summaries.
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      setDeletingEquipment(null);
      showSuccess(t('common.form.successDelete', { entity: getName('equipment'), defaultValue: 'Deleted' }));
    },
    onError: (err) => showError(t('common.form.errorDelete', { entity: getName('equipment') }), extractApiError(err) ?? undefined),
  });

  const lifecycleMutation = useMutation({
    mutationFn: () => {
      const nextStatus: CustomerStatus = customer.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      const request: UpdateCustomerRequest = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone ?? null,
        type: customer.type,
        paymentTermsDays: customer.paymentTermsDays,
        requiresPurchaseOrder: customer.requiresPurchaseOrder,
        contractPricingTier: customer.contractPricingTier ?? null,
        taxExempt: customer.taxExempt,
        taxExemptCertificate: customer.taxExemptCertificate ?? null,
        notes: customer.notes ?? null,
        status: nextStatus,
      };
      return customerApi.update(customer.id, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', customer.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setLifecycleConfirm(false);
      showSuccess(customer.status === 'ACTIVE' ? 'Customer deactivated' : 'Customer reactivated');
    },
    onError: (err) => {
      if (handleConcurrentEdit(err, queryClient, ['customers'])) return;
      showError("Couldn't update customer", extractApiError(err) ?? undefined);
    },
  });

  const handleEditEquipment = async (item: EquipmentSummary) => {
    const full = await equipmentApi.getById(item.id);
    setEditingEquipment(full);
    setIsEquipmentOpen(true);
  };

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('customers.tabs.overview') },
    { id: 'locations', label: getName('service_location', true), count: customer.serviceLocations.length },
    { id: 'agreements', label: getName('agreement', true), count: agreementsData?.length },
    { id: 'equipment', label: getName('equipment', true), count: equipmentPage?.totalElements },
    { id: 'jobs', label: getName('work_order', true), count: workOrdersData?.totalElements },
    { id: 'invoices', label: getName('invoice', true), count: invoicesCount?.totalElements },
    { id: 'contacts', label: 'Contacts', count: customer.additionalContacts.length },
    { id: 'activity', label: t('customers.tabs.activity') },
  ];

  const meta: React.ReactNode[] = [];
  if (customer.customerNumber) meta.push(<span key="num" className="font-mono">{customer.customerNumber}</span>);
  // Full billing address (street, city, state, ZIP) sits right after the ID —
  // a multi-site customer is billed centrally, so the bill-to is the headline
  // address, not a metro hint.
  const billing = customer.billingAddress;
  const billingLine = [
    titleCaseAddress(billing.streetAddress),
    [titleCaseAddress(billing.city), billing.state, billing.zipCode].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ');
  if (billingLine) meta.push(<span key="addr">{billingLine}</span>);
  meta.push(
    <span key="locs">
      {t('common.entitiesCount', {
        entities: getName('service_location', true),
        count: customer.serviceLocations.length,
      })}
    </span>,
  );
  if (customer.accountManager) meta.push(<span key="am">Acct mgr {customer.accountManager.name}</span>);
  meta.push(<span key="since">Since {formatDateShort(customer.createdAt)}</span>);

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[1240px]">
          <Link
            to="/customers"
            className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {t('common.actions.backTo', { entities: getName('customer', true) })}
          </Link>

          {/* Header — identity (name/phone/email) edits inline here; attributes in cards */}
          {editingHeader ? (
            <CustomerHeaderEdit customer={customer} onDone={() => setEditingHeader(false)} />
          ) : (
          <div className="mb-3 flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:gap-3.5">
            <OrgMark name={customer.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level={1} size="page-sm" className="m-0">
                  {customer.name}
                </Heading>
                <Pill tone={customer.status === 'ACTIVE' ? 'success' : 'neutral'} dot live={customer.status === 'ACTIVE'}>
                  {customer.status === 'ACTIVE' ? t('common.active') : t('common.inactive')}
                </Pill>
                {customer.paymentTermsDays > 0 && (
                  <Pill tone="neutral">Net {customer.paymentTermsDays}</Pill>
                )}
                <CustomerHeaderTags
                  customerId={customer.id}
                  tags={customer.tags ?? []}
                  canEdit={canEditCustomers}
                />
              </div>
              {(customer.phone || customer.email) && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px]">
                  {customer.phone && (
                    <a
                      href={`tel:${customer.phone.replace(/\D/g, '')}`}
                      className="font-mono text-fg-accent hover:underline"
                    >
                      {formatPhone(customer.phone)}
                    </a>
                  )}
                  {customer.phone && customer.email && <span className="text-fg-dim">·</span>}
                  {customer.email && (
                    <a href={`mailto:${customer.email}`} className="text-fg-accent hover:underline">
                      {customer.email}
                    </a>
                  )}
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-fg-muted">
                {meta.map((node, i) => (
                  <span key={i} className="flex items-center gap-x-2.5">
                    {i > 0 && <span className="text-fg-dim">·</span>}
                    {node}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 max-sm:w-full sm:flex-shrink-0">
              <Button
                outline
                size="xs"
                onClick={() => setIsNewWorkOrderOpen(true)}
                aria-label={t('common.actions.new', { entity: getName('work_order') })}
              >
                <PlusIcon className="size-4" />
                <span className="relative top-[0.5px] hidden sm:inline">
                  {t('common.actions.new', { entity: getName('work_order') })}
                </span>
              </Button>
              <Dropdown>
                <DropdownButton as={IconButton} aria-label={t('common.moreOptions')} className="max-sm:p-2">
                  <EllipsisVerticalIcon className="size-4" />
                </DropdownButton>
                <DropdownMenu anchor="bottom end">
                  <DropdownItem onClick={() => setIsNotificationOpen(true)}>
                    <DropdownLabel>{t('notifications.preferences.manage')}</DropdownLabel>
                  </DropdownItem>
                  {canAddServiceLocations && (
                    <DropdownItem onClick={() => navigate(`/customers/${customer.id}/service-locations/new`)}>
                      <DropdownLabel>{t('common.actions.add', { entity: getName('service_location') })}</DropdownLabel>
                    </DropdownItem>
                  )}
                </DropdownMenu>
              </Dropdown>
              {canEditCustomers && (
                <Button color="accent" size="xs" onClick={() => setEditingHeader(true)} className="max-sm:flex-1">
                  {t('common.edit')}
                </Button>
              )}
            </div>
          </div>
          )}

          <div className="mb-3.5">
            <Tabs value={activeTab} onChange={(id) => setActiveTab(id as TabId)} tabs={tabs} />
          </div>

          {activeTab === 'overview' && (
            <MultiOverviewTab
              customer={customer}
              canEdit={canEditCustomers}
              onViewLocations={() => setActiveTab('locations')}
              onViewAgreements={() => setActiveTab('agreements')}
              onViewContacts={() => setActiveTab('contacts')}
            />
          )}

          {activeTab === 'locations' && (
            <MultiLocationsTab
              customer={customer}
              canAdd={canAddServiceLocations}
              onAdd={() => navigate(`/customers/${customer.id}/service-locations/new`)}
            />
          )}

          {activeTab === 'agreements' && <CustomerAgreementsTab customerId={customer.id} />}

          {activeTab === 'equipment' && (
            <CustomerEquipmentTab
              customerId={customer.id}
              canEdit={canEditCustomers}
              onAdd={() => {
                setEditingEquipment(null);
                setIsEquipmentOpen(true);
              }}
              onEdit={handleEditEquipment}
              onDelete={setDeletingEquipment}
            />
          )}

          {activeTab === 'jobs' && (
            <CustomerWorkOrdersTab
              customerId={customer.id}
              canCreate
              onNewJob={() => setIsNewWorkOrderOpen(true)}
            />
          )}

          {activeTab === 'invoices' && <CustomerInvoicesTab customerId={customer.id} />}

          {activeTab === 'contacts' && (
            <CustomerContactsTab
              customerId={customer.id}
              contacts={customer.additionalContacts}
              queryKey={['customers', customer.id]}
              canEdit={canEditCustomers}
            />
          )}

          {activeTab === 'activity' && <CustomerActivityStream customerId={customer.id} />}

          {/* Lifecycle footer */}
          {canEditCustomers && (
            <div className="mt-3.5">
              <Callout
                kind="neutral"
                icon={null}
                title={customer.status === 'ACTIVE' ? `Deactivate ${customer.name}` : `Reactivate ${customer.name}`}
                action={
                  <Button
                    outline={customer.status === 'ACTIVE' ? 'red' : true}
                    size="xxs"
                    onClick={() => setLifecycleConfirm(true)}
                    disabled={lifecycleMutation.isPending}
                  >
                    {customer.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
                  </Button>
                }
              >
                {customer.status === 'ACTIVE'
                  ? 'Stops new work, estimates and invoices. AR history, locations, equipment and agreements are preserved.'
                  : 'Restores the account. New work, estimates and invoices can be created again.'}
              </Callout>
            </div>
          )}
        </div>
      </div>

      <NotificationPreferencesDialog
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
        customerId={customer.id}
        contactName={customer.name}
      />
      <WorkOrderFormDialog
        isOpen={isNewWorkOrderOpen}
        onClose={() => setIsNewWorkOrderOpen(false)}
        prefilledCustomer={{ id: customer.id, name: customer.name }}
      />
      <EquipmentFormDialog
        isOpen={isEquipmentOpen}
        onClose={() => {
          setIsEquipmentOpen(false);
          setEditingEquipment(null);
        }}
        equipment={editingEquipment}
        lockedCustomer={{ id: customer.id, name: customer.name }}
      />
      <ConfirmDialog
        isOpen={deletingEquipment !== null}
        onClose={() => setDeletingEquipment(null)}
        onConfirm={() => deletingEquipment && deleteEquipmentMutation.mutate(deletingEquipment.id)}
        title={deletingEquipment ? t('common.actions.deleteConfirm', { name: deletingEquipment.name }) : ''}
        message={t('common.actions.deleteWarning', { defaultValue: 'This cannot be undone.' })}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteEquipmentMutation.isPending}
      />
      <ConfirmDialog
        isOpen={lifecycleConfirm}
        onClose={() => setLifecycleConfirm(false)}
        onConfirm={() => lifecycleMutation.mutate()}
        title={
          customer.status === 'ACTIVE'
            ? `Deactivate ${customer.name}?`
            : `Reactivate ${customer.name}?`
        }
        message={
          customer.status === 'ACTIVE'
            ? 'Stops new work, estimates and invoices. AR history, locations, equipment and agreements are preserved.'
            : 'Restores the account. New work, estimates and invoices can be created again.'
        }
        confirmLabel={customer.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        isDestructive={customer.status === 'ACTIVE'}
        isPending={lifecycleMutation.isPending}
      />
    </AppLayout>
  );
}
