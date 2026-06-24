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
import { EllipsisVerticalIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline';
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
  type PremiseType,
} from '../../api';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { useUrlTab } from '../../hooks/useUrlTab';
import { showSuccess, showError, extractApiError } from '../../lib/toast';
import { handleConcurrentEdit } from '../../lib/conflict';
import AppLayout from '../AppLayout';
import { Heading } from '../catalyst/heading';
import { Button } from '../catalyst/button';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import { Pill } from '../ui/Pill';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { Tabs } from '../ui/Tabs';
import { Callout } from '../ui/Callout';
import { LoadingState } from '../ui/LoadingState';
import IconButton from '../IconButton';
import ConfirmDialog from '../ConfirmDialog';
import WorkOrderFormDialog from '../WorkOrderFormDialog';
import EquipmentFormDialog from '../EquipmentFormDialog';
import NotificationPreferencesDialog from '../NotificationPreferencesDialog';
import LocationFilesTab from '../LocationFilesTab';
import LocationActivityStream from '../LocationActivityStream';
import NotesCard from '../NotesCard';
import CustomerEquipmentTab from './CustomerEquipmentTab';
import CustomerWorkOrdersTab from './CustomerWorkOrdersTab';
import CustomerInvoicesTab from './CustomerInvoicesTab';
import CustomerAgreementsTab from '../CustomerAgreementsTab';
import CustomerHeaderTags from './CustomerHeaderTags';
import { BillingCard, AccountDetailsCard, CustomerHeaderEdit, AttentionStrip, AgreementsSummaryCard } from './MultiOverviewTab';
import { buildAttentionItems } from './attention';
import { useGoToInvoicesBucket } from './invoiceAgingNav';
import { EquipmentSummaryCard } from '../detail/EquipmentSummaryCard';
import { SiteWorkOrdersCard, SiteInstructionsCard, SiteContactCard, DispatchesTab } from '../detail/locationCards';
import { OrgMark } from './shared';
import { formatDateShort } from './format';
import { formatPhone } from '../../utils/formatPhone';
import { titleCaseAddress } from '../../utils/titleCaseAddress';

type TabId = 'overview' | 'equipment' | 'jobs' | 'agreements' | 'invoices' | 'dispatches' | 'files' | 'activity';
const SINGLE_TABS: readonly TabId[] = ['overview', 'equipment', 'jobs', 'agreements', 'invoices', 'dispatches', 'files', 'activity'];

// The single site's premise lives on the customer header as a pill. With edit
// rights it flips to an inline toggle that writes straight through to the
// location (PUT /service-locations/{id}) — premise is a per-location field, and
// this is the one place it's editable from a customer page (customer-add-edit.md).
function PremisePill({
  locationId,
  premise,
  canEdit,
}: {
  locationId: string;
  premise?: PremiseType | null;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const current: PremiseType = premise === 'RESIDENCE' ? 'RESIDENCE' : 'BUSINESS';
  const label = current === 'RESIDENCE' ? 'Residence' : 'Business site';

  const saveMutation = useMutation({
    mutationFn: (next: PremiseType) => customerApi.updateServiceLocation(locationId, { premiseType: next }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-location', locationId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      setEditing(false);
      showSuccess('Premise updated');
    },
    onError: (err) => showError("Couldn't update premise", extractApiError(err) ?? undefined),
  });

  if (!canEdit || !locationId) return <Pill tone="neutral">{label}</Pill>;

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <ToggleGroup
          value={current}
          onChange={(v) => (v === current ? setEditing(false) : saveMutation.mutate(v))}
          aria-label="Premise type"
        >
          <ToggleGroupOption value="BUSINESS">Business</ToggleGroupOption>
          <ToggleGroupOption value="RESIDENCE">Residence</ToggleGroupOption>
        </ToggleGroup>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saveMutation.isPending}
          className="bg-transparent p-0 text-[11px] text-fg-muted hover:text-fg-strong"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} title="Edit premise" className="bg-transparent p-0">
      <Pill tone="neutral">
        <span className="inline-flex items-center gap-1">
          {label}
          <PencilSquareIcon className="size-3 text-fg-dim" />
        </span>
      </Pill>
    </button>
  );
}

