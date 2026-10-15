/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), inline glyphs/separators/short operational labels stay literal to match ServiceLocationDetailPage + MultiCustomerDetail. */
// SINGLE customer detail — one wallet + one site. Wears the customer's billing
// identity in the header and INLINES the single location's operational cards in
// the body (no "Locations" tab). The location cards are the SAME components the
// Location detail page uses (shared via components/detail) — build once. The
// customer-level cards (Billing & AR, Account details, Notes) + the Equipment /
// Work Orders tabs are reused from the MULTI work.
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { EllipsisVerticalIcon, PencilSquareIcon, PlusIcon } from '@heroicons/react/24/outline';
import {
  customerApi,
  equipmentApi,
  agreementApi,
  documentsApi,
  invoicesApi,
  EquipmentStatus,
  type Customer,
  type CustomerStatus,
  type EquipmentSummary,
  type UpdateCustomerRequest,
  type PremiseType,
} from '../../api/setup';
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
import { equipmentCreateUrl, equipmentEditUrl } from '../../lib/equipmentCreate';
import NotificationPreferencesDialog from '../NotificationPreferencesDialog';
import LocationFilesTab from '../LocationFilesTab';
import LocationActivityStream from '../LocationActivityStream';
import NotesCard from '../NotesCard';
import CustomerEquipmentTab from './CustomerEquipmentTab';
import CustomerWorkOrdersTab from './CustomerWorkOrdersTab';
import { DocumentsTab, DOCUMENTS_KEY } from '../document/DocumentsTab';
import CustomerAgreementsTab from '../CustomerAgreementsTab';
import CustomerHeaderTags from './CustomerHeaderTags';
import { BillingCard, AccountDetailsCard, CustomerHeaderEdit, AttentionStrip, AgreementsSummaryCard } from './MultiOverviewTab';
import { buildAttentionItems } from './attention';
import { useGoToInvoicesBucket } from './invoiceAgingNav';
import { EquipmentSummaryCard } from '../detail/EquipmentSummaryCard';
import { SiteWorkOrdersCard, SiteInstructionsCard, SiteContactCard, DispatchesTab } from '../detail/locationCards';
import { useLocationDispatchCount, useLocationFilesCount } from '../detail/locationCounts';
import { workOrdersListQueryOptions } from '../../api/setup';
import { OrgMark } from './shared';
import { formatDateShort } from './format';
import { formatPhone, titleCaseAddress } from '@dispatch/utils';

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
          className="bg-transparent p-0 !text-[11px] text-fg-muted hover:text-fg-strong"
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
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [deletingEquipment, setDeletingEquipment] = useState<EquipmentSummary | null>(null);
  const [lifecycleConfirm, setLifecycleConfirm] = useState(false);

  const navigate = useNavigate();
  const routerLocation = useLocation();
  const locId = customer.serviceLocations[0]?.id ?? '';
  // Return here (Equipment tab) after the full-page equipment create/edit.
  const equipmentReturnTo = `${routerLocation.pathname}?tab=equipment`;

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
  // Tab badges. Work orders are the customer's (the same list the tab reads);
  // dispatches and files are the one site's, as those tabs are.
  const { data: workOrdersData } = useQuery(workOrdersListQueryOptions({ customerId: customer.id }));
  const dispatchCount = useLocationDispatchCount(locId || undefined);
  const filesCount = useLocationFilesCount(locId || undefined);
  // Shares the Quotes & invoices tab's counts cache.
  const { data: documentViews } = useQuery({
    queryKey: [DOCUMENTS_KEY, { customerId: customer.id }, 'views'],
    queryFn: () => documentsApi.getViews({ customerId: customer.id }),
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
      showSuccess(`${getName('customer')} ${customer.status === 'ACTIVE' ? 'deactivated' : 'reactivated'}`);
    },
    onError: (err) => {
      if (handleConcurrentEdit(err, queryClient, ['customers'])) return;
      showError(`Couldn't update ${getName('customer').toLowerCase()}`, extractApiError(err) ?? undefined);
    },
  });

  // Add/edit equipment are full pages now; return to this customer's Equipment tab.
  const handleAddEquipment = () =>
    navigate(equipmentCreateUrl({ returnTo: equipmentReturnTo, locationId: locId || undefined }));
  const handleEditEquipment = (item: EquipmentSummary) =>
    navigate(equipmentEditUrl(item.id, equipmentReturnTo));

  const addr = customer.serviceLocations[0]?.address;
  const headerAddress = addr
    ? [titleCaseAddress(addr.streetAddress), [titleCaseAddress(addr.city), addr.state].filter(Boolean).join(', '), addr.zipCode].filter(Boolean).join(', ')
    : null;
  const premise = location?.premiseType ?? customer.serviceLocations[0]?.premiseType;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('customers.tabs.overview') },
    { id: 'equipment', label: getName('equipment', true), count: equipmentPage?.totalElements },
    { id: 'jobs', label: getName('work_order', true), count: workOrdersData?.totalElements },
    { id: 'agreements', label: getName('agreement', true), count: agreements.length },
    { id: 'invoices', label: `${getName('quote', true)} & ${getName('invoice', true).toLowerCase()}`, count: documentViews?.counts.all },
    { id: 'dispatches', label: getName('dispatch', true), count: dispatchCount },
    { id: 'files', label: 'Files', count: filesCount },
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
                onClick={() => navigate(`/work-orders/new?locationId=${locId}`)}
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
              onAdd={handleAddEquipment}
              onEdit={handleEditEquipment}
              onDelete={setDeletingEquipment}
            />
          )}

          {activeTab === 'jobs' && (
            <CustomerWorkOrdersTab customerId={customer.id} canCreate onNewJob={() => navigate(`/work-orders/new?locationId=${locId}`)} />
          )}

          {activeTab === 'agreements' && <CustomerAgreementsTab customerId={customer.id} />}

          {activeTab === 'invoices' && (
            <DocumentsTab
              aging
              scope={{ customerId: customer.id }}
              start={
                customer.serviceLocations[0]
                  ? { location: { ...customer.serviceLocations[0], customerName: customer.name } }
                  : undefined
              }
            />
          )}

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
                  ? `Stops new work, ${getName('quote', true).toLowerCase()} and ${getName('invoice', true).toLowerCase()}. AR history, ${getName('equipment').toLowerCase()}, files and notes are preserved.`
                  : `Restores the account. New work, ${getName('quote', true).toLowerCase()} and ${getName('invoice', true).toLowerCase()} can be created again.`}
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
            ? `Stops new work, ${getName('quote', true).toLowerCase()} and ${getName('invoice', true).toLowerCase()}. AR history, ${getName('equipment').toLowerCase()}, files and notes are preserved.`
            : `Restores the account. New work, ${getName('quote', true).toLowerCase()} and ${getName('invoice', true).toLowerCase()} can be created again.`
        }
        confirmLabel={customer.status === 'ACTIVE' ? 'Deactivate' : 'Reactivate'}
        isDestructive={customer.status === 'ACTIVE'}
        isPending={lifecycleMutation.isPending}
      />
    </AppLayout>
  );
}
