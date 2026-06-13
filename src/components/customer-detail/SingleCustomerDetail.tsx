/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/separators/short operational labels stay literal to match ServiceLocationDetailPage + MultiCustomerDetail. */
// SINGLE customer detail — one wallet + one site. Wears the customer's billing
// identity in the header and INLINES the single location's operational cards in
// the body (no "Locations" tab). The location cards are the SAME components the
// Location detail page uses (shared via components/detail) — build once. The
// customer-level cards (Billing & AR, Account details, Notes) + the Equipment /
// Work Orders tabs are reused from the MULTI work.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EllipsisVerticalIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  customerApi,
  equipmentApi,
  EquipmentStatus,
  type Customer,
  type CustomerStatus,
  type Equipment,
  type EquipmentSummary,
  type UpdateCustomerRequest,
} from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { useUrlTab } from '../../hooks/useUrlTab';
import { showSuccess, showError, extractApiError } from '../../lib/toast';
import AppLayout from '../AppLayout';
import { Heading } from '../catalyst/heading';
import { Button } from '../catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import { Pill } from '../ui/Pill';
import { Tabs } from '../ui/Tabs';
import { Callout } from '../ui/Callout';
import IconButton from '../IconButton';
import ConfirmDialog from '../ConfirmDialog';
import CustomerFormDialog from '../CustomerFormDialog';
import WorkOrderFormDialog from '../WorkOrderFormDialog';
import EquipmentFormDialog from '../EquipmentFormDialog';
import NotificationPreferencesDialog from '../NotificationPreferencesDialog';
import LocationFilesTab from '../LocationFilesTab';
import LocationActivityStream from '../LocationActivityStream';
import CustomerNotesCard from './CustomerNotesCard';
import CustomerEquipmentTab from './CustomerEquipmentTab';
import CustomerWorkOrdersTab from './CustomerWorkOrdersTab';
import { BillingCard, AccountDetailsCard } from './MultiOverviewTab';
import { EquipmentSummaryCard } from '../detail/EquipmentSummaryCard';
import { SiteWorkOrdersCard, SiteInstructionsCard, SiteContactCard, DispatchesTab } from '../detail/locationCards';
import { OrgMark } from './shared';
import { formatDateShort } from './format';

type TabId = 'overview' | 'equipment' | 'jobs' | 'invoices' | 'dispatches' | 'files' | 'activity';
const SINGLE_TABS: readonly TabId[] = ['overview', 'equipment', 'jobs', 'invoices', 'dispatches', 'files', 'activity'];

