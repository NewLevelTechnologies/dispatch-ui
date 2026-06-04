/* eslint-disable i18next/no-literal-string -- dense visual detail page; entity names + major strings go through getName()/t(), but inline glyphs, separators, and short operational labels are kept as literals to keep the dense markup readable (same convention as UserDetailPage). */
import type React from 'react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  MapPinIcon,
  BuildingOffice2Icon,
  HomeIcon,
  CalendarDaysIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  WrenchScrewdriverIcon,
  ChartBarIcon,
  UserIcon,
  ReceiptPercentIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PhoneIcon,
  BellIcon,
  TrashIcon,
  StarIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { BellIcon as BellSolidIcon } from '@heroicons/react/24/solid';
import {
  customerApi,
  dispatchRegionApi,
  equipmentApi,
  workOrderApi,
  workOrderTypesApi,
  contactApi,
  notificationApi,
  noteApi,
  arrivalFactApi,
  tagApi,
  dispatchesApi,
  invoicesApi,
  InvoiceStatus,
  type InvoiceListItemRow,
  type InvoiceStatus as InvoiceStatusType,
  type LocationInvoiceSummaryResponse,
  type LocationDispatchResponse,
  type DispatchStatus,
  type OnSiteTech,
  type Tag,
  NotificationChannel,
  type NotificationPreferenceDto,
  type NoteDto,
  type ArrivalFactDto,
  EquipmentStatus,
  type Equipment,
  type EquipmentSummary,
  type ServiceLocationSearchResult,
  type ProgressCategory,
  type WorkOrderPriority,
  type WorkOrderSummary,
  type AdditionalContact,
  type ListEquipmentParams,
  type ListWorkOrdersParams,
} from '../api';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import { type DatePreset, DATE_PRESETS, rangeForPreset } from '../lib/dateRangePresets';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { roleColor } from '../utils/roleColor';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { formatPhone } from '../utils/formatPhone';
import { formatTimestamp, formatExactTimestamp } from '../lib/formatTimestamp';
import { TimeAgo } from '../components/TimeAgo';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { extractApiError, showError, showInfo, showSuccess } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import NotificationLogsList from '../components/NotificationLogsList';
import ServiceLocationContactDialog from '../components/ServiceLocationContactDialog';
import NotificationPreferencesDialog from '../components/NotificationPreferencesDialog';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import ConfirmDialog from '../components/ConfirmDialog';
import NoteDialog from '../components/NoteDialog';
import { AssignedUsersCell } from '../components/ui/AssignedUsersCell';
import TagPicker from '../components/TagPicker';
import { TagPill } from '../components/ui/TagPill';
import { nextTagColor } from '../utils/tagColor';
import IconButton from '../components/IconButton';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Field, Label } from '../components/catalyst/fieldset';
import { Textarea } from '../components/catalyst/textarea';
import { Heading } from '../components/catalyst/heading';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { US_STATES } from '../constants/states';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Pill } from '../components/ui/Pill';
import { Callout } from '../components/ui/Callout';
import { Tabs } from '../components/ui/Tabs';
import type { ServiceLocationDetailDto, PremiseType, UpdateServiceLocationRequest } from '../api/customerApi';
import {
  mockAttention,
  mockActivityFeed,
  type MockTone,
} from './serviceLocationDetailMocks';

type TabId = 'overview' | 'equipment' | 'jobs' | 'invoices' | 'visits' | 'contacts' | 'files' | 'activity';

// ─────────────────────────────────────────────────────────────────────────
// Smart back-link. Up-direction is dynamic — users land here from a work
// order, the parent customer, the Locations list, or search. The linking
// surface writes `?from=…`; we read it back. Default (cold link / refresh) is
// the parent customer. The browser back button is always independent of this.
// ─────────────────────────────────────────────────────────────────────────
function useBackContext(location: ServiceLocationDetailDto): { label: string; href: string } {
  const [params] = useSearchParams();
  const from = (params.get('from') || '').toLowerCase();

  if (from === 'work-order') {
    // Work-order detail resolves by UUID (getById), so the href carries woId;
    // the human-readable WO number rides woNo for the label.
    const woId = params.get('woId');
    const woNo = params.get('woNo');
    if (woId) return { label: woNo || 'Work order', href: `/work-orders/${woId}` };
  }
  if (from === 'locations') {
    // Spec labels this "All locations · {customer}". There's no per-customer
    // locations route yet, so the href stays the global list; the customer
    // name rides the label for context.
    return { label: `All locations · ${location.customerName}`, href: '/service-locations' };
  }
  if (from === 'search') {
    const q = params.get('q');
    return { label: q ? `Search results · “${q}”` : 'Search results', href: '/search' };
  }
  // 'customer' and default both resolve to the parent customer.
  return { label: location.customerName, href: `/customers/${location.customerId}` };
}