export default function SingleCustomerDetail({ customer }: { customer: Customer }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const canEditCustomers = useHasCapability('EDIT_CUSTOMERS');
  const [activeTab, setActiveTab] = useUrlTab(SINGLE_TABS, 'overview');
  const goToBucket = useGoToInvoicesBucket();

  const [editingHeader, setEditingHeader] = useState(false);
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

  // FIN-1 / AG-1 — customer-level rollups, parallel on load. Drive the Billing &
  // AR card, the LTV row, and the attention strip (AR-91+ / overdue-visit /
  // renewal). A single-site customer still has AR + a PM agreement.
  const { data: arSummary } = useQuery({
    queryKey: ['customer-ar-summary', customer.id],
    queryFn: () => invoicesApi.getCustomerArSummary(customer.id),
    enabled: !!customer.id,
  });
  const { data: agreements = [] } = useQuery({
    queryKey: ['agreements', { customerId: customer.id }],
    queryFn: () => agreementApi.list({ customerId: customer.id }),
    enabled: !!customer.id,
  });
  const { data: agreementSummary } = useQuery({
    queryKey: ['agreement-customer-summary', customer.id],
    queryFn: () => agreementApi.getCustomerSummary(customer.id),
    enabled: !!customer.id,
  });
  // INV-1 tab-count badge — lean size:1 page, unfiltered customer total.
  const { data: invoicesCount } = useQuery({
    queryKey: ['invoices', 'customer-count', customer.id],
    queryFn: () => invoicesApi.getAll({ customerId: customer.id, size: 1 }),
    enabled: !!customer.id,
  });
  const attentionItems = buildAttentionItems(agreements, arSummary, agreementSummary, customer.id);

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

  const addr = customer.serviceLocations[0]?.address;
  const headerAddress = addr
    ? [titleCaseAddress(addr.streetAddress), [titleCaseAddress(addr.city), addr.state].filter(Boolean).join(', '), addr.zipCode].filter(Boolean).join(', ')
    : null;
  const premise = location?.premiseType ?? customer.serviceLocations[0]?.premiseType;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('customers.tabs.overview') },
    { id: 'equipment', label: getName('equipment', true), count: equipmentPage?.totalElements },
    { id: 'jobs', label: getName('work_order', true) },
    { id: 'agreements', label: getName('agreement', true), count: agreements.length },
    { id: 'invoices', label: getName('invoice', true), count: invoicesCount?.totalElements },
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
              pill (the one place a premise pill appears on a customer page).
              Identity (name/phone/email) edits inline here; attributes in cards. */}
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
                {customer.paymentTermsDays > 0 && <Pill tone="neutral">Net {customer.paymentTermsDays}</Pill>}
                <PremisePill locationId={locId} premise={premise} canEdit={canEditCustomers} />
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
            <div className="flex flex-col gap-3">
              {attentionItems.length > 0 && <AttentionStrip items={attentionItems} />}
              {locationLoading || !location ? (
                <LoadingState label={t('common.actions.loading', { entities: getName('service_location', true) })} />
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
                  <div className="flex flex-col gap-3">
                    <BillingCard customer={customer} ar={arSummary} canEdit={canEditCustomers} onSelectAging={goToBucket} />
                    <EquipmentSummaryCard equipment={equipment} onViewAll={() => setActiveTab('equipment')} />
                    <SiteWorkOrdersCard location={location} onViewAll={() => setActiveTab('jobs')} />
                    <NotesCard entityType="customer" entityId={customer.id} canEdit={canEditCustomers} />
                  </div>
                  <div className="flex flex-col gap-3">
                    <SiteInstructionsCard location={location} canEdit={canEditCustomers} />
                    <SiteContactCard location={location} canEdit={canEditCustomers} onViewAll={() => setActiveTab('activity')} />
                    <AccountDetailsCard customer={customer} ar={arSummary} canEdit={canEditCustomers} />
                    {/* Recurring revenue rollup — same right-rail card as MULTI. */}
                    <AgreementsSummaryCard agreements={agreements} summary={agreementSummary} onViewAll={() => setActiveTab('agreements')} />
                  </div>
                </div>
              )}
            </div>
          )}

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

          {activeTab === 'agreements' && <CustomerAgreementsTab customerId={customer.id} />}

          {activeTab === 'invoices' && <CustomerInvoicesTab customerId={customer.id} />}

          {activeTab === 'dispatches' &&
            (location ? (
              <DispatchesTab location={location} />
            ) : (
              <LoadingState label={t('common.actions.loading', { entities: getName('dispatch', true) })} />
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