export default function SingleCustomerDetail({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const canEditCustomers = useHasCapability('EDIT_CUSTOMERS');
  const [activeTab, setActiveTab] = useUrlTab(SINGLE_TABS, 'overview');

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNewWorkOrderOpen, setIsNewWorkOrderOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isEquipmentOpen, setIsEquipmentOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [deletingEquipment, setDeletingEquipment] = useState<EquipmentSummary | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState(false);

  const locId = customer.serviceLocations[0]?.id ?? '';

  // The single location's full detail — feeds the inlined location cards
  // (Site instructions / Site contact / Work orders / Dispatches), which are the
  // SAME components the Location detail page renders.
  const { data: location, isLoading: locationLoading } = useQuery({
    queryKey: ['service-location', locId],
    queryFn: () => customerApi.getServiceLocationById(locId),
    enabled: !!locId,
  });

  const { data: equipmentPage } = useQuery({
    queryKey: ['equipment', { serviceLocationId: locId }],
    queryFn: () => equipmentApi.list({ serviceLocationId: locId, status: EquipmentStatus.ACTIVE, size: 100 }),
    enabled: !!locId,
  });
  const equipment: EquipmentSummary[] = equipmentPage?.content ?? [];

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: string) => equipmentApi.delete(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', { serviceLocationId: locId }] });
      queryClient.invalidateQueries({ queryKey: ['equipment', { customerId: customer.id }] });
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
    onError: (err) => showError("Couldn't update customer", extractApiError(err) ?? undefined),
  });

  const handleEditEquipment = async (item: EquipmentSummary) => {
    const full = await equipmentApi.getById(item.id);
    setEditingEquipment(full);
    setIsEquipmentOpen(true);
  };

  const addr = customer.serviceLocations[0]?.address;
  const headerAddress = addr
    ? [addr.streetAddress, [addr.city, addr.state].filter(Boolean).join(', '), addr.zipCode].filter(Boolean).join(', ')
    : null;
  const premise = location?.premiseType ?? customer.serviceLocations[0]?.premiseType;
  const premiseLabel = premise === 'RESIDENCE' ? 'Residence' : 'Business site';

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('customers.tabs.overview') },
    { id: 'equipment', label: getName('equipment', true), count: equipmentPage?.totalElements },
    { id: 'jobs', label: getName('work_order', true) },
    { id: 'invoices', label: getName('invoice', true) },
    { id: 'dispatches', label: getName('dispatch', true) },
    { id: 'files', label: 'Files' },
    { id: 'activity', label: t('customers.tabs.activity') },
  ];

  const meta: React.ReactNode[] = [];
  if (customer.customerNumber) meta.push(<span key="num" className="font-mono">{customer.customerNumber}</span>);
  if (headerAddress) meta.push(<span key="addr">{headerAddress}</span>);
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

          {/* Header — customer billing identity, with the single site's premise
              pill (the one place a premise pill appears on a customer page). */}
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
                {customer.paymentTermsDays > 0 && <Pill tone="neutral">Net {customer.paymentTermsDays}</Pill>}
                <Pill tone="neutral">{premiseLabel}</Pill>
              </div>
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
                </DropdownMenu>
              </Dropdown>
              {canEditCustomers && (
                <Button color="accent" size="xs" onClick={() => setIsEditOpen(true)} className="max-sm:flex-1">
                  {t('common.edit')}
                </Button>
              )}
            </div>
          </div>

          <div className="mb-3.5">
            <Tabs value={activeTab} onChange={(id) => setActiveTab(id as TabId)} tabs={tabs} />
          </div>

          {activeTab === 'overview' &&
            (locationLoading || !location ? (
              <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">
                {t('common.actions.loading', { entities: getName('service_location', true) })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
                <div className="flex flex-col gap-3">
                  <BillingCard customer={customer} />
                  <EquipmentSummaryCard equipment={equipment} onViewAll={() => setActiveTab('equipment')} />
                  <SiteWorkOrdersCard location={location} onViewAll={() => setActiveTab('jobs')} />
                  <CustomerNotesCard customerId={customer.id} canEdit={canEditCustomers} />
                </div>
                <div className="flex flex-col gap-3">
                  <SiteInstructionsCard location={location} canEdit={canEditCustomers} />
                  <SiteContactCard location={location} canEdit={canEditCustomers} onViewAll={() => setActiveTab('activity')} />
                  <AccountDetailsCard customer={customer} typeLabel="Single-site" />
                </div>
              </div>
            ))}

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
            <CustomerWorkOrdersTab customerId={customer.id} canCreate onNewJob={() => setIsNewWorkOrderOpen(true)} />
          )}

          {activeTab === 'invoices' && (
            <Callout kind="info">
              {getName('invoice', true)} aren’t available on this page yet — they’ll land with the finance-service summary read.
            </Callout>
          )}

          {activeTab === 'dispatches' &&
            (location ? (
              <DispatchesTab location={location} />
            ) : (
              <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">
                {t('common.actions.loading', { entities: getName('dispatch', true) })}
              </div>
            ))}

          {activeTab === 'files' && locId && <LocationFilesTab locationId={locId} canEdit={canEditCustomers} />}

          {activeTab === 'activity' && locId && <LocationActivityStream serviceLocationId={locId} />}

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
                  ? 'Stops new work, estimates and invoices. AR history, equipment, files and notes are preserved.'
                  : 'Restores the account. New work, estimates and invoices can be created again.'}
              </Callout>
            </div>
          )}
        </div>
      </div>

      <CustomerFormDialog isOpen={isEditOpen} onClose={() => setIsEditOpen(false)} customer={customer} />
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
        lockedServiceLocationId={locId || undefined}
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
        title={customer.status === 'ACTIVE' ? `Deactivate ${customer.name}?` : `Reactivate ${customer.name}?`}
        message={
          customer.status === 'ACTIVE'
            ? 'Stops new work, estimates and invoices. AR history, equipment, files and notes are preserved.'
            : 'Restores the account. New work, estimates and invoices can be created again.'
        }
        confirmLabel={customer.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        isDestructive={customer.status === 'ACTIVE'}
        isPending={lifecycleMutation.isPending}
      />
    </AppLayout>
  );
}