export default function ServiceLocationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isEquipmentDialogOpen, setIsEquipmentDialogOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState<Equipment | null>(null);
  const [isNewWorkOrderOpen, setIsNewWorkOrderOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const canEditServiceLocations = useHasCapability('EDIT_SERVICE_LOCATIONS');
  const canCloseServiceLocations = useHasCapability('CLOSE_SERVICE_LOCATIONS');

  const { data: location, isLoading, error } = useQuery({
    queryKey: ['service-location', id],
    queryFn: () => customerApi.getServiceLocationById(id!),
    enabled: !!id,
  });

  const { data: workOrdersData } = useQuery(
    workOrdersListQueryOptions({ serviceLocationId: location?.id ?? '' })
  );

  const { data: equipmentPage } = useQuery({
    queryKey: ['equipment', { serviceLocationId: id }],
    queryFn: () => equipmentApi.list({ serviceLocationId: id!, status: EquipmentStatus.ACTIVE, size: 100 }),
    enabled: !!id,
  });
  const equipment: EquipmentSummary[] = useMemo(() => equipmentPage?.content ?? [], [equipmentPage]);

  // Drives the Invoices tab-count badge; the tab body re-reads the same cache.
  const { data: locationInvoices } = useQuery(locationInvoicesQueryOptions(id ?? ''));
  // Drives the Visits tab-count badge; the tab body re-reads the same cache.
  const { data: locationVisits } = useQuery(locationDispatchesQueryOptions(id ?? ''));

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: string) => equipmentApi.delete(equipmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment', { serviceLocationId: id }] });
      // Equipment-tab filter-chip counts (open-WO / warranty) are separate
      // server-side count queries.
      queryClient.invalidateQueries({ queryKey: ['equipment-count', id] });
      // WO detail + list caches embed workItems[].equipment summaries.
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
    },
    onError: (err) => showError(t('common.form.errorDelete', { entity: getName('equipment') }), extractApiError(err) ?? undefined),
  });

  const handleEditEquipment = async (item: EquipmentSummary) => {
    const full = await equipmentApi.getById(item.id);
    setEditingEquipment(full);
    setIsEquipmentDialogOpen(true);
  };

  const handleDeleteEquipment = (item: EquipmentSummary) => {
    if (window.confirm(t('common.actions.deleteConfirm', { name: item.name }))) {
      deleteEquipmentMutation.mutate(item.id);
    }
  };

  const closeLocationMutation = useMutation({
    mutationFn: () => customerApi.closeServiceLocation(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-location', id] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      showSuccess(t('serviceLocations.actions.closed', { defaultValue: 'Location closed' }));
    },
    onError: (err) => showError(t('common.form.errorUpdate', { entity: getName('service_location') }), extractApiError(err) ?? undefined),
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center text-[12.5px] text-fg-muted">
          {t('common.actions.loading', { entities: getName('service_location', true) })}
        </div>
      </AppLayout>
    );
  }

  if (error || !location) {
    return (
      <AppLayout>
        <div className="p-8">
          <Callout kind="danger">
            {t('common.actions.errorLoadingEntity', { entity: getName('service_location') })}
            {error && `: ${(error as Error).message}`}
          </Callout>
          <Button className="mt-4" onClick={() => navigate('/service-locations')}>
            {t('common.actions.backTo', { entities: getName('service_location', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const headline = location.locationName || location.customerName;
  const contactCount = location.additionalContacts.length + (location.siteContactName ? 1 : 0);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('serviceLocations.tabs.overview') },
    { id: 'equipment', label: getName('equipment', true), count: equipmentPage?.totalElements ?? equipment.length },
    { id: 'jobs', label: getName('work_order', true), count: workOrdersData?.totalElements ?? 0 },
    { id: 'invoices', label: getName('invoice', true), count: locationInvoices?.length },
    { id: 'visits', label: getName('dispatch', true), count: locationVisits?.length },
    { id: 'contacts', label: 'Contacts', count: contactCount },
    { id: 'files', label: 'Files' },
    { id: 'activity', label: t('serviceLocations.tabs.activity') },
  ];

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[1240px]">
          <BackLink location={location} />

          <LocationHeader
            location={location}
            headline={headline}
            onNewJob={() => setIsNewWorkOrderOpen(true)}
            canEdit={canEditServiceLocations}
            onClose={
              canCloseServiceLocations && location.status !== 'CLOSED'
                ? () => setConfirmClose(true)
                : undefined
            }
          />

          <div className="mb-3.5">
            <Tabs value={activeTab} onChange={(tabId) => setActiveTab(tabId as TabId)} tabs={tabs} />
          </div>

          {activeTab === 'overview' && (
            <OverviewTab
              location={location}
              equipment={equipment}
              onViewEquipment={() => setActiveTab('equipment')}
              onViewJobs={() => setActiveTab('jobs')}
              onViewActivity={() => setActiveTab('activity')}
              onViewContacts={() => setActiveTab('contacts')}
              canEdit={canEditServiceLocations}
            />
          )}

          {activeTab === 'equipment' && (
            <EquipmentTab
              serviceLocationId={location.id}
              onAdd={() => {
                setEditingEquipment(null);
                setIsEquipmentDialogOpen(true);
              }}
              onEdit={handleEditEquipment}
              onDelete={handleDeleteEquipment}
            />
          )}

          {activeTab === 'jobs' && (
            <JobsTab location={location} onNewJob={() => setIsNewWorkOrderOpen(true)} />
          )}

          {activeTab === 'invoices' && <InvoicesTab location={location} />}
          {activeTab === 'visits' && <VisitsTab location={location} />}
          {activeTab === 'contacts' && <ContactsTab location={location} canEdit={canEditServiceLocations} />}
          {activeTab === 'files' && <TabStub label="Files" />}

          {activeTab === 'activity' && (
            <Card title={t('serviceLocations.tabs.activity')} padding="none">
              <div className="p-3.5">
                <NotificationLogsList entityType="SERVICE_LOCATION" entityId={location.id} />
              </div>
            </Card>
          )}

          <CloseFooter
            location={location}
            headline={headline}
            onClose={
              canCloseServiceLocations && location.status !== 'CLOSED'
                ? () => setConfirmClose(true)
                : undefined
            }
          />
        </div>
      </div>

      <EquipmentFormDialog
        isOpen={isEquipmentDialogOpen}
        onClose={() => {
          setIsEquipmentDialogOpen(false);
          setEditingEquipment(null);
        }}
        equipment={editingEquipment}
        lockedServiceLocationId={location.id}
      />

      <WorkOrderFormDialog
        isOpen={isNewWorkOrderOpen}
        onClose={() => setIsNewWorkOrderOpen(false)}
        prefilledServiceLocation={
          {
            id: location.id,
            customerId: location.customerId,
            customerName: location.customerName,
            locationName: location.locationName ?? null,
            address: {
              streetAddress: location.address.streetAddress,
              city: location.address.city,
              state: location.address.state,
              zipCode: location.address.zipCode,
            },
            siteContactName: location.siteContactName ?? null,
            siteContactPhone: location.siteContactPhone ?? null,
            status: 'ACTIVE',
          } satisfies ServiceLocationSearchResult
        }
      />

      <ConfirmDialog
        isOpen={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => closeLocationMutation.mutate()}
        title={t('serviceLocations.actions.closeConfirm', { name: headline })}
        message="Stops new jobs at this site. Equipment, visit history, files and notes are preserved. The parent customer is unaffected."
        confirmLabel={t('serviceLocations.actions.close', { defaultValue: 'Close location' })}
        isDestructive
        isPending={closeLocationMutation.isPending}
      />
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Back-link
// ─────────────────────────────────────────────────────────────────────────
function BackLink({ location }: { location: ServiceLocationDetailDto }) {
  const ctx = useBackContext(location);
  return (
    <Link
      to={ctx.href}
      className="mb-2.5 inline-flex max-w-[600px] items-center gap-1 truncate text-[11.5px] text-fg-muted hover:text-fg-strong"
    >
      ← {ctx.label}
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Header card — pin mark, name, status / priority / agreement pills, meta, actions
// ─────────────────────────────────────────────────────────────────────────
function LocationHeader({
  location,
  headline,
  onNewJob,
  canEdit,
  onClose,
}: {
  location: ServiceLocationDetailDto;
  headline: string;
  onNewJob: () => void;
  canEdit?: boolean;
  onClose?: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  // Header "Edit" flips this card into inline-edit mode in place (no modal, no
  // route change) — same inline pattern as the cards below. The edit form
  // covers only the core record (name, address, premise, region); everything
  // else edits in its own card and is intentionally absent here.
  const [editing, setEditing] = useState(false);
  if (editing) {
    return <LocationHeaderEdit location={location} onDone={() => setEditing(false)} />;
  }

  const statusTone: MockTone | 'neutral' =
    location.status === 'ACTIVE' ? 'success' : location.status === 'INACTIVE' ? 'neutral' : 'neutral';
  const statusLabel = t(`serviceLocations.status.${location.status.toLowerCase()}`);

  const street = [location.address.streetAddress, location.address.streetAddressLine2].filter(Boolean).join(' ');
  const stateZip = [location.address.state, location.address.zipCode].filter(Boolean).join(' ');
  const fullAddress = [titleCaseAddress(street), titleCaseAddress(location.address.city), stateZip]
    .filter(Boolean)
    .join(', ');
  const regionLabel = location.region?.abbreviation || location.region?.name || null;

  // Meta items — render only what exists. sq ft / hours / priority are deferred
  // to the Add/Edit Location pass (no writer yet), so they're intentionally absent.
  const meta: React.ReactNode[] = [];
  if (fullAddress) meta.push(<span key="addr">{fullAddress}</span>);
  // Record number follows the address — the address is what a CSR scans for
  // first, so it stays directly under the name. Identifier read as
  // characters → mono.
  if (location.locationNumber) {
    meta.push(<span key="num" className="font-mono">{location.locationNumber}</span>);
  }
  // Abbreviation is a code (read as characters) → mono; full region name is prose → proportional.
  if (regionLabel) meta.push(<span key="region" className={location.region?.abbreviation ? 'font-mono' : undefined}>{regionLabel}</span>);

  return (
    <div className="mb-3 flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:gap-3.5">
      <LocationMark premise={location.premiseType} />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={1} size="page-sm" className="m-0">
            {headline}
          </Heading>
          <Pill tone={statusTone === 'neutral' ? 'neutral' : 'success'} dot live={location.status === 'ACTIVE'}>
            {statusLabel}
          </Pill>
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

      <div className="flex gap-1.5 max-sm:w-full max-sm:[&>*]:flex-1 sm:flex-shrink-0">
        <Button outline size="xs" onClick={onNewJob}>
          <PlusIcon className="size-4" />
          {t('common.actions.new', { entity: getName('work_order') })}
        </Button>
        <Button outline size="xs" onClick={() => showInfo('Visit scheduling isn’t available yet')}>
          Schedule visit
        </Button>
        {(canEdit || onClose) && (
          <Dropdown>
            <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
              <EllipsisVerticalIcon className="size-4" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              {canEdit && (
                <DropdownItem onClick={() => setEditing(true)}>
                  <DropdownLabel>{t('common.edit')}</DropdownLabel>
                </DropdownItem>
              )}
              {onClose && (
                <DropdownItem onClick={onClose}>
                  <DropdownLabel>{t('serviceLocations.actions.close', { defaultValue: 'Close location' })}</DropdownLabel>
                </DropdownItem>
              )}
            </DropdownMenu>
          </Dropdown>
        )}
        {canEdit && (
          <Button color="accent" size="xs" onClick={() => setEditing(true)}>
            {t('common.edit')}
          </Button>
        )}
      </div>
    </div>
  );
}

// Inline edit of the CORE location record only: name, address, premise type,
// and region. Everything else on the page edits in place in its own card
// (site instructions, contacts, tags, notes); the status lifecycle (Close)
// stays a footer/dropdown action with confirmation + side effects — none of
// that belongs here.
//
// Address autocomplete + live USPS re-verification are deferred (no provider
// wired yet), so the address fields are plain inputs and we surface the
// existing validated-address metadata as a read-only badge when present.
function LocationHeaderEdit({
  location,
  onDone,
}: {
  location: ServiceLocationDetailDto;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [name, setName] = useState(location.locationName || '');
  const [premise, setPremise] = useState<PremiseType>(location.premiseType);
  const [streetAddress, setStreetAddress] = useState(location.address.streetAddress);
  const [streetAddressLine2, setStreetAddressLine2] = useState(location.address.streetAddressLine2 || '');
  const [city, setCity] = useState(location.address.city);
  const [state, setState] = useState(location.address.state);
  const [zipCode, setZipCode] = useState(location.address.zipCode);
  const [dispatchRegionId, setDispatchRegionId] = useState(location.dispatchRegionId);

  const { data: activeRegions } = useQuery({
    queryKey: ['dispatch-regions', 'active'],
    queryFn: () => dispatchRegionApi.getAll(false),
  });

  const canSave =
    streetAddress.trim() !== '' && city.trim() !== '' && state.trim() !== '' && zipCode.trim() !== '';

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Partial merge — send only the core fields that changed. `locationName`
      // is always sent (empty clears it; residences often have none).
      const request: UpdateServiceLocationRequest = { locationName: name.trim() || null };
      if (premise !== location.premiseType) request.premiseType = premise;
      if (dispatchRegionId !== location.dispatchRegionId) request.dispatchRegionId = dispatchRegionId;
      await customerApi.updateServiceLocation(location.id, request);

      // Address rides a separate endpoint — only call it when something moved.
      const addressChanged =
        streetAddress !== location.address.streetAddress ||
        streetAddressLine2 !== (location.address.streetAddressLine2 || '') ||
        city !== location.address.city ||
        state !== location.address.state ||
        zipCode !== location.address.zipCode;
      if (addressChanged) {
        await customerApi.updateServiceLocationAddress(location.id, {
          streetAddress,
          streetAddressLine2: streetAddressLine2 || null,
          city,
          state,
          zipCode,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-location', location.id] });
      queryClient.invalidateQueries({ queryKey: ['customers', location.customerId] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      // WO detail/list responses embed the location's name + address + contact,
      // so every cached WO that references this site is stale until refetch.
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      showSuccess('Location updated');
      onDone();
    },
    onError: (err: unknown) => showError('Couldn’t save location', extractApiError(err) ?? undefined),
  });

  const saving = saveMutation.isPending;
  const hasRegions = !!activeRegions && activeRegions.length > 0;

  return (
    <div className="mb-3 rounded-[10px] border border-accent-500/40 bg-bg-elev px-4 py-3.5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13px] font-semibold text-fg-strong">Edit location</span>
        <span className="text-[11.5px] text-fg-muted">· instructions, contacts, tags &amp; notes edit in their own cards below</span>
      </div>

      {/* Name + premise */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
        <Field>
          <Label className="text-xs">
            {t('common.form.locationName')} <span className="font-normal text-fg-dim">· optional for residences</span>
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Headquarters, Retail #047" />
        </Field>
        <Field>
          <Label className="text-xs">Premise</Label>
          <ToggleGroup value={premise} onChange={setPremise} aria-label="Premise type">
            <ToggleGroupOption value="RESIDENCE">Residence</ToggleGroupOption>
            <ToggleGroupOption value="BUSINESS">Business</ToggleGroupOption>
          </ToggleGroup>
        </Field>
      </div>

      {/* Street + apt */}
      <div className="mt-3 grid grid-cols-12 gap-2">
        <Field className="col-span-8">
          <Label className="text-xs">
            {t('common.form.streetAddress')} *
            {location.address.validated && (
              <span className="ml-1.5 font-normal text-success-600">✓ USPS verified</span>
            )}
          </Label>
          <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} required />
        </Field>
        <Field className="col-span-4">
          <Label className="text-xs">{t('common.form.addressLine2')}</Label>
          <Input
            value={streetAddressLine2}
            onChange={(e) => setStreetAddressLine2(e.target.value)}
            placeholder="Apt"
          />
        </Field>
      </div>

      {/* City / state / zip / region */}
      <div className="mt-3 grid grid-cols-12 gap-2">
        <Field className={hasRegions ? 'col-span-4' : 'col-span-6'}>
          <Label className="text-xs">{t('common.form.city')} *</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} required />
        </Field>
        <Field className="col-span-2">
          <Label className="text-xs">{t('common.form.state')} *</Label>
          <Select value={state} onChange={(e) => setState(e.target.value)} required>
            <option value="">{t('common.form.select')}</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field className={hasRegions ? 'col-span-2' : 'col-span-4'}>
          <Label className="text-xs">{t('common.form.zipCode')} *</Label>
          <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} inputMode="numeric" required />
        </Field>
        {hasRegions && (
          <Field className="col-span-4">
            <Label className="text-xs">
              {getName('dispatch')} {t('entities.region')}
            </Label>
            <Select value={dispatchRegionId} onChange={(e) => setDispatchRegionId(e.target.value)}>
              {activeRegions!.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name} ({region.abbreviation})
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="mt-3.5 flex items-center justify-end gap-1.5">
        <Button plain size="xs" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button color="accent" size="xs" onClick={() => saveMutation.mutate()} disabled={!canSave || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </div>
  );
}

// Premise-driven mark — building glyph (blue) for Business, house glyph (green/
// teal) for Residence — same glyph language AND hue as the Locations-list
// PremiseMark, just at a saturated intensity here vs the list's subtle tint.
// One hue map (Business = `info`, Residence = `success`), two intensities. The
// mark carries the premise signal, so there's no separate premise pill; page
// context already says "this is a location", so the mark conveys WHAT KIND of
// place. Decorative gradient + white glyph, dark-mode safe.
function LocationMark({ premise }: { premise: PremiseType }) {
  const business = premise !== 'RESIDENCE';
  const label = business ? 'Business' : 'Residence';
  return (
    <div
      title={label}
      aria-label={label}
      className={`grid size-[52px] shrink-0 place-items-center rounded-[10px] bg-gradient-to-br text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.12)] ${
        business
          ? 'from-info-500 to-[color-mix(in_oklch,var(--info-500)_70%,black)]'
          : 'from-success-500 to-[color-mix(in_oklch,var(--success-500)_70%,black)]'
      }`}
    >
      {business ? (
        <BuildingOffice2Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
      ) : (
        <HomeIcon className="size-6" strokeWidth={1.8} aria-hidden="true" />
      )}
    </div>
  );
}

function CardTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {icon && <span className="text-fg-muted">{icon}</span>}
      {children}
    </span>
  );
}

// Canonical card-header action link — a quiet ~11.5px accent affordance that
// sits under the 13px card title, not as a peer of it. Styled by the unlayered
// `.card-action` component class (components.css); a layered Tailwind text-size
// utility can't override the global body/Preflight font-size on a bare <button>,
// which is why the size lives in CSS, not a `text-[…]` class here. Pass `to` for
// a navigation link, otherwise `onClick` for an action button.
function CardLink({
  children,
  onClick,
  to,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  to?: string;
  className?: string;
}) {
  const cls = className ? `card-action ${className}` : 'card-action';
  if (to) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function TabStub({ label }: { label: string }) {
  return (
    <Card padding="none">
      <div className="px-5 py-14 text-center">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
          Not in this design pass
        </div>
        <div className="text-[14px] font-semibold text-fg-strong">{label}</div>
        <div className="mt-1 text-[12px] text-fg-muted">Coming soon.</div>
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Overview tab
// ─────────────────────────────────────────────────────────────────────────
// Resolved-tech read for the attention strip's on-site row (name/WO/since).
// The work-orders card no longer reads this — per-WO assigned users are
// embedded on the WO search rows (`technicians[]`); this stays only for the
// live on-site detail, which the embedded list doesn't carry.
function locationTechQueryOptions(serviceLocationId: string) {
  return {
    queryKey: ['location-tech', serviceLocationId] as const,
    queryFn: () => dispatchesApi.getLocationTech(serviceLocationId),
    enabled: Boolean(serviceLocationId),
  };
}

// Per-location invoice list (FIN-1). Shared so the parent can read `.length`
// for the tab-count badge and the Invoices tab re-reads the same key — one
// request, two readers (same pattern as workOrdersListQueryOptions).
function locationInvoicesQueryOptions(serviceLocationId: string) {
  return {
    queryKey: ['location-invoices', serviceLocationId] as const,
    queryFn: () => invoicesApi.getByServiceLocation(serviceLocationId),
    enabled: Boolean(serviceLocationId),
  };
}

// Location-scoped visit list (Visits tab). Shared so the parent reads `.length`
// for the tab-count badge and the tab re-reads the same cache. All visits
// (no `when`) — the tab partitions upcoming vs past client-side.
function locationDispatchesQueryOptions(serviceLocationId: string) {
  return {
    queryKey: ['location-dispatches', serviceLocationId] as const,
    queryFn: () => dispatchesApi.listForServiceLocation(serviceLocationId),
    enabled: Boolean(serviceLocationId),
  };
}

// Elapsed time since arrival, compact and rolled up to the two largest units so
// the reader never has to divide ("45m", "2h 14m", "3d 4h"). This is app
// runtime, so the wall clock is fine here.
function formatOnSiteDuration(sinceIso: string): string {
  const start = new Date(sinceIso).getTime();
  if (Number.isNaN(start)) return 'now';
  const mins = Math.max(0, Math.round((Date.now() - start) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) {
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

function OverviewTab({
  location,
  equipment,
  onViewEquipment,
  onViewJobs,
  onViewActivity,
  onViewContacts,
  canEdit,
}: {
  location: ServiceLocationDetailDto;
  equipment: EquipmentSummary[];
  onViewEquipment: () => void;
  onViewJobs: () => void;
  onViewActivity: () => void;
  onViewContacts: () => void;
  canEdit: boolean;
}) {
  const { data: locationTech } = useQuery(locationTechQueryOptions(location.id));
  // Shares the work-orders cache with SiteWorkOrdersCard (same query key → one
  // request). Used to derive the real open / urgent counts for the strip.
  const { data: workOrdersData } = useQuery(workOrdersListQueryOptions({ serviceLocationId: location.id }));
  const woItems = workOrdersData?.content ?? [];
  const openJobs = {
    open: woItems.filter(woIsOpen).length,
    urgent: woItems.filter((wo) => woIsOpen(wo) && wo.priority === 'URGENT').length,
  };
  const attentionItems = buildAttentionItems(location, locationTech?.onSiteTech ?? null, openJobs, onViewJobs);

  return (
    <div className="flex flex-col gap-3">
      {attentionItems.length > 0 && <AttentionStrip items={attentionItems} />}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
        {/* Left rail — operational reality + durable knowledge. Notes are
            promoted here (prose needs the width); Activity is demoted to a
            one-line teaser (the overview is current-state, not a logfile). */}
        <div className="flex flex-col gap-3">
          <EquipmentSummaryCard equipment={equipment} onViewAll={onViewEquipment} />
          <SiteWorkOrdersCard location={location} onViewAll={onViewJobs} />
          <NotesCard location={location} canEdit={canEdit} />
          <ActivityTeaser onViewActivity={onViewActivity} />
        </div>

        {/* Right rail — reference / pre-arrival. Ends at Tags. */}
        <div className="flex flex-col gap-3">
          <SiteInstructionsCard location={location} canEdit={canEdit} />
          <SiteContactCard location={location} canEdit={canEdit} onViewAll={onViewContacts} />
          <ParentCustomerCard location={location} />
          <TagsCard location={location} canEdit={canEdit} />
        </div>
      </div>
    </div>
  );
}

type AttentionItem = {
  key: string;
  severity: 'live' | 'warning';
  title: string;
  sub: string;
  action: string;
  to?: string; // route the action navigates to; falls back to a toast when absent
  onAction?: () => void; // in-page action (e.g. switch tab); takes precedence over `to`
};

// The live-tech row is now REAL — driven by scheduling-service's resolved
// on-site tech (passed in). The open-jobs row's visibility is gated on the real
// location.hasOpenJobs flag, but its count detail is still mockAttention (the
// open-job count lives in work-order-service, not wired here). The PM-overdue
// row remains fully mock (scheduling service not built). Agreement SLA context
// was dropped (no agreement service exists). There is no equipment-flagged rule
// — the redesign removed equipment flagging; a unit's only live state is whether
// it has an open work order, which surfaces in the work-order list.
function buildAttentionItems(
  location: ServiceLocationDetailDto,
  onSiteTech: OnSiteTech | null,
  openJobs: { open: number; urgent: number },
  onViewJobs: () => void,
): AttentionItem[] {
  const a = mockAttention;
  const items: AttentionItem[] = [];

  // The cheap location.techOnSite list flag stays as a quick-check indicator;
  // the rich live row comes from onSiteTech here. Name can lag the user-cache,
  // so fall back rather than blank the row.
  if (onSiteTech) {
    const who = onSiteTech.name ?? 'A technician';
    items.push({
      key: 'live',
      severity: 'live',
      title: `${who} on site · ${onSiteTech.workOrderNumber}`,
      sub: `on site ${formatOnSiteDuration(onSiteTech.since)}`,
      action: 'Open job',
      to: `/work-orders/${onSiteTech.workOrderId}`,
    });
  }
  // Open-jobs row — gated on the authoritative location.hasOpenJobs flag; the
  // open / urgent counts are derived from the work orders already loaded for
  // this location (no extra fetch). URGENT is the strip's escalation bar —
  // HIGH is elevated but not "drop everything," so including it would make the
  // strip noisy. (The row-level priority chip still flags HIGH + URGENT.)
  if (location.hasOpenJobs) {
    const { open, urgent } = openJobs;
    items.push({
      key: 'open-jobs',
      severity: 'warning',
      title: urgent > 0 ? `${urgent} urgent ${urgent === 1 ? 'job' : 'jobs'}` : 'Open jobs at this site',
      sub: open > 0 ? `${open} open at this site` : 'Open work orders',
      action: 'Open jobs',
      onAction: onViewJobs,
    });
  }
  if (a.pmOverdueDays > 0) {
    items.push({
      key: 'pm',
      severity: 'warning',
      title: `PM overdue · ${a.pmOverdueDays} days`,
      sub: `Next quarterly visit was due ${a.pmOverdueDays}d ago`,
      action: 'Schedule',
    });
  }
  const rank = { live: 0, warning: 1 } as const;
  return items.sort((x, y) => rank[x.severity] - rank[y.severity]);
}

function AttentionStrip({ items }: { items: AttentionItem[] }) {
  const navigate = useNavigate();
  return (
    <Card padding="none">
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg">Needs attention</span>
        <span className="rounded bg-bg-active px-1.5 font-mono text-[10.5px] font-semibold text-fg-strong">
          {items.length}
        </span>
      </div>
      <div>
        {items.map((it, i) => (
          <div
            key={it.key}
            className={`relative flex items-center gap-2.5 py-1.5 pl-3 pr-3.5 ${i < items.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <span
              className="absolute inset-y-1.5 left-0 w-[3px] rounded"
              style={{ background: it.severity === 'warning' ? 'var(--warning-500)' : 'var(--info-500)' }}
            />
            <div className="flex grow flex-wrap items-baseline gap-2 leading-normal">
              {it.severity === 'live' && <LivePulse />}
              <span
                className="text-[12.5px] font-semibold"
                style={{ color: it.severity === 'warning' ? 'var(--warning-fg)' : 'var(--fg-strong)' }}
              >
                {it.title}
              </span>
              <span className="text-[11.5px] text-fg-muted">· {it.sub}</span>
            </div>
            <Button
              outline
              size="xxs"
              className="shrink-0"
              onClick={() =>
                it.onAction ? it.onAction() : it.to ? navigate(it.to) : showInfo('Not available yet')
              }
            >
              {it.action}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LivePulse() {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-[color-mix(in_oklch,var(--info-500)_14%,transparent)] px-1.5 text-[10px] font-bold tracking-wider text-info-500">
      <span className="size-1.5 animate-pulse rounded-full bg-info-500" />
      LIVE
    </span>
  );
}

function EquipmentSummaryCard({
  equipment,
  onViewAll,
}: {
  equipment: EquipmentSummary[];
  onViewAll: () => void;
}) {
  const { getName } = useGlossary();

  const byType = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of equipment) {
      const type = e.equipmentTypeName || 'Other';
      acc[type] = (acc[type] || 0) + 1;
    }
    return acc;
  }, [equipment]);

  // Pure inventory rollup — count-by-type + "View all". No per-unit / open-WO
  // line: a location's single open WO (and its equipment) already shows in the
  // Work orders card directly below, so listing it here too was duplication.
  // The equipment↔WO link lives in that card's Equipment column + the tab.
  return (
    <Card
      title={<CardTitle icon={<WrenchScrewdriverIcon className="size-3.5" />}>{getName('equipment', true)}</CardTitle>}
      action={<CardLink onClick={onViewAll}>View all {equipment.length} →</CardLink>}
      padding="none"
    >
      {equipment.length === 0 ? (
        <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
          {getName('equipment', true)} not recorded at this site yet.
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 bg-bg-elev-2 px-3.5 py-2.5">
          {Object.entries(byType).map(([type, n]) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="font-mono text-[12px] font-bold tabular-nums text-fg-strong">{n}</span>
              <span className="text-[11.5px] text-fg-muted">{type}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Status / priority → display maps for the bespoke work-orders table. Kept
// local to this dense page; the shared WorkOrdersList carries its own copies.
const WO_PROGRESS_TONE: Record<ProgressCategory, MockTone> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'info',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};
const WO_PROGRESS_KEY: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};
const WO_PRIORITY_KEY: Record<WorkOrderPriority, string> = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent',
};

function formatWoDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Equipment health derivations over the real EquipmentSummary payload.
// Age: whole years since installDate (null → unknown). Warranty: expired when
// warrantyExpiresAt is in the past; null means never under warranty (not
// "expired"), so it's excluded from the filter and renders as a dash.
function equipmentAgeYears(installDate?: string | null): number | null {
  if (!installDate) return null;
  const then = new Date(installDate).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.floor((Date.now() - then) / (365.25 * 24 * 60 * 60 * 1000)));
}

function isWarrantyExpired(warrantyExpiresAt?: string | null): boolean {
  if (!warrantyExpiresAt) return false;
  const t = new Date(warrantyExpiresAt).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

const woIsOpen = (wo: WorkOrderSummary) =>
  wo.lifecycleState !== 'CANCELLED' &&
  wo.progressCategory !== 'COMPLETED' &&
  wo.progressCategory !== 'CANCELLED';

// One-line job blurb leading the Work-order cell. Prefer the backend-derived
// `summary` (AI blurb for opted-in tenants, else mechanical) — it's already on
// the wire from work-order-service; the dev `WorkOrderSummary` type just hasn't
// caught up (the field declaration lands with the feat/wo-summary-in-list PR),
// so it's read through a narrow cast until then. Falls back to first work item
// + "N more", then the type name.
function deriveJobLabel(wo: WorkOrderSummary, typeName?: string): string {
  const summary = (wo as { summary?: string | null }).summary;
  if (summary) return summary;
  const first = wo.workItems[0]?.description;
  if (!first) return typeName || '—';
  const more = Math.max(0, wo.workItemCount - 1);
  return more > 0 ? `${first} +${more} more` : first;
}

// The site's work-order list — open first, then recent. A bespoke dense table
// (NOT the shared WorkOrdersList): type + elevated-priority chip + AI summary
// fold into the Work-order cell, leading with the summary. The count-led
// Equipment column, relevance-resolved Tech column, and the "Next scheduled"
// header strip are part of the redesign but blocked on backend (WO-1 / WO-2 /
// AG-2); their insertion points are marked below.
function SiteWorkOrdersCard({
  location,
  onViewAll,
}: {
  location: ServiceLocationDetailDto;
  onViewAll: () => void;
}) {
  const { getName } = useGlossary();
  const { t } = useTranslation();

  const { data, isLoading } = useQuery(workOrdersListQueryOptions({ serviceLocationId: location.id }));
  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const safeTypes = Array.isArray(workOrderTypes) ? workOrderTypes : [];

  const items = data?.content ?? [];
  // Open first, then recent — backend already sorts by scheduledDate desc, so a
  // stable partition on open-ness is enough.
  const sorted = [...items].sort((a, b) => Number(woIsOpen(b)) - Number(woIsOpen(a)));
  const openCount = items.filter(woIsOpen).length;
  const recentCount = items.length - openCount;

  return (
    <Card
      title={<CardTitle icon={<ChartBarIcon className="size-3.5" />}>{getName('work_order', true)}</CardTitle>}
      action={
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <>
              <span className="text-[11px] text-fg-muted">
                {openCount} open · {recentCount} recent
              </span>
              <span className="text-fg-dim">·</span>
            </>
          )}
          <CardLink onClick={onViewAll}>View all {data?.totalElements ?? items.length} →</CardLink>
        </div>
      }
      padding="none"
    >
      {/* "Next scheduled" strip folds the former Upcoming-visits card. Blocked
          on AG-2 (forward proactive/agreement visits); renders here, above the
          table, when a future visit beyond the open WOs exists. */}
      {isLoading ? (
        <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
          {t('common.actions.loading', { entities: getName('work_order', true) })}
        </div>
      ) : items.length === 0 ? (
        <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
          {t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-bg-elev-2">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                <th className="px-3.5 py-2 font-semibold">{getName('work_order')}</th>
                <th className="px-3.5 py-2 font-semibold">{getName('equipment')}</th>
                <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.statusHeader')}</th>
                {/* Relevance-resolved assigned users (on-site > next scheduled
                    > last lead), embedded on the WO row — no scheduling merge. */}
                <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.assigned')}</th>
                <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.scheduled')}</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((wo) => (
                <WorkOrderRow
                  key={wo.id}
                  wo={wo}
                  typeName={safeTypes.find((tp) => tp.id === wo.workOrderTypeId)?.name}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function WorkOrderRow({
  wo,
  typeName,
}: {
  wo: WorkOrderSummary;
  typeName?: string;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const priority = wo.priority ?? 'NORMAL';
  const elevated = priority === 'URGENT' || priority === 'HIGH';
  const cancelled = wo.lifecycleState === 'CANCELLED';
  const jobLabel = deriveJobLabel(wo, typeName);
  // Row tint: in-progress reads "live" (info); an unscheduled elevated-priority
  // job is the escalation signal (warning). Cancelled rows stay untinted.
  const tint = cancelled
    ? ''
    : wo.progressCategory === 'IN_PROGRESS'
      ? 'bg-[color-mix(in_oklch,var(--info-500)_6%,var(--bg-elev))]'
      : !wo.scheduledDate && elevated
        ? 'bg-[color-mix(in_oklch,var(--warning-500)_7%,var(--bg-elev))]'
        : '';
  return (
    <tr
      className={`cursor-pointer border-b border-border-soft hover:bg-bg-hover ${tint}`}
      onClick={() => navigate(`/work-orders/${wo.id}`)}
    >
      <td className="px-3.5 py-2">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="font-mono text-[12px] font-bold text-fg-strong">
            {wo.workOrderNumber || `#${wo.id.slice(0, 8)}`}
          </span>
          {typeName && (
            <span className="rounded-[3px] border border-border-soft bg-bg-active px-1.5 text-[10px] font-semibold text-fg-muted">
              {typeName}
            </span>
          )}
          {elevated && (
            <span
              className="rounded-[3px] px-1.5 text-[9.5px] font-bold tracking-wider"
              style={{
                background: 'color-mix(in oklch, var(--danger-500) 14%, transparent)',
                color: 'var(--danger-500)',
              }}
            >
              {t(`workOrders.priority.${WO_PRIORITY_KEY[priority]}`).toUpperCase()}
            </span>
          )}
        </div>
        {/* AI/derived summary as the .bot subline — subordinate to the WO id
            above it (10.5px), but --fg (not dim) since it's real content. */}
        <div className="mt-0.5 max-w-[420px] truncate text-[10.5px] text-fg" title={jobLabel}>
          {jobLabel}
        </div>
      </td>
      {/* Count-led equipment — label is the unit name (1) or "3 units" (>1); a dash
          when nothing is linked. Load-bearing since the summary may not name it.
          Read as words either way → proportional, not mono. */}
      <td className="px-3.5 py-2">
        {wo.equip && wo.equip.count > 0 ? (
          <span className="text-[11px] text-fg-muted">{wo.equip.label}</span>
        ) : (
          <span className="text-[11px] text-fg-dim">—</span>
        )}
      </td>
      <td className="px-3.5 py-2">
        {cancelled ? (
          <Pill tone="neutral">{t('workOrders.actions.cancelledBadge')}</Pill>
        ) : (
          <Pill tone={WO_PROGRESS_TONE[wo.progressCategory]} dot>
            {t(`workOrders.progress.${WO_PROGRESS_KEY[wo.progressCategory]}`)}
          </Pill>
        )}
      </td>
      <td className="px-3.5 py-2">
        <AssignedUsersCell users={wo.technicians} />
      </td>
      <td className="px-3.5 py-2 text-[11.5px] text-fg-muted">{formatWoDate(wo.scheduledDate)}</td>
    </tr>
  );
}

function techInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

const ACTIVITY_GLYPH_STYLE: Record<MockTone, { bg: string; fg: string }> = {
  info: { bg: 'var(--bg-active)', fg: 'var(--fg-muted)' },
  success: { bg: 'color-mix(in oklch, var(--success-500) 14%, transparent)', fg: 'var(--success-500)' },
  warning: { bg: 'color-mix(in oklch, var(--warning-500) 14%, transparent)', fg: 'var(--warning-fg)' },
  accent: { bg: 'color-mix(in oklch, var(--accent-500) 14%, transparent)', fg: 'var(--accent-700)' },
  neutral: { bg: 'var(--bg-active)', fg: 'var(--fg-muted)' },
};

// Activity teaser — the overview answers "what's the state of this site," not
// "what happened over time." Activity is an audit trail, not knowledge, so it's
// demoted to the single latest event one-liner; the full feed lives on the
// Activity tab. (Still mock until a location-scoped operational feed exists.)
// Bounded peek at the operational feed — the 3 most recent events, not the full
// audit log. Activity is mostly disposable, so it doesn't earn a tall scrolling
// card here; the chronological feed lives on the Activity tab. Don't grow this
// past 3. Notes (knowledge) stays the prominent block above it.
function ActivityTeaser({ onViewActivity }: { onViewActivity: () => void }) {
  const recent = mockActivityFeed.slice(0, 3);
  if (recent.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-bg-elev shadow-sm">
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-dim">Recent activity</span>
        <MockBadge />
        <span className="grow" />
        <CardLink onClick={onViewActivity}>View activity →</CardLink>
      </div>
      {recent.map((e, i) => {
        const s = ACTIVITY_GLYPH_STYLE[e.tone];
        return (
          <div
            key={e.at}
            className={`flex items-center gap-2.5 px-3.5 py-1.5 ${i < recent.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <div
              className="flex size-[18px] shrink-0 items-center justify-center rounded text-[11px] font-bold"
              style={{ background: s.bg, color: s.fg }}
            >
              {e.glyph}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
              <span className="text-[12.5px] font-medium text-fg-strong">{e.text}</span>
              <span className="text-[11px] text-fg-dim">· {e.sub}</span>
            </div>
            <span className="shrink-0 text-[11px] text-fg-dim">{formatTimestamp(e.at)}</span>
          </div>
        );
      })}
    </div>
  );
}

// Small "MOCK" badge for cards backed entirely by placeholder data, so reviewers
// can tell at a glance which sections are awaiting a backend.
function MockBadge() {
  return (
    <span
      title="Placeholder data — awaiting backend"
      className="rounded bg-bg-active px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-fg-dim"
    >
      Mock
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Site instructions — the pre-arrival reference card. Two INDEPENDENT editable
// parts: the free-form arrival prose (`accessInstructions`, edited via the
// location update endpoint) and the structured label/value facts (gate code,
// lockbox, parking, …) managed via arrivalFactApi. Editing one never touches
// the other. Only populated rows render; sensitive codes mask by default with a
// reveal toggle since the page may be over-shoulder-visible at a CSR counter.
// ─────────────────────────────────────────────────────────────────────────

// Default label seed for a fresh tenant (suggestedFactLabels empty). The
// backend's tenant-learned list is merged in front of this and wins on dupes.
// Ordered most-common-first — this is the order the typeahead shows on focus
// (before the user types), so the everyday operational facts surface at the top.
const DEFAULT_FACT_LABELS = [
  'Gate code',
  'Lockbox code',
  'Alarm code',
  'Alarm disarm',
  'Parking',
  'Hours',
  'Quiet hours',
  'Key location',
  'Cross street',
  'Floor / suite',
  'Pet on site',
  'Manager on duty',
  'Hazards',
  'Badge',
  'Refrigerant log',
];

// Codes/combos/PINs are security-sensitive — masked by default. The deployed
// fact contract carries no `sensitive` flag, so we derive it from the label.
// Heuristic (not a fixed list) so it also catches "Garage code", "Door pin", …;
// plain labels (Parking, Manager, Cross street) stay unmasked.
const SENSITIVE_LABEL_RE = /\b(code|combo|combination|pin|passcode|password|disarm)\b/i;
function isSensitiveLabel(label: string): boolean {
  return SENSITIVE_LABEL_RE.test(label);
}

function SiteInstructionsCard({ location, canEdit }: { location: ServiceLocationDetailDto; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const factsQueryKey = ['service-location-arrival-facts', location.id];

  // Facts — first paint from the detail payload, then the dedicated endpoint is
  // the live source for add/edit/delete.
  const { data: factsData } = useQuery({
    queryKey: factsQueryKey,
    queryFn: () => arrivalFactApi.listForServiceLocation(location.id),
    enabled: !!location.id,
    initialData: location.arrivalFacts ?? undefined,
  });
  const facts = Array.isArray(factsData) ? factsData : [];

  // Label typeahead seed — tenant-learned (endpoint) ∪ payload seed ∪ defaults,
  // de-duped case-insensitively, learned labels first.
  const { data: learnedLabels } = useQuery({
    queryKey: ['arrival-fact-suggested-labels'],
    queryFn: () => arrivalFactApi.suggestedLabels(),
    staleTime: 5 * 60_000,
  });
  const suggestedLabels = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of [...(learnedLabels ?? []), ...(location.suggestedFactLabels ?? []), ...DEFAULT_FACT_LABELS]) {
      const label = raw.trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
    return out;
  }, [learnedLabels, location.suggestedFactLabels]);

  const [editingNotes, setEditingNotes] = useState(false);
  const [addingFact, setAddingFact] = useState(false);
  const [factToDelete, setFactToDelete] = useState<ArrivalFactDto | null>(null);

  const invalidateFacts = () => {
    queryClient.invalidateQueries({ queryKey: factsQueryKey });
    // The detail payload also carries arrivalFacts (first-paint copy) — refresh.
    queryClient.invalidateQueries({ queryKey: ['service-location', location.id] });
  };

  // Arrival prose lives on the location. The update endpoint is a partial merge
  // (omitted fields preserved — see UpdateServiceLocationRequest), so sending
  // only accessInstructions is safe. Empty clears it (null → block hides).
  const notesMutation = useMutation({
    mutationFn: (value: string) =>
      customerApi.updateServiceLocation(location.id, { accessInstructions: value.trim() || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-location', location.id] });
      setEditingNotes(false);
    },
    onError: (err: unknown) => showError('Couldn’t save arrival notes', extractApiError(err) ?? undefined),
  });

  const createFactMutation = useMutation({
    mutationFn: (vars: { label: string; value: string }) =>
      arrivalFactApi.createForServiceLocation(location.id, {
        label: vars.label,
        value: vars.value,
        mono: isSensitiveLabel(vars.label),
        displayOrder: facts.length,
      }),
    onSuccess: () => {
      invalidateFacts();
      setAddingFact(false);
    },
    onError: (err: unknown) => showError('Couldn’t add field', extractApiError(err) ?? undefined),
  });

  const updateFactMutation = useMutation({
    mutationFn: (vars: { id: string; label: string; value: string }) =>
      arrivalFactApi.update(vars.id, {
        label: vars.label,
        value: vars.value,
        mono: isSensitiveLabel(vars.label),
      }),
    onSuccess: invalidateFacts,
    onError: (err: unknown) => showError('Couldn’t save field', extractApiError(err) ?? undefined),
  });

  const deleteFactMutation = useMutation({
    mutationFn: (factId: string) => arrivalFactApi.delete(factId),
    onSuccess: () => {
      invalidateFacts();
      setFactToDelete(null);
    },
    onError: (err: unknown) => showError('Couldn’t delete field', extractApiError(err) ?? undefined),
  });

  const notes = location.accessInstructions?.trim() ?? '';
  const hasNotes = notes.length > 0;
  const showNotesAdd = canEdit && !hasNotes && !editingNotes;
  const nothingAtAll = !hasNotes && !editingNotes && facts.length === 0 && !addingFact;

  return (
    <Card
      title={<CardTitle icon={<MapPinIcon className="size-3.5" />}>Site instructions</CardTitle>}
      padding="none"
    >
      {/* ── Arrival prose ("Before you arrive") — independent of facts ── */}
      {hasNotes || editingNotes ? (
        <div className="group/notes border-b border-border-soft px-3.5 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Before you arrive</span>
            {canEdit && hasNotes && !editingNotes && (
              <button
                onClick={() => setEditingNotes(true)}
                className="text-[11px] font-medium text-fg-accent opacity-0 transition-opacity hover:underline group-hover/notes:opacity-100 focus-visible:opacity-100"
              >
                Edit
              </button>
            )}
          </div>
          {editingNotes ? (
            <NotesEditor
              initial={notes}
              saving={notesMutation.isPending}
              onCancel={() => setEditingNotes(false)}
              onSave={(value) => notesMutation.mutate(value)}
            />
          ) : (
            <div className="whitespace-pre-wrap text-[12px] leading-relaxed text-fg">{notes}</div>
          )}
        </div>
      ) : showNotesAdd ? (
        <div className="border-b border-border-soft px-3.5 py-2.5">
          <CardLink onClick={() => setEditingNotes(true)}>+ Add notes</CardLink>
        </div>
      ) : null}

      {/* ── Facts (label/value) — independent of the prose ── */}
      {facts.map((fact) => (
        <FactRow
          key={fact.id}
          fact={fact}
          canEdit={canEdit}
          suggestedLabels={suggestedLabels}
          onSave={(vars) => updateFactMutation.mutateAsync(vars)}
          onRequestDelete={(f) =>
            isSensitiveLabel(f.label) ? setFactToDelete(f) : deleteFactMutation.mutate(f.id)
          }
        />
      ))}

      {addingFact && (
        <FactEditor
          addMode
          initialLabel=""
          initialValue=""
          suggestedLabels={suggestedLabels}
          onCancel={() => setAddingFact(false)}
          onSave={(label, value) => createFactMutation.mutateAsync({ label, value })}
        />
      )}

      {/* Footer affordance — present whenever the user can edit. Uses the same
          CardLink treatment as "Edit" / "+ Add" elsewhere so the add affordance
          stays subordinate to the content above it. */}
      {canEdit && !addingFact && (
        <div className="px-3.5 py-2">
          <CardLink onClick={() => setAddingFact(true)}>+ Add field</CardLink>
        </div>
      )}

      {/* Read-only + completely empty — graceful nothing-but-header. */}
      {nothingAtAll && !canEdit && (
        <div className="px-3.5 py-3 text-[12px] text-fg-muted">No site instructions on file.</div>
      )}

      <ConfirmDialog
        isOpen={!!factToDelete}
        onClose={() => setFactToDelete(null)}
        onConfirm={() => factToDelete && deleteFactMutation.mutate(factToDelete.id)}
        title="Delete this field?"
        message={
          factToDelete
            ? `“${factToDelete.label}” holds a sensitive value. Remove it from this location’s arrival info?`
            : ''
        }
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteFactMutation.isPending}
      />
    </Card>
  );
}

// Inline editor for the arrival prose — controlled textarea + Save/Cancel. Empty
// is allowed (clears the block). The parent owns the mutation.
function NotesEditor({
  initial,
  saving,
  onSave,
  onCancel,
}: {
  initial: string;
  saving: boolean;
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <div>
      <Textarea
        autoFocus
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Parking, where to check in, who to ask for, anything a tech should know before arriving…"
      />
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button plain size="xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button color="accent" size="xs" onClick={() => onSave(text)} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// One fact in read mode; flips to an inline FactEditor on Edit. Sensitive values
// mask by default with a reveal toggle. Attribution (who/when) + actions surface
// on hover to keep the resting row dense.
function FactRow({
  fact,
  canEdit,
  suggestedLabels,
  onSave,
  onRequestDelete,
}: {
  fact: ArrivalFactDto;
  canEdit: boolean;
  suggestedLabels: string[];
  onSave: (vars: { id: string; label: string; value: string }) => Promise<unknown>;
  onRequestDelete: (fact: ArrivalFactDto) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);

  if (editing) {
    return (
      <FactEditor
        initialLabel={fact.label}
        initialValue={fact.value}
        suggestedLabels={suggestedLabels}
        onCancel={() => setEditing(false)}
        onSave={async (label, value) => {
          await onSave({ id: fact.id, label, value });
          setEditing(false);
        }}
      />
    );
  }

  const sensitive = isSensitiveLabel(fact.label);
  const masked = sensitive && !revealed;
  const attribution =
    (fact.authorName ? `${fact.authorName} · ` : '') + (formatExactTimestamp(fact.updatedAt) || '');

  return (
    <div className="group/fact flex items-baseline gap-2.5 border-b border-border-soft px-3.5 py-2">
      <span className="w-[84px] shrink-0 text-[10px] font-semibold uppercase leading-tight tracking-wider text-fg-muted sm:w-[96px]">
        {fact.label}
      </span>

      <div className="min-w-0 flex-1">
        <span
          className={[
            'text-[12.5px] text-fg-strong',
            fact.mono ? 'font-mono' : '',
            fact.multiline ? 'block whitespace-pre-wrap' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {/* Fixed-width mask — never leaks the real value length. */}
          {masked ? '••••••' : fact.value}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {sensitive && (
          <button
            onClick={() => setRevealed((r) => !r)}
            title={masked ? 'Reveal' : 'Hide'}
            aria-label={masked ? 'Reveal' : 'Hide'}
            className="text-fg-dim hover:text-fg-strong"
          >
            {masked ? <EyeIcon className="size-3.5" /> : <EyeSlashIcon className="size-3.5" />}
          </button>
        )}
        <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover/fact:opacity-100 focus-within:opacity-100">
          {attribution.trim() && (
            <span className="hidden text-[10.5px] text-fg-muted sm:inline" title={attribution}>
              {formatTimestamp(fact.updatedAt)}
            </span>
          )}
          {canEdit && (
            <>
              <button
                onClick={() => setEditing(true)}
                title={t('common.edit')}
                aria-label={t('common.edit')}
                className="text-fg-dim hover:text-fg-strong"
              >
                <PencilIcon className="size-3.5" />
              </button>
              <button
                onClick={() => onRequestDelete(fact)}
                title={t('common.delete')}
                aria-label={t('common.delete')}
                className="text-fg-dim hover:text-danger-500"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Inline add/edit for a single fact — label combobox + value input. Used both
// for a new draft row (addMode) and editing an existing fact.
function FactEditor({
  initialLabel,
  initialValue,
  suggestedLabels,
  addMode,
  onSave,
  onCancel,
}: {
  initialLabel: string;
  initialValue: string;
  suggestedLabels: string[];
  addMode?: boolean;
  onSave: (label: string, value: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const valid = !!label.trim() && !!value.trim();

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onSave(label.trim(), value.trim());
    } catch {
      // Failure already surfaced via the mutation's onError toast; keep the
      // editor open so the entry isn't lost.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-b border-border-soft bg-bg-elev-2 px-3.5 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="shrink-0 sm:w-[132px]">
          <LabelCombobox
            value={label}
            onChange={setLabel}
            suggestions={suggestedLabels}
            autoFocus={addMode}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Input
            value={value}
            autoFocus={!addMode}
            placeholder="Value"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <Button plain size="xs" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button color="accent" size="xs" onClick={submit} disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}

// Free-text label field with a suggestion dropdown. Any typed text is a valid
// label — the dropdown speeds up reuse of known labels (click/Enter to fill),
// and when the query matches no existing label it offers an explicit
// "Create '{query}'" row so the suggestion set reads as a nudge, not a cage.
function LabelCombobox({
  value,
  onChange,
  suggestions,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  // Filter by the query; the typed text itself is always a valid label, so
  // there's no "create" row — picking a suggestion is just a shortcut. On focus
  // (empty query) show a tidy shortlist of the most-common labels; once the user
  // types, show every match (the query already narrows it, and free-text labels
  // accrete over time so an uncapped on-focus list would get unwieldy).
  const FOCUS_LIMIT = 10;
  const matches = useMemo(() => {
    const filtered = suggestions.filter((s) => {
      const sl = s.toLowerCase();
      return sl !== q && (q === '' || sl.includes(q));
    });
    return q === '' ? filtered.slice(0, FOCUS_LIMIT) : filtered;
  }, [suggestions, q]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const pick = (label: string) => {
    onChange(label);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && open && highlight >= 0 && matches[highlight]) {
      e.preventDefault();
      pick(matches[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <Input
        value={value}
        autoFocus={autoFocus}
        placeholder="Label"
        aria-label="Label"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && matches.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1 w-full overflow-y-auto rounded-md border border-border bg-bg-elev py-1 shadow-lg"
          style={{ maxHeight: 200 }}
        >
          {matches.map((s, i) => (
            <li
              key={s}
              role="option"
              aria-selected={highlight === i}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                // Commit before the input's blur closes the list.
                e.preventDefault();
                pick(s);
              }}
              className={`cursor-pointer px-2.5 py-1.5 text-[12px] text-fg ${highlight === i ? 'bg-bg-hover' : ''}`}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// One contact — the same block for the primary and every additional contact
// (no more ragged "name … email" rows). Name · role on one line; the best-reach
// phone (mobile, else office) is the call action (accent, mono, tel:); email is
// a quieter mailto; after-hours + per-contact notes render only when present. A
// contact with neither phone nor email is flagged rather than shown blank.
// Hover actions are supplied by the card.
function ContactBlock({
  contact,
  primary,
  actions,
}: {
  contact: AdditionalContact;
  primary?: boolean;
  actions?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const phone = contact.mobilePhone || contact.phone || null;
  return (
    <div className="group/contact">
      <div className="flex items-baseline gap-2">
        <div className="flex grow flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className={`font-semibold text-fg-strong ${primary ? 'text-[13px]' : 'text-[12.5px]'}`}>
            {contact.name}
          </span>
          {contact.role && <span className="text-[11px] text-fg-muted">· {contact.role}</span>}
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover/contact:opacity-100 focus-within:opacity-100">
            {actions}
          </div>
        )}
      </div>

      {phone ? (
        <a
          href={`tel:${phone.replace(/\D/g, '')}`}
          className="mt-0.5 inline-flex items-center gap-1 font-mono text-[12.5px] font-semibold text-fg-accent hover:underline"
        >
          <PhoneIcon className="size-3" />
          {formatPhone(phone)}
        </a>
      ) : !contact.email ? (
        <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--warning-fg)' }}>
          {t('contacts.noContactInfo')}
        </div>
      ) : null}

      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="mt-0.5 block truncate text-[11px] text-fg-muted hover:text-fg-strong hover:underline"
        >
          {contact.email}
        </a>
      )}

      {contact.afterHoursPhone && (
        <div className="mt-0.5 font-mono text-[11px] text-fg-muted">
          {formatPhone(contact.afterHoursPhone)} <span className="text-fg-dim">· after hours</span>
        </div>
      )}

      {contact.notes && <div className="mt-1 text-[11px] leading-snug text-fg-muted">{contact.notes}</div>}
    </div>
  );
}

// Shared contact data + mutations for the location. Both the Overview Site
// contact card and the Contacts tab read the same collection (primary-first,
// each isPrimary-flagged) and split client-side — that hands us a real contact
// id for every row, including the primary, which the projected siteContact*
// fields don't carry (needed to PUT the primary on Edit / promote). Make primary
// and delete are one atomic server call each.
function useServiceLocationContacts(location: ServiceLocationDetailDto) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const contactsQueryKey = ['service-location-contacts', location.id];

  const { data } = useQuery({
    queryKey: contactsQueryKey,
    queryFn: () => contactApi.getServiceLocationContacts(location.id),
    enabled: !!location.id,
  });

  const list = Array.isArray(data) ? data : [];
  const primary = list.find((c) => c.isPrimary) ?? null;
  const additional = list.filter((c) => !c.isPrimary);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: contactsQueryKey });
    // The detail payload projects the primary onto siteContact* + lists the
    // rest; refetch so a promote/edit/delete reflects everywhere.
    queryClient.invalidateQueries({ queryKey: ['service-location', location.id] });
  };

  const makePrimaryMutation = useMutation({
    mutationFn: (contactId: string) => contactApi.makeServiceLocationContactPrimary(location.id, contactId),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      showError(t('common.form.errorUpdate', { entity: t('contacts.entity') }), extractApiError(err) ?? undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => contactApi.deleteServiceLocationContact(location.id, contactId),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      showError(t('common.form.errorDelete', { entity: t('contacts.entity') }), extractApiError(err) ?? undefined),
  });

  return { contactsQueryKey, list, primary, additional, makePrimaryMutation, deleteMutation };
}

// Overview Site contact card — preview + common case. Shows the primary plus up
// to CARD_ADDITIONAL_CAP backups; beyond that it caps and links to the Contacts
// tab ("View all N →"), the full directory. Header Edit = edit the primary; per
// additional row = Make primary + Edit + notification bell; Delete lives in the
// dialog (never for the primary).
const CARD_ADDITIONAL_CAP = 2;

function SiteContactCard({
  location,
  canEdit,
  onViewAll,
}: {
  location: ServiceLocationDetailDto;
  canEdit: boolean;
  onViewAll: () => void;
}) {
  const { t } = useTranslation();
  const { contactsQueryKey, list, primary, additional, makePrimaryMutation, deleteMutation } =
    useServiceLocationContacts(location);
  const [contactDialog, setContactDialog] = useState<{ open: boolean; contact: AdditionalContact | null }>({
    open: false,
    contact: null,
  });
  const [contactToDelete, setContactToDelete] = useState<AdditionalContact | null>(null);
  const [notifyContact, setNotifyContact] = useState<AdditionalContact | null>(null);

  const shown = additional.slice(0, CARD_ADDITIONAL_CAP);
  const hiddenCount = additional.length - shown.length;

  // Notification bell — filled when the contact has any alert enabled. Self-
  // fetches its state (cache-shared with the dialog + tab).
  const notifyButton = (c: AdditionalContact) => (
    <NotifBell customerId={location.customerId} contactId={c.id} onClick={() => setNotifyContact(c)} />
  );

  return (
    <Card
      title={<CardTitle icon={<UserIcon className="size-3.5" />}>{t('serviceLocations.detail.siteContact')}</CardTitle>}
      action={
        canEdit && primary ? (
          <CardLink onClick={() => setContactDialog({ open: true, contact: primary })}>{t('common.edit')}</CardLink>
        ) : undefined
      }
      padding="none"
    >
      {/* Primary */}
      <div className="px-3.5 py-3">
        {primary ? (
          <ContactBlock contact={primary} primary actions={canEdit ? notifyButton(primary) : undefined} />
        ) : (
          <div className="flex items-center gap-2 text-[12px] text-fg-muted">
            No site contact on file.
            {canEdit && (
              // .card-action (CardLink) sizing — a bare <button> renders at the
              // global button font-size (unlayered CSS beats Tailwind text-*),
              // which is what made this link oversized vs the row text.
              <CardLink onClick={() => setContactDialog({ open: true, contact: null })}>+ Add</CardLink>
            )}
          </div>
        )}
      </div>

      {/* Additional — same block shape as the primary, divided rows, capped */}
      {(additional.length > 0 || (canEdit && primary)) && (
        <div className="border-t border-border-soft px-3.5 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Additional</div>
            {canEdit && (
              <CardLink onClick={() => setContactDialog({ open: true, contact: null })}>+ Add</CardLink>
            )}
          </div>
          {additional.length === 0 ? (
            <div className="text-[11.5px] italic text-fg-dim">No additional contacts.</div>
          ) : (
            <div className="flex flex-col">
              {shown.map((c) => (
                <div key={c.id} className="border-t border-border-soft py-2.5 first:border-t-0 first:pt-0 last:pb-0">
                  <ContactBlock
                    contact={c}
                    actions={
                      canEdit ? (
                        <>
                          <button
                            onClick={() => makePrimaryMutation.mutate(c.id)}
                            disabled={makePrimaryMutation.isPending}
                            title={t('contacts.makePrimary')}
                            aria-label={t('contacts.makePrimary')}
                            className="text-fg-dim hover:text-fg-strong disabled:opacity-50"
                          >
                            <StarIcon className="size-3.5" />
                          </button>
                          <button
                            onClick={() => setContactDialog({ open: true, contact: c })}
                            aria-label={t('common.edit')}
                            title={t('common.edit')}
                            className="text-fg-dim hover:text-fg-strong"
                          >
                            <PencilIcon className="size-3.5" />
                          </button>
                          {notifyButton(c)}
                        </>
                      ) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
          {/* Beyond the cap, send the rest to the full directory on the tab. */}
          {hiddenCount > 0 && (
            <button
              onClick={onViewAll}
              className="mt-2.5 block w-full border-t border-border-soft pt-2 text-left text-[11px] font-medium text-fg-accent hover:underline"
            >
              {t('contacts.viewAll', { count: list.length })} →
            </button>
          )}
        </div>
      )}

      <ServiceLocationContactDialog
        isOpen={contactDialog.open}
        onClose={() => setContactDialog({ open: false, contact: null })}
        locationId={location.id}
        contact={contactDialog.contact}
        queryKey={contactsQueryKey}
        onRequestDelete={
          contactDialog.contact && !contactDialog.contact.isPrimary
            ? () => {
                const target = contactDialog.contact;
                setContactDialog({ open: false, contact: null });
                setContactToDelete(target);
              }
            : undefined
        }
      />
      <ConfirmDialog
        isOpen={!!contactToDelete}
        onClose={() => setContactToDelete(null)}
        onConfirm={() =>
          contactToDelete &&
          deleteMutation.mutate(contactToDelete.id, { onSuccess: () => setContactToDelete(null) })
        }
        title={t('contacts.delete.title')}
        message={t('contacts.delete.message', { name: contactToDelete?.name || '' })}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />
      <NotificationPreferencesDialog
        isOpen={!!notifyContact}
        onClose={() => setNotifyContact(null)}
        customerId={location.customerId}
        contact={notifyContact}
        contactName={notifyContact?.name || ''}
      />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Contacts tab — the full directory: one row per contact with every reachable
// number side by side + a notification-routing summary the 340px card can't
// show. Primary pinned + badged. Row actions mirror the card (Edit / Make
// primary / Delete / notification bell); add via the same dialog.
// ─────────────────────────────────────────────────────────────────────────

const NOTIFICATION_CHANNEL_LABEL: Record<string, string> = {
  [NotificationChannel.EMAIL]: 'Email',
  [NotificationChannel.SMS]: 'SMS',
  [NotificationChannel.PUSH]: 'Push',
};

// Distinct channels the contact has opted into, in a stable display order.
function enabledChannelSummary(prefs: NotificationPreferenceDto[] | undefined): string | null {
  if (!prefs?.length) return null;
  const order = [NotificationChannel.EMAIL, NotificationChannel.SMS, NotificationChannel.PUSH];
  const on = new Set(prefs.filter((p) => p.optIn).map((p) => p.channel));
  const labels = order.filter((c) => on.has(c)).map((c) => NOTIFICATION_CHANNEL_LABEL[c]);
  return labels.length ? labels.join(' · ') : null;
}

function ContactsTab({ location, canEdit }: { location: ServiceLocationDetailDto; canEdit: boolean }) {
  const { t } = useTranslation();
  const { contactsQueryKey, primary, additional, makePrimaryMutation, deleteMutation } =
    useServiceLocationContacts(location);
  const [contactDialog, setContactDialog] = useState<{ open: boolean; contact: AdditionalContact | null }>({
    open: false,
    contact: null,
  });
  const [contactToDelete, setContactToDelete] = useState<AdditionalContact | null>(null);
  const [notifyContact, setNotifyContact] = useState<AdditionalContact | null>(null);

  // Primary first, then additional in their existing (displayOrder) order.
  const rows = primary ? [primary, ...additional] : additional;

  // Per-contact notification prefs power the Notifications column. One query per
  // contact (keyed to match the dialog so the cache is shared); only runs while
  // this tab is mounted.
  const prefQueries = useQueries({
    queries: rows.map((c) => ({
      queryKey: ['notification-preferences', 'contact', location.customerId, c.id],
      queryFn: () => notificationApi.getContactPreferences(location.customerId, c.id),
      enabled: !!location.customerId,
    })),
  });
  const summaryByContactId = new Map<string, string | null>(
    rows.map((c, i) => [c.id, enabledChannelSummary(prefQueries[i]?.data)])
  );
  const anyOnByContactId = new Map<string, boolean>(
    rows.map((c, i) => [c.id, (prefQueries[i]?.data ?? []).some((p) => p.optIn)])
  );

  return (
    <Card
      title={<CardTitle icon={<UserIcon className="size-3.5" />}>Contacts</CardTitle>}
      action={
        canEdit ? (
          <CardLink onClick={() => setContactDialog({ open: true, contact: null })}>
            <PlusIcon />
            {t('contacts.addContact')}
          </CardLink>
        ) : undefined
      }
      padding="none"
    >
      {rows.length === 0 ? (
        <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">{t('contacts.noContacts')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-bg-elev-2">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                <th className="px-3.5 py-2 font-semibold">{t('common.form.name')}</th>
                <th className="px-3.5 py-2 font-semibold">{t('common.form.role')}</th>
                <th className="px-3.5 py-2 font-semibold">{t('common.form.mobilePhone')}</th>
                <th className="px-3.5 py-2 font-semibold">Office</th>
                <th className="px-3.5 py-2 font-semibold">After hours</th>
                <th className="px-3.5 py-2 font-semibold">{t('common.form.email')}</th>
                <th className="px-3.5 py-2 font-semibold">Notifications</th>
                <th className="px-3.5 py-2 font-semibold">{t('common.form.notes')}</th>
                {canEdit && <th className="px-3.5 py-2 text-right font-semibold">{t('common.actions.title')}</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const summary = summaryByContactId.get(c.id) ?? null;
                return (
                  <tr key={c.id} className="border-b border-border-soft hover:bg-bg-hover">
                    <td className="px-3.5 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-fg-strong">{c.name}</span>
                        {c.isPrimary && <Pill tone="info">Primary</Pill>}
                      </div>
                    </td>
                    <td className="px-3.5 py-2 text-fg-muted">{c.role || <Dash />}</td>
                    <td className="px-3.5 py-2">
                      <PhoneCell value={c.mobilePhone} />
                    </td>
                    <td className="px-3.5 py-2">
                      <PhoneCell value={c.phone} />
                    </td>
                    <td className="px-3.5 py-2">
                      <PhoneCell value={c.afterHoursPhone} />
                    </td>
                    <td className="px-3.5 py-2">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-[11.5px] text-fg-muted hover:text-fg-strong hover:underline"
                        >
                          {c.email}
                        </a>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="px-3.5 py-2">
                      {summary ? (
                        <button
                          onClick={() => setNotifyContact(c)}
                          className="text-fg-muted hover:text-fg-strong hover:underline"
                          title={t('notifications.preferences.tooltip')}
                        >
                          {summary}
                        </button>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td className="max-w-[200px] px-3.5 py-2">
                      {c.notes ? (
                        <span className="block truncate text-fg-muted" title={c.notes}>
                          {c.notes}
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-3.5 py-2">
                        {/* Standard row actions: Edit + Notifications on every row;
                            Make primary + Delete suppressed on the primary (a
                            location must always keep a primary). */}
                        <div className="flex items-center justify-end gap-2 text-fg-dim">
                          <button
                            onClick={() => setContactDialog({ open: true, contact: c })}
                            title={t('common.edit')}
                            className="hover:text-fg-strong"
                          >
                            <PencilIcon className="size-3.5" />
                          </button>
                          <NotifBell
                            customerId={location.customerId}
                            contactId={c.id}
                            active={anyOnByContactId.get(c.id)}
                            onClick={() => setNotifyContact(c)}
                          />
                          {!c.isPrimary && (
                            <button
                              onClick={() => makePrimaryMutation.mutate(c.id)}
                              disabled={makePrimaryMutation.isPending}
                              title={t('contacts.makePrimary')}
                              className="hover:text-fg-strong disabled:opacity-50"
                            >
                              <StarIcon className="size-3.5" />
                            </button>
                          )}
                          {!c.isPrimary && (
                            <button
                              onClick={() => setContactToDelete(c)}
                              title={t('common.delete')}
                              className="hover:text-danger-500"
                            >
                              <TrashIcon className="size-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ServiceLocationContactDialog
        isOpen={contactDialog.open}
        onClose={() => setContactDialog({ open: false, contact: null })}
        locationId={location.id}
        contact={contactDialog.contact}
        queryKey={contactsQueryKey}
        onRequestDelete={
          contactDialog.contact && !contactDialog.contact.isPrimary
            ? () => {
                const target = contactDialog.contact;
                setContactDialog({ open: false, contact: null });
                setContactToDelete(target);
              }
            : undefined
        }
      />
      <ConfirmDialog
        isOpen={!!contactToDelete}
        onClose={() => setContactToDelete(null)}
        onConfirm={() =>
          contactToDelete &&
          deleteMutation.mutate(contactToDelete.id, { onSuccess: () => setContactToDelete(null) })
        }
        title={t('contacts.delete.title')}
        message={t('contacts.delete.message', { name: contactToDelete?.name || '' })}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />
      <NotificationPreferencesDialog
        isOpen={!!notifyContact}
        onClose={() => setNotifyContact(null)}
        customerId={location.customerId}
        contact={notifyContact}
        contactName={notifyContact?.name || ''}
      />
    </Card>
  );
}

// Muted em-dash for empty table cells.
function Dash() {
  return <span className="text-fg-dim">—</span>;
}

// A phone value as a tel: link (mono), or a dash when absent.
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

// Per-contact notification bell. Filled/accent when the contact has any alert
// enabled, outline/muted when none — so you can see at a glance who's wired up.
// `active` lets a caller that already has the prefs (the Contacts tab) pass the
// state in; otherwise the bell fetches its own (cache-shared with the dialog).
function NotifBell({
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

// Whole-dollar formatter for the Billed-to glance figures — these are summary
// balances, not invoice lines, so cents only add noise. Amounts arrive as
// decimal dollars (matching financial-service elsewhere).
const balanceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function ParentCustomerCard({ location }: { location: ServiceLocationDetailDto }) {
  // REAL — customer billing context rides the detail payload. The two-up
  // balance block consumes the FIN-2 financial-service reads
  // (customerOutstandingBalance + this site's open-invoice total/count); it
  // renders only once finance ships those fields and stays hidden until then.
  // Agreement coverage below is MOCKED — there's no agreement service yet, but
  // one is planned, so the line is kept and stubbed rather than cut.
  const { getName } = useGlossary();
  const termsDays = location.customerPaymentTermsDays;

  const customerBalance = location.customerOutstandingBalance;
  const siteOpenAmount = location.openInvoiceAmount;
  const siteOpenCount = location.openInvoiceCount ?? 0;
  const hasFinance =
    typeof customerBalance === 'number' || typeof siteOpenAmount === 'number';

  // MOCK — drop this stub once the agreements feature ships and rides the payload.
  const agreement = { id: 'SA-018', name: 'Critical equipment monitoring', sla: '2h response · 4h on-site' };

  return (
    <Card
      title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>Billed to</CardTitle>}
      action={<CardLink to={`/customers/${location.customerId}`}>Open customer →</CardLink>}
    >
      <div className="text-[13px] font-semibold text-fg-strong">{location.customerName}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {location.customerStatus && (
          <Pill tone={location.customerStatus === 'ACTIVE' ? 'success' : 'neutral'} dot>
            {location.customerStatus === 'ACTIVE' ? 'Active' : 'Inactive'}
          </Pill>
        )}
        {typeof termsDays === 'number' && <Pill tone="neutral">Net {termsDays}</Pill>}
      </div>

      {hasFinance && (
        <div className="mt-2.5 grid grid-cols-2 gap-3 border-t border-border-soft pt-2.5">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">Customer balance</div>
            <div className="mt-0.5 font-mono text-[13px] font-bold tabular-nums text-fg-strong">
              {typeof customerBalance === 'number' ? balanceFormatter.format(customerBalance) : '—'}
            </div>
            <div className="text-[10.5px] text-fg-muted">across all locations</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">This site</div>
            <div
              className={`mt-0.5 font-mono text-[13px] font-bold tabular-nums ${
                siteOpenAmount ? 'text-info-500' : 'text-fg-muted'
              }`}
            >
              {siteOpenAmount ? balanceFormatter.format(siteOpenAmount) : '—'}
            </div>
            <div className="text-[10.5px] text-fg-muted">
              {siteOpenCount} open {getName('invoice', siteOpenCount !== 1).toLowerCase()}
            </div>
          </div>
        </div>
      )}

      {/* MOCK agreement coverage — kept pending the agreements feature. */}
      <div className="mt-2 border-t border-dashed border-border-soft pt-2 text-[11.5px] text-fg-muted">
        Agreement <span className="font-mono text-fg-strong">{agreement.id}</span> covers this site
        <br />
        <span className="text-fg">{agreement.name}</span> · {agreement.sla}
      </div>
    </Card>
  );
}

function TagsCard({ location, canEdit }: { location: ServiceLocationDetailDto; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [picking, setPicking] = useState(false);

  const tags = location.tags ?? [];
  const tagIds = tags.map((tag) => tag.id);

  const invalidate = () => {
    // Tags ride along on both the detail payload and the list rows.
    queryClient.invalidateQueries({ queryKey: ['service-location', location.id] });
    queryClient.invalidateQueries({ queryKey: ['service-locations'] });
  };

  // Apply is a full idempotent sync — send the complete desired id set.
  const applyMutation = useMutation({
    mutationFn: (nextIds: string[]) => tagApi.setForServiceLocation(location.id, nextIds),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      showError(t('tags.errorApply'), extractApiError(err) ?? undefined),
  });

  const removeMutation = useMutation({
    mutationFn: (tagId: string) => tagApi.removeFromServiceLocation(location.id, tagId),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      showError(t('tags.errorRemove'), extractApiError(err) ?? undefined),
  });

  // Create-and-apply: POST the new tag, then sync it onto this location and
  // refresh the tenant library so it shows in future pickers.
  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const created = await tagApi.create({ name, color: nextTagColor(tags.length) });
      await tagApi.setForServiceLocation(location.id, [...tagIds, created.id]);
      return created;
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
    onError: (err: unknown) =>
      showError(t('tags.errorCreate'), extractApiError(err) ?? undefined),
  });

  const busy = applyMutation.isPending || createMutation.isPending;

  const handleApply = (tag: Tag) => {
    applyMutation.mutate([...tagIds, tag.id]);
    setPicking(false);
  };
  const handleCreate = (name: string) => {
    createMutation.mutate(name);
    setPicking(false);
  };

  return (
    <Card
      title={<CardTitle>{t('tags.title')}</CardTitle>}
      action={
        canEdit && !picking ? <CardLink onClick={() => setPicking(true)}>+ Add</CardLink> : undefined
      }
    >
      {tags.length === 0 && !picking ? (
        <div className="text-[12px] text-fg-muted">{t('tags.empty')}</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <TagPill
              key={tag.id}
              color={tag.color}
              name={tag.name}
              onRemove={canEdit ? () => removeMutation.mutate(tag.id) : undefined}
              removeLabel={t('tags.remove', { name: tag.name })}
            />
          ))}
        </div>
      )}

      {picking && (
        <div className="mt-2">
          <TagPicker
            appliedTagIds={tagIds}
            onApply={handleApply}
            onCreate={handleCreate}
            onClose={() => setPicking(false)}
            canCreate={canEdit}
            busy={busy}
          />
        </div>
      )}
    </Card>
  );
}

// Thumbtack glyph — heroicons has no pushpin. `solid` fills it for the
// "pinned" affordance (active state); outline is the "Pin" action.
function PinIcon({ className, solid }: { className?: string; solid?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={solid ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M9 4h6M9.5 4l-.5 6L6.5 13h11L15 10l-.5-6M12 13v7" />
    </svg>
  );
}

// Notes — durable site knowledge (roof access, billing quirks, equipment
// history). Pinned-first ("must-know" amber treatment); the rest reverse-chron.
// Ordering is server-side; the detail payload seeds first paint, then the
// /notes endpoint is the live source for add/edit/pin/delete.
function NotesCard({ location, canEdit }: { location: ServiceLocationDetailDto; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const notesQueryKey = ['service-location-notes', location.id];

  const { data } = useQuery({
    queryKey: notesQueryKey,
    queryFn: () => noteApi.listForServiceLocation(location.id),
    enabled: !!location.id,
    // First paint from the detail payload (same data, already pinned-first).
    initialData: location.notes ?? undefined,
  });
  const notes = Array.isArray(data) ? data : [];
  const pinnedCount = notes.filter((n) => n.pinned).length;

  const [dialog, setDialog] = useState<{ open: boolean; note: NoteDto | null }>({ open: false, note: null });
  const [noteToDelete, setNoteToDelete] = useState<NoteDto | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: notesQueryKey });
    // The detail payload also carries notes (first-paint copy) — refresh it.
    queryClient.invalidateQueries({ queryKey: ['service-location', location.id] });
  };

  const createMutation = useMutation({
    mutationFn: (vars: { body: string; pinned: boolean }) => noteApi.createForServiceLocation(location.id, vars),
    onSuccess: () => {
      invalidate();
      setDialog({ open: false, note: null });
    },
    onError: (err: unknown) =>
      showError(t('common.form.errorCreate', { entity: t('notes.entity') }), extractApiError(err) ?? undefined),
  });

  const editMutation = useMutation({
    mutationFn: (vars: { id: string; body: string; pinned: boolean }) =>
      noteApi.update(vars.id, { body: vars.body, pinned: vars.pinned }),
    onSuccess: () => {
      invalidate();
      setDialog({ open: false, note: null });
    },
    onError: (err: unknown) =>
      showError(t('common.form.errorUpdate', { entity: t('notes.entity') }), extractApiError(err) ?? undefined),
  });

  // Pin/unpin is a partial PATCH (pinned only) — separate from the dialog so a
  // row toggle doesn't tie up the dialog's saving state.
  const pinMutation = useMutation({
    mutationFn: (note: NoteDto) => noteApi.update(note.id, { pinned: !note.pinned }),
    onSuccess: invalidate,
    onError: (err: unknown) =>
      showError(t('common.form.errorUpdate', { entity: t('notes.entity') }), extractApiError(err) ?? undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => noteApi.delete(id),
    onSuccess: () => {
      invalidate();
      setNoteToDelete(null);
    },
    onError: (err: unknown) =>
      showError(t('common.form.errorDelete', { entity: t('notes.entity') }), extractApiError(err) ?? undefined),
  });

  const handleSave = (values: { body: string; pinned: boolean }) => {
    if (dialog.note) editMutation.mutate({ id: dialog.note.id, ...values });
    else createMutation.mutate(values);
  };

  return (
    <Card
      title={
        <CardTitle>
          {t('notes.title')}
          {pinnedCount > 0 && (
            <span className="text-[10px] font-medium text-fg-muted">
              · {t('notes.pinnedCount', { count: pinnedCount })}
            </span>
          )}
        </CardTitle>
      }
      action={
        canEdit ? <CardLink onClick={() => setDialog({ open: true, note: null })}>+ Add</CardLink> : undefined
      }
      padding="none"
    >
      {/* Card body — 12px pad, 9px between note blocks (matches the design mock). */}
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {notes.length === 0 ? (
          <div className="text-[12px] text-fg-muted">{t('notes.empty')}</div>
        ) : (
          notes.map((note) => {
            // Meta line reads "[Pinned ·] {author} · {time} · edited" — one dim
            // run, with the pinned glyph + prefix leading in the amber hue and
            // the timestamp carrying its own exact-time hover via <TimeAgo>.
            const edited = !!note.updatedAt && note.updatedAt !== note.createdAt;
            return (
              <div
                key={note.id}
                className="group/note"
                style={{
                  position: 'relative',
                  padding: '9px 11px',
                  borderRadius: 'var(--r-sm)',
                  // Inline var() styles (not utility classes): a width-only
                  // border has no rendered style under Tailwind v4, so the rail
                  // would vanish. The mock uses the same inline treatment.
                  background: note.pinned
                    ? 'color-mix(in oklch, var(--warning-500) 9%, var(--bg-elev))'
                    : 'var(--bg-elev-2)',
                  borderLeft: '3px solid ' + (note.pinned ? 'var(--warning-500)' : 'var(--border-strong)'),
                }}
              >
                {/* Body — content, full --fg, line breaks preserved. */}
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: 'var(--fg)',
                    whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere',
                    paddingRight: canEdit ? 52 : 0,
                  }}
                >
                  {note.body}
                </div>

                {/* Meta — author · time · (edited); pinned leads with the glyph. */}
                <div
                  style={{
                    marginTop: 3,
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 4,
                    fontSize: 10.5,
                    color: 'var(--fg-dim)',
                  }}
                >
                  {note.pinned && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                        fontWeight: 600,
                        color: 'var(--warning-fg)',
                      }}
                    >
                      <PinIcon className="size-3" solid />
                      {t('notes.pinnedPrefix')} ·
                    </span>
                  )}
                  {note.authorName && <span>{note.authorName}</span>}
                  {note.authorName && <span aria-hidden>·</span>}
                  <TimeAgo iso={note.createdAt} />
                  {edited && <span aria-hidden>·</span>}
                  {edited && <span>{t('notes.edited')}</span>}
                </div>

                {/* Hover actions — float top-right, same idiom as the contact rows. */}
                {canEdit && (
                  <div
                    className="opacity-0 transition-opacity group-hover/note:opacity-100 focus-within:opacity-100"
                    style={{ position: 'absolute', top: 7, right: 9, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <button
                      onClick={() => pinMutation.mutate(note)}
                      disabled={pinMutation.isPending}
                      title={note.pinned ? t('notes.actions.unpin') : t('notes.actions.pin')}
                      aria-label={note.pinned ? t('notes.actions.unpin') : t('notes.actions.pin')}
                      className={`disabled:opacity-50 ${note.pinned ? 'text-[var(--warning-fg)] hover:opacity-80' : 'text-fg-dim hover:text-fg-strong'}`}
                    >
                      <PinIcon className="size-3.5" solid={note.pinned} />
                    </button>
                    <button
                      onClick={() => setDialog({ open: true, note })}
                      aria-label={t('common.edit')}
                      title={t('common.edit')}
                      className="text-fg-dim hover:text-fg-strong"
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                    <button
                      onClick={() => setNoteToDelete(note)}
                      aria-label={t('common.delete')}
                      title={t('common.delete')}
                      className="text-fg-dim hover:text-danger-500"
                    >
                      <TrashIcon className="size-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <NoteDialog
        isOpen={dialog.open}
        onClose={() => setDialog({ open: false, note: null })}
        note={dialog.note}
        onSave={handleSave}
        saving={createMutation.isPending || editMutation.isPending}
      />
      <ConfirmDialog
        isOpen={!!noteToDelete}
        onClose={() => setNoteToDelete(null)}
        onConfirm={() => noteToDelete && deleteMutation.mutate(noteToDelete.id)}
        title={t('notes.delete.title')}
        message={t('notes.delete.message')}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Equipment tab — search + filter chips → grouped dense table → footer.
// Search and both filter chips are applied SERVER-SIDE (the list endpoint backs
// search + warrantyExpired + hasOpenWorkOrder), so pagination and counts stay
// correct. Health columns read off the real EquipmentSummary; Capacity is
// omitted (no capture path) and Next PM is a dash (no source yet).
// ─────────────────────────────────────────────────────────────────────────
type EquipFilter = 'open-wo' | 'warranty' | null;

function EquipmentTab({
  serviceLocationId,
  onAdd,
  onEdit,
  onDelete,
}: {
  serviceLocationId: string;
  onAdd: () => void;
  onEdit: (item: EquipmentSummary) => void;
  onDelete: (item: EquipmentSummary) => void;
}) {
  const { getName } = useGlossary();
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<EquipFilter>(null);
  // Defer the search input so we don't fire a request per keystroke (same
  // pattern as the global Equipment page).
  const deferredSearch = useDeferredValue(q.trim());

  const listParams: ListEquipmentParams = {
    serviceLocationId,
    status: EquipmentStatus.ACTIVE,
    search: deferredSearch || undefined,
    warrantyExpired: filter === 'warranty' ? true : undefined,
    hasOpenWorkOrder: filter === 'open-wo' ? true : undefined,
    size: 100,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['equipment', listParams],
    queryFn: () => equipmentApi.list(listParams),
    enabled: !!serviceLocationId,
  });
  const rows = useMemo(() => data?.content ?? [], [data]);
  const total = data?.totalElements ?? 0;

  // Chip counts come from the server (size:1 → totalElements) so they survive
  // pagination. Independent of search and of the other chip.
  const { data: openWoCount } = useQuery({
    queryKey: ['equipment-count', serviceLocationId, 'open-wo'],
    queryFn: () =>
      equipmentApi
        .list({ serviceLocationId, status: EquipmentStatus.ACTIVE, hasOpenWorkOrder: true, size: 1 })
        .then((p) => p.totalElements),
    enabled: !!serviceLocationId,
  });
  const { data: warrantyCount } = useQuery({
    queryKey: ['equipment-count', serviceLocationId, 'warranty'],
    queryFn: () =>
      equipmentApi
        .list({ serviceLocationId, status: EquipmentStatus.ACTIVE, warrantyExpired: true, size: 1 })
        .then((p) => p.totalElements),
    enabled: !!serviceLocationId,
  });

  const grouped = useMemo(() => {
    const acc: Record<string, EquipmentSummary[]> = {};
    for (const e of rows) {
      const type = e.equipmentTypeName || 'Other';
      (acc[type] = acc[type] || []).push(e);
    }
    return acc;
  }, [rows]);

  const hasFilters = !!deferredSearch || filter !== null;
  const chips: { id: Exclude<EquipFilter, null>; label: string; count: number }[] = [
    { id: 'open-wo', label: 'Open work order', count: openWoCount ?? 0 },
    { id: 'warranty', label: 'Warranty expired', count: warrantyCount ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[220px] max-w-[360px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by ID, make, model, serial…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {q && (
            <button onClick={() => setQ('')} className="px-1 text-[11px] text-fg-dim hover:text-fg-strong">
              ×
            </button>
          )}
        </div>

        {chips.map((c) => {
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setFilter(active ? null : c.id)}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium ${
                active
                  ? 'border-[color-mix(in_oklch,var(--accent-500)_45%,var(--border))] bg-[color-mix(in_oklch,var(--accent-500)_9%,var(--bg-elev))] text-fg-accent'
                  : 'border-border bg-bg-elev text-fg'
              }`}
            >
              {c.label}
              <span
                className={`rounded px-1.5 font-mono text-[10.5px] font-semibold tabular-nums ${active ? 'bg-[color-mix(in_oklch,var(--accent-500)_18%,var(--bg-elev))] text-fg-accent' : 'bg-bg-active text-fg-dim'}`}
              >
                {c.count}
              </span>
            </button>
          );
        })}

        {filter && (
          <Button plain size="xs" onClick={() => setFilter(null)}>
            Clear
          </Button>
        )}

        <span className="grow" />
        <Button color="accent" size="xs" onClick={onAdd}>
          <PlusIcon className="size-4" />
          {t('common.actions.add', { entity: getName('equipment') })}
        </Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-bg-elev-2">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                {/* Capacity column omitted — it lives in attributes.capacity
                    and nothing captures it yet, so it'd be empty for every row.
                    Restore it once there's a capture path. */}
                <th className="px-3.5 py-2 font-semibold">{getName('equipment')}</th>
                <th className="px-3.5 py-2 font-semibold">Make / Model</th>
                <th className="px-3.5 py-2 font-semibold">Location on site</th>
                <th className="px-3.5 py-2 text-right font-semibold">Age</th>
                <th className="px-3.5 py-2 font-semibold">Last service</th>
                <th className="px-3.5 py-2 font-semibold">Next PM</th>
                <th className="px-3.5 py-2 font-semibold">Warranty</th>
                <th className="px-3.5 py-2 font-semibold">Status</th>
                <th className="w-9 px-3.5 py-2" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-[12px] text-fg-muted">
                    {t('common.actions.loading', { entities: getName('equipment', true) })}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center">
                    <div className="text-[13px] font-semibold text-fg-strong">
                      {hasFilters
                        ? 'No equipment matches'
                        : t('common.actions.noEntitiesYet', { entities: getName('equipment', true) })}
                    </div>
                    <div className="mt-1 text-[12px] text-fg-muted">
                      {hasFilters ? 'Adjust your search or clear filters.' : 'Add equipment to get started.'}
                    </div>
                  </td>
                </tr>
              ) : (
                Object.entries(grouped).flatMap(([type, items]) => [
                  <tr key={`h-${type}`}>
                    <td colSpan={9} className="border-y border-border-soft bg-bg-elev-2 px-3.5 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-strong">{type}</span>
                      <span className="ml-2 font-mono text-[10.5px] tabular-nums text-fg-muted">{items.length}</span>
                    </td>
                  </tr>,
                  ...items.map((e) => (
                    <EquipmentRow key={e.id} e={e} onEdit={onEdit} onDelete={onDelete} />
                  )),
                ])
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center border-t border-border-soft bg-bg-elev-2 px-4 py-2.5 text-[11.5px] text-fg-muted">
          <span>
            Showing <strong className="text-fg-strong">{rows.length}</strong> of {total}
          </span>
        </div>
      </Card>
    </div>
  );
}

function EquipmentRow({
  e,
  onEdit,
  onDelete,
}: {
  e: EquipmentSummary;
  onEdit: (item: EquipmentSummary) => void;
  onDelete: (item: EquipmentSummary) => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const age = equipmentAgeYears(e.installDate);
  const warrantyExpired = isWarrantyExpired(e.warrantyExpiresAt);
  // The only live state is an open work order; tint that row info. No
  // flag/attention tint — equipment flagging was removed in the redesign.
  const tint = e.hasOpenWorkOrder ? 'bg-[color-mix(in_oklch,var(--info-500)_6%,var(--bg-elev))]' : '';

  return (
    <tr
      className={`cursor-pointer border-b border-border-soft hover:bg-bg-hover ${tint}`}
      onClick={(ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest('[role="menu"]') || target.closest('button[aria-label]')) return;
        navigate(`/equipment/${e.id}`);
      }}
    >
      <td className="px-3.5 py-2">
        <div className="flex items-center gap-2.5">
          <EquipmentThumbnail url={e.profileImageUrl} name={e.name} sizeClass="size-8" fit="contain" />
          <div className="min-w-0">
            <div className="truncate font-mono text-[12px] font-bold text-fg-strong">{e.name}</div>
            {e.serialNumber && <div className="truncate text-[11px] text-fg-muted">{e.serialNumber}</div>}
          </div>
        </div>
      </td>
      <td className="px-3.5 py-2">
        <div className="text-[12px] text-fg">{e.make || '—'}</div>
        {e.model && <div className="font-mono text-[11px] text-fg-muted">{e.model}</div>}
      </td>
      <td className="px-3.5 py-2 text-[11.5px] text-fg-muted">{e.locationOnSite || '—'}</td>
      <td className="px-3.5 py-2 text-right font-mono text-[12px] font-semibold tabular-nums text-fg-strong">
        {age === null ? <span className="text-fg-dim">—</span> : `${age}y`}
      </td>
      <td className="px-3.5 py-2 text-[11.5px] text-fg-muted">
        {e.lastServicedAt ? <TimeAgo iso={e.lastServicedAt} /> : '—'}
      </td>
      {/* Next PM has no backend source yet — unblocks with the agreement /
          recurring-visit work. */}
      <td className="px-3.5 py-2 text-[11.5px] text-fg-dim">—</td>
      <td className={`px-3.5 py-2 text-[11.5px] ${warrantyExpired ? 'text-fg-dim' : 'text-fg-muted'}`}>
        {!e.warrantyExpiresAt ? '—' : warrantyExpired ? 'Expired' : `Thru ${formatWoDate(e.warrantyExpiresAt)}`}
      </td>
      <td className="px-3.5 py-2">
        {e.hasOpenWorkOrder ? (
          <Pill tone="info" dot live>
            Open work order
          </Pill>
        ) : (
          <span className="text-[11px] text-fg-dim">—</span>
        )}
      </td>
      <td className="px-3.5 py-2 text-right">
        <Dropdown>
          <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
            <EllipsisVerticalIcon className="size-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={() => navigate(`/equipment/${e.id}`)}>
              <DropdownLabel>{t('common.view')}</DropdownLabel>
            </DropdownItem>
            <DropdownItem onClick={() => onEdit(e)}>
              <DropdownLabel>{t('common.edit')}</DropdownLabel>
            </DropdownItem>
            <DropdownItem onClick={() => onDelete(e)}>
              <DropdownLabel>{t('common.delete')}</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Invoices tab — the per-location billing slice (FIN-1). Invoices bill at the
// CUSTOMER level; this surfaces only the invoices for work performed AT this
// site, plus a YTD/open/aged rollup. Read + drill-through, NOT a management
// surface — no apply-payment / no statements (those are customer-level). Rows
// drill to the owning work order's financial drawer (there is no standalone
// invoice-detail route yet).
// ─────────────────────────────────────────────────────────────────────────
const INVOICE_STATUS_TONE: Record<InvoiceStatusType, 'neutral' | 'info' | 'success' | 'warning'> = {
  DRAFT: 'neutral',
  SENT: 'info',
  PAID: 'success',
  OVERDUE: 'warning',
  CANCELLED: 'neutral',
  VOID: 'neutral',
};
const INVOICE_STATUS_LABEL: Record<InvoiceStatusType, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
  VOID: 'Void',
};

// Backend serializes money as JSON numbers, but the WO-scoped list has shown
// runtime strings before (see FinancialInvoicesTab) — coerce defensively. For
// display only; all totals here are server-computed, never summed client-side.
const invMoney = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

function InvoicesTab({ location }: { location: ServiceLocationDetailDto }) {
  const { getName } = useGlossary();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // List + summary are independent reads — fire in parallel. List shares the
  // tab-count cache; summary is its own cheap rollup.
  const { data: invoices = [], isLoading } = useQuery(locationInvoicesQueryOptions(location.id));
  const { data: summary } = useQuery<LocationInvoiceSummaryResponse>({
    queryKey: ['location-invoice-summary', location.id],
    queryFn: () => invoicesApi.getLocationSummary(location.id),
    enabled: !!location.id,
  });

  // WO number + job blurb for the "For work" column. Invoices carry only
  // workOrderId, so resolve display fields from the location's WO list (shared
  // cache). A WO outside the loaded page falls back to a short id.
  const { data: woData } = useQuery(workOrdersListQueryOptions({ serviceLocationId: location.id }));
  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const safeTypes = Array.isArray(workOrderTypes) ? workOrderTypes : [];
  const woById = useMemo(() => {
    const map = new Map<string, WorkOrderSummary>();
    for (const wo of woData?.content ?? []) map.set(wo.id, wo);
    return map;
  }, [woData]);

  const currency = summary?.currency ?? 'USD';
  const fmtMoney = useMemo(
    () => new Intl.NumberFormat('en-US', { style: 'currency', currency }),
    [currency],
  );

  const stats: { label: string; value: string; sub: string; tone?: 'info' | 'warning' }[] = [
    {
      label: 'Billed YTD',
      value: summary ? fmtMoney.format(invMoney(summary.billedYtd)) : '—',
      sub: t('common.entitiesCount', { entities: getName('invoice', true), count: invoices.length }),
    },
    {
      label: 'Open',
      value: summary ? fmtMoney.format(invMoney(summary.openAmount)) : '—',
      sub: `${summary?.openCount ?? 0} open`,
      tone: (summary?.openAmount ?? 0) > 0 ? 'info' : undefined,
    },
    {
      label: '91+ aged',
      value: summary ? fmtMoney.format(invMoney(summary.aged91)) : '—',
      sub: (summary?.aged91 ?? 0) > 0 ? 'past due' : 'none',
      tone: (summary?.aged91 ?? 0) > 0 ? 'warning' : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Summary strip — per-location billing at a glance. */}
      <Card padding="none">
        <div className="grid grid-cols-3">
          {stats.map((s, i) => (
            <div key={s.label} className={i < stats.length - 1 ? 'border-r border-border-soft px-3.5 py-2.5' : 'px-3.5 py-2.5'}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{s.label}</div>
              <div
                className="mt-0.5 font-mono text-[18px] font-bold tabular-nums tracking-tight"
                style={{
                  color:
                    s.tone === 'warning' ? 'var(--warning-fg)' : s.tone === 'info' ? 'var(--info-500)' : 'var(--fg-strong)',
                }}
              >
                {s.value}
              </div>
              <div className="text-[11px] text-fg-muted">{s.sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Context line — whose ledger this rolls up to. */}
      <div className="flex items-center gap-2 rounded-md border border-border-soft bg-bg-elev-2 px-3 py-2 text-[11.5px] text-fg-muted">
        <ReceiptPercentIcon className="size-3.5 shrink-0 text-fg-dim" />
        <span>
          Invoices for work at this location. Billed to{' '}
          <Link to={`/customers/${location.customerId}`} className="font-medium text-fg-accent hover:underline">
            {location.customerName}
          </Link>{' '}
          — full AR ledger lives on the {getName('customer').toLowerCase()}.
        </span>
      </div>

      <Card
        title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>{getName('invoice', true)}</CardTitle>}
        padding="none"
      >
        {isLoading ? (
          <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
            {t('common.actions.loading', { entities: getName('invoice', true) })}
          </div>
        ) : invoices.length === 0 ? (
          <div className="px-3.5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {t('common.actions.noEntitiesYet', { entities: getName('invoice', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {getName('invoice', true)} for work at this site will appear here.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="bg-bg-elev-2">
                <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                  <th className="px-3.5 py-2 font-semibold">{getName('invoice')}</th>
                  <th className="px-3.5 py-2 font-semibold">For work</th>
                  <th className="px-3.5 py-2 font-semibold">Bill to</th>
                  <th className="px-3.5 py-2 font-semibold">Issued</th>
                  <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.statusHeader')}</th>
                  <th className="px-3.5 py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    wo={inv.workOrderId ? woById.get(inv.workOrderId) : undefined}
                    typeName={
                      inv.workOrderId
                        ? safeTypes.find((tp) => tp.id === woById.get(inv.workOrderId!)?.workOrderTypeId)?.name
                        : undefined
                    }
                    billTo={location.customerName}
                    fmtMoney={fmtMoney}
                    onOpen={(workOrderId) => navigate(`/work-orders/${workOrderId}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function InvoiceRow({
  inv,
  wo,
  typeName,
  billTo,
  fmtMoney,
  onOpen,
}: {
  inv: InvoiceListItemRow;
  wo?: WorkOrderSummary;
  typeName?: string;
  billTo: string;
  fmtMoney: Intl.NumberFormat;
  onOpen: (workOrderId: string) => void;
}) {
  const voided = inv.status === InvoiceStatus.VOID || inv.status === InvoiceStatus.CANCELLED;
  const forJob = wo?.workOrderNumber ?? (inv.workOrderId ? `#${inv.workOrderId.slice(0, 8)}` : '—');
  const desc = wo ? deriveJobLabel(wo, typeName) : null;
  const clickable = !!inv.workOrderId;

  return (
    <tr
      className={`border-b border-border-soft ${voided ? 'opacity-60' : ''} ${clickable ? 'cursor-pointer hover:bg-bg-hover' : ''}`}
      onClick={() => clickable && onOpen(inv.workOrderId!)}
    >
      <td className="px-3.5 py-2">
        <span className="font-mono text-[12px] font-bold text-fg-strong">{inv.invoiceNumber}</span>
      </td>
      <td className="px-3.5 py-2">
        <div className="font-mono text-[11px] text-fg-muted">{forJob}</div>
        {desc && (
          <div className="mt-0.5 max-w-[320px] truncate text-[10.5px] text-fg" title={desc}>
            {desc}
          </div>
        )}
      </td>
      {/* Bill-to is the location's customer for every row. The job-level payer
          override (warranty co + PAYER badge) is deferred — the Invoice DTO
          carries no payer field yet, so there's nothing to surface; wire the
          badge when payer lands on the invoice read model. */}
      <td className="px-3.5 py-2 text-[11.5px] text-fg">{billTo}</td>
      <td className="px-3.5 py-2 text-[11.5px] text-fg-muted">{formatTimestamp(inv.invoiceDate)}</td>
      <td className="px-3.5 py-2">
        <Pill tone={INVOICE_STATUS_TONE[inv.status]} dot>
          {INVOICE_STATUS_LABEL[inv.status]}
        </Pill>
      </td>
      {/* Void/cancelled amount is meaningless money — strike + mute it so a
          voided $100 doesn't scan as real AR (the row dimming alone leaves the
          bold amount pulling full weight). */}
      <td
        className={`px-3.5 py-2 text-right font-mono text-[12px] tabular-nums ${
          voided ? 'font-normal text-fg-muted line-through' : 'font-bold text-fg-strong'
        }`}
      >
        {fmtMoney.format(invMoney(inv.totalAmount))}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Visits / Dispatches tab — the dispatched-visit history + schedule at this
// site. A work order can produce many visits (multi-day, return trips, crews);
// a visit is one tech's trip on one date. Read + drill-through, NOT a
// scheduling surface — that lives on the dispatch board / WO detail. Reads the
// location-scoped mapping (GET /scheduling/dispatches?serviceLocationId=),
// partitioned client-side into Upcoming (soonest first, overdue pinned) and
// Past (most recent first).
// ─────────────────────────────────────────────────────────────────────────
const VISIT_STATUS_TONE: Record<DispatchStatus, 'info' | 'success' | 'neutral' | 'warning'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  NO_SHOW: 'warning',
};
const VISIT_ACTIVE_STATES: ReadonlyArray<DispatchStatus> = ['SCHEDULED', 'IN_PROGRESS'];
const visitIsActive = (v: LocationDispatchResponse) => VISIT_ACTIVE_STATES.includes(v.status);
// Overdue = a SCHEDULED visit whose arrival window has fully elapsed and nobody
// has progressed it — the window END is the tripwire (window-start passed is
// normal "in window"). App runtime, so the wall clock is fine here.
const visitIsOverdue = (v: LocationDispatchResponse, now: number) =>
  v.status === 'SCHEDULED' && new Date(v.arrivalWindowEnd).getTime() < now;

const VISIT_DATE_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const VISIT_TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function formatVisitWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime())) return '—';
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${VISIT_DATE_FMT.format(s)} · ${VISIT_TIME_FMT.format(s)}–${VISIT_TIME_FMT.format(e)}`
    : `${VISIT_DATE_FMT.format(s)} ${VISIT_TIME_FMT.format(s)} – ${VISIT_DATE_FMT.format(e)} ${VISIT_TIME_FMT.format(e)}`;
}

// Summary preferred, WO number as the floor — workOrderNumber is non-nullable
// on this endpoint (unsynced-WO dispatches are omitted), so a title always exists.
function visitRowTitle(v: LocationDispatchResponse): string {
  return v.workOrderSummary || v.workOrderNumber;
}

function VisitsTab({ location }: { location: ServiceLocationDetailDto }) {
  const { getName } = useGlossary();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: visits = [], isLoading } = useQuery(locationDispatchesQueryOptions(location.id));

  const now = Date.now();
  const { upcoming, past } = useMemo(() => {
    const up: LocationDispatchResponse[] = [];
    const pa: LocationDispatchResponse[] = [];
    for (const v of visits) (visitIsActive(v) ? up : pa).push(v);
    // Upcoming: overdue pinned (oldest window-end first), then chronological by start.
    up.sort((a, b) => {
      const ao = visitIsOverdue(a, now) ? 0 : 1;
      const bo = visitIsOverdue(b, now) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return new Date(a.arrivalWindowStart).getTime() - new Date(b.arrivalWindowStart).getTime();
    });
    // Past: most recent first (departure, else window start).
    pa.sort(
      (a, b) =>
        new Date(b.departedAt ?? b.arrivalWindowStart).getTime() -
        new Date(a.departedAt ?? a.arrivalWindowStart).getTime(),
    );
    return { upcoming: up, past: pa };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visits]);

  const completedCount = visits.filter((v) => v.status === 'COMPLETED').length;
  const colCount = 5;

  return (
    <Card
      title={<CardTitle icon={<CalendarDaysIcon className="size-3.5" />}>{getName('dispatch', true)}</CardTitle>}
      action={
        visits.length > 0 ? (
          <span className="text-[11px] text-fg-muted">
            {upcoming.length} upcoming · {completedCount} completed
          </span>
        ) : undefined
      }
      padding="none"
    >
      {isLoading ? (
        <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
          {t('common.actions.loading', { entities: getName('dispatch', true) })}
        </div>
      ) : visits.length === 0 ? (
        <div className="px-3.5 py-10 text-center">
          <div className="text-[13px] font-semibold text-fg-strong">No visits scheduled</div>
          <div className="mt-1 text-[12px] text-fg-muted">
            Scheduled and completed visits at this site will appear here.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-bg-elev-2">
              <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                <th className="px-3.5 py-2 font-semibold">When</th>
                <th className="px-3.5 py-2 font-semibold">Type</th>
                <th className="px-3.5 py-2 font-semibold">{getName('work_order')}</th>
                <th className="px-3.5 py-2 font-semibold">Tech</th>
                <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.statusHeader')}</th>
              </tr>
            </thead>
            <tbody>
              {upcoming.length > 0 && <VisitGroupHeader label="Upcoming" count={upcoming.length} colCount={colCount} />}
              {upcoming.map((v) => (
                <VisitRow key={v.id} visit={v} now={now} onOpen={() => navigate(`/work-orders/${v.workOrderId}`)} />
              ))}
              {past.length > 0 && <VisitGroupHeader label="Past" count={past.length} colCount={colCount} />}
              {past.map((v) => (
                <VisitRow key={v.id} visit={v} now={now} onOpen={() => navigate(`/work-orders/${v.workOrderId}`)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function VisitGroupHeader({ label, count, colCount }: { label: string; count: number; colCount: number }) {
  return (
    <tr>
      <td colSpan={colCount} className="border-y border-border-soft bg-bg-elev-2 px-3.5 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-strong">{label}</span>
        <span className="ml-2 font-mono text-[10.5px] tabular-nums text-fg-muted">{count}</span>
      </td>
    </tr>
  );
}

function VisitRow({
  visit,
  now,
  onOpen,
}: {
  visit: LocationDispatchResponse;
  now: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const overdue = visitIsOverdue(visit, now);
  const live = visit.status === 'IN_PROGRESS';
  const didntHappen = visit.status === 'CANCELLED' || visit.status === 'NO_SHOW';
  const tone = overdue ? 'warning' : VISIT_STATUS_TONE[visit.status];
  const title = visitRowTitle(visit);
  const techName = visit.assignedUserName;

  // Subtle row tint: in-progress = info (a tech is on site now); overdue = warning.
  const tint = live
    ? 'bg-[color-mix(in_oklch,var(--info-500)_6%,var(--bg-elev))]'
    : overdue
      ? 'bg-[color-mix(in_oklch,var(--warning-500)_7%,var(--bg-elev))]'
      : '';

  return (
    <tr
      className={`cursor-pointer border-b border-border-soft hover:bg-bg-hover ${tint}`}
      onClick={onOpen}
    >
      <td className="px-3.5 py-2 whitespace-nowrap text-[11.5px] text-fg">
        {formatVisitWindow(visit.arrivalWindowStart, visit.arrivalWindowEnd)}
      </td>
      <td className="px-3.5 py-2">
        {visit.workOrderTypeName ? (
          <span className="rounded-[3px] border border-border-soft bg-bg-active px-1.5 text-[10px] font-semibold text-fg-muted">
            {visit.workOrderTypeName}
          </span>
        ) : (
          <span className="text-[11px] text-fg-dim">—</span>
        )}
      </td>
      <td className="px-3.5 py-2">
        <div className="font-mono text-[11px] text-fg-muted">
          {visit.workOrderNumber}
        </div>
        {title !== visit.workOrderNumber && (
          <div className={`mt-0.5 max-w-[280px] truncate text-[10.5px] ${didntHappen ? 'text-fg-muted line-through' : 'text-fg'}`} title={title}>
            {title}
          </div>
        )}
      </td>
      <td className="px-3.5 py-2">
        <VisitTechCell name={techName} live={live} muted={didntHappen} />
      </td>
      <td className="px-3.5 py-2">
        <Pill tone={tone} dot live={live}>
          {overdue ? 'Overdue' : t(`workOrders.dispatches.status.${visit.status}`)}
        </Pill>
      </td>
    </tr>
  );
}

// Round initials avatar (round = person) + resolved tech name. Live dot when
// on site. Name can be null while the user-cache catches up — fall back rather
// than blank the cell. Same name-hash color as user avatars elsewhere.
function VisitTechCell({ name, live, muted }: { name: string | null; live: boolean; muted: boolean }) {
  const named = Boolean(name);
  const display = name ?? 'Tech assigned';
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative shrink-0">
        <span
          className="flex size-[18px] items-center justify-center rounded-full text-[8.5px] font-bold text-white"
          style={{ background: named ? roleColor(display) : 'var(--fg-dim)', opacity: muted ? 0.6 : 1 }}
        >
          {named ? techInitials(display) : '—'}
        </span>
        {live && (
          <span
            className="absolute -bottom-px -right-px size-[7px] rounded-full bg-info-500"
            style={{ border: '1.5px solid var(--bg-elev)' }}
          />
        )}
      </span>
      <span className={`text-[12px] ${muted ? 'text-fg-muted' : 'text-fg'}`}>{display}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Jobs / Work Orders tab — the complete, filterable list of work orders at
// this site (the Overview's Work-orders card is a 3-row peek). Reuses the
// bespoke WorkOrderRow renderer; the toolbar reuses the shared FilterChipListbox
// + date presets, pre-scoped to this location. Server-side filtering +
// pagination — only the filters the backend supports today are wired (status
// view, type, scheduled-date range, search); multi-select status / live /
// unassigned / priority chips are pending backend support.
// ─────────────────────────────────────────────────────────────────────────
const JOB_STATUS_FILTERS: {
  id: string;
  labelKey: string;
  params: Pick<ListWorkOrdersParams, 'lifecycleState' | 'progressCategory'>;
}[] = [
  { id: 'open', labelKey: 'workOrders.filters.open', params: { lifecycleState: 'ACTIVE' } },
  { id: 'notStarted', labelKey: 'workOrders.filters.notStarted', params: { progressCategory: 'NOT_STARTED' } },
  { id: 'inProgress', labelKey: 'workOrders.filters.inProgress', params: { progressCategory: 'IN_PROGRESS' } },
  { id: 'blocked', labelKey: 'workOrders.filters.blocked', params: { progressCategory: 'BLOCKED' } },
  { id: 'completed', labelKey: 'workOrders.filters.completed', params: { progressCategory: 'COMPLETED' } },
  { id: 'cancelled', labelKey: 'workOrders.filters.cancelled', params: { lifecycleState: 'CANCELLED' } },
  { id: 'all', labelKey: 'workOrders.filters.all', params: {} },
];
const JOBS_PAGE_SIZE = 25;

function JobsTab({ location, onNewJob }: { location: ServiceLocationDetailDto; onNewJob: () => void }) {
  const { getName } = useGlossary();
  const { t } = useTranslation();

  // Default to All — this tab is the site's full work-order history, not just
  // the open set (the Overview card already surfaces the open/recent peek).
  const [statusId, setStatusId] = useState('all');
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search.trim());

  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const safeTypes = useMemo(() => (Array.isArray(workOrderTypes) ? workOrderTypes : []), [workOrderTypes]);
  const typeName = (id?: string | null) => safeTypes.find((tp) => tp.id === id)?.name;

  const statusParams = JOB_STATUS_FILTERS.find((s) => s.id === statusId)?.params ?? {};
  const range = datePreset && datePreset !== 'custom' ? rangeForPreset(datePreset) : undefined;

  const params: ListWorkOrdersParams = {
    serviceLocationId: location.id,
    ...statusParams,
    workOrderTypeIds: typeIds.length ? typeIds : undefined,
    scheduledDateFrom: range?.from,
    scheduledDateTo: range?.to,
    q: deferredSearch || undefined,
    page: page - 1, // local state is 1-based; backend Page is 0-based
    size: JOBS_PAGE_SIZE,
    // Most-recent-first: the tab defaults to All (full history), so newest
    // scheduled belongs at the top. (The designer's "ascending" assumed a
    // default-open list — different default, different right sort.)
    sort: 'scheduledDate,desc',
  };

  // Prefix ['work-orders', …] so WO/dispatch mutations (which invalidate
  // ['work-orders'] / ['work-orders-list']) refresh this list too.
  const { data, isLoading } = useQuery({
    queryKey: ['work-orders', 'location-jobs', params],
    queryFn: () => workOrderApi.getAll(params),
  });
  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const filtersActive = statusId !== 'all' || typeIds.length > 0 || !!datePreset || !!deferredSearch;
  const showingStart = total === 0 ? 0 : (page - 1) * JOBS_PAGE_SIZE + 1;
  const showingEnd = Math.min(page * JOBS_PAGE_SIZE, total);

  const resetPage = () => setPage(1);
  const clearFilters = () => {
    setStatusId('all');
    setTypeIds([]);
    setDatePreset('');
    setSearch('');
    resetPage();
  };

  const typeDisplay =
    typeIds.length === 1 ? (typeName(typeIds[0]) ?? '1 selected') : typeIds.length > 1 ? `${typeIds.length} selected` : null;
  const dateDisplay = datePreset ? t(DATE_PRESETS.find((p) => p.id === datePreset)?.labelKey ?? '') : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[220px] max-w-[360px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search WO#, summary, tech, equipment…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {search && (
            <button
              onClick={() => {
                setSearch('');
                resetPage();
              }}
              className="px-1 text-[11px] text-fg-dim hover:text-fg-strong"
            >
              ×
            </button>
          )}
        </div>

        <FilterChipListbox
          label="Status"
          ariaLabel="Status"
          value={statusId}
          displayValue={t(JOB_STATUS_FILTERS.find((s) => s.id === statusId)?.labelKey ?? '')}
          onChange={(id) => {
            setStatusId(id as string);
            resetPage();
          }}
        >
          {JOB_STATUS_FILTERS.map((s) => (
            <ChipListboxOption key={s.id} value={s.id}>
              {t(s.labelKey)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        {safeTypes.length > 0 && (
          <FilterChipListbox
            multiple
            label="Type"
            ariaLabel="Type"
            value={typeIds}
            displayValue={typeDisplay}
            onChange={(ids) => {
              setTypeIds(ids as string[]);
              resetPage();
            }}
            onClear={() => {
              setTypeIds([]);
              resetPage();
            }}
          >
            {safeTypes.map((tp) => (
              <ChipListboxOption key={tp.id} value={tp.id}>
                {tp.name}
              </ChipListboxOption>
            ))}
          </FilterChipListbox>
        )}

        <FilterChipListbox
          label={t('workOrders.table.scheduled')}
          ariaLabel="Scheduled date"
          value={datePreset || null}
          displayValue={dateDisplay}
          onChange={(id) => {
            setDatePreset(id as DatePreset);
            resetPage();
          }}
          onClear={() => {
            setDatePreset('');
            resetPage();
          }}
        >
          {DATE_PRESETS.filter((p) => p.id !== '' && p.id !== 'custom').map((p) => (
            <ChipListboxOption key={p.id} value={p.id}>
              {t(p.labelKey)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        {filtersActive && (
          <Button plain size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}

        <span className="grow" />
        <Button color="accent" size="xs" onClick={onNewJob}>
          <PlusIcon className="size-4" />
          {t('common.actions.new', { entity: getName('work_order') })}
        </Button>
      </div>

      <Card padding="none">
        {isLoading ? (
          <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">
            {t('common.actions.loading', { entities: getName('work_order', true) })}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {filtersActive ? 'No matching work orders' : t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {filtersActive
                ? 'Adjust your search or clear filters.'
                : `${getName('work_order', true)} at this site will appear here.`}
            </div>
            {filtersActive && (
              <Button plain size="xs" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead className="bg-bg-elev-2">
                  <tr className="text-left text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
                    <th className="px-3.5 py-2 font-semibold">{getName('work_order')}</th>
                    <th className="px-3.5 py-2 font-semibold">{getName('equipment')}</th>
                    <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.statusHeader')}</th>
                    <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.assigned')}</th>
                    <th className="px-3.5 py-2 font-semibold">{t('workOrders.table.scheduled')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((wo) => (
                    <WorkOrderRow key={wo.id} wo={wo} typeName={typeName(wo.workOrderTypeId)} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border-soft bg-bg-elev-2 px-4 py-2.5 text-[11.5px] text-fg-muted">
              <span>
                {t('common.pagination.showing', {
                  start: showingStart,
                  end: showingEnd,
                  total: total.toLocaleString(),
                })}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button plain size="xxs" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Prev
                  </Button>
                  <span className="font-mono text-[11px] tabular-nums text-fg">
                    {page} / {totalPages}
                  </span>
                  <Button plain size="xxs" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    Next
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Destructive footer — Close (the real lifecycle transition the backend
// exposes). The design's "Deactivate → INACTIVE" verb is a separate transition
// that doesn't have a backend endpoint yet (design open-question #1).
// ─────────────────────────────────────────────────────────────────────────
function CloseFooter({
  location,
  headline,
  onClose,
}: {
  location: ServiceLocationDetailDto;
  headline: string;
  onClose?: () => void;
}) {
  if (location.status === 'CLOSED') {
    return (
      <div className="mt-3.5">
        <Callout kind="neutral" icon={null} title={`${headline} is closed`}>
          This location is closed. Equipment, visit history, files and notes are preserved.
        </Callout>
      </div>
    );
  }
  if (!onClose) return null;
  return (
    <div className="mt-3.5">
      <Callout
        kind="neutral"
        icon={null}
        title={`Close ${headline}`}
        action={
          <Button outline="red" size="xxs" onClick={onClose}>
            Close location
          </Button>
        }
      >
        Stops new jobs at this site. Equipment, visit history, files and notes are preserved. The parent customer is unaffected.
      </Callout>
    </div>
  );
}
