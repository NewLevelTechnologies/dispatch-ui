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
  ClockIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  ChartBarIcon,
  UserIcon,
  ReceiptPercentIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  PhotoIcon,
  TrashIcon,
  StarIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import {
  agreementApi,
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
  filesApi,
  locationFilesApi,
  activityApi,
  financialActivityApi,
  FILE_MAX_BYTES,
  invoicesApi,
  InvoiceStatus,
  type InvoiceListItemRow,
  type InvoiceStatus as InvoiceStatusType,
  type ListInvoicesParams,
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
import { buildRecentActivity } from '../lib/locationActivityRows';
import { ACTIVITY_TONE_STYLE } from '../lib/activityGlyph';
import { EMPTY_DATE_RANGE, instantRangeForDays, type DateRange } from '../lib/dateRangePresets';
import { FilterChipListbox, ChipListboxOption } from '../components/ui/FilterChipListbox';
import { DateRangeChip } from '../components/ui/DateRangeChip';
import { roleColor } from '../utils/roleColor';
import { useGlossary } from '../contexts/GlossaryContext';
import { useHasCapability } from '../hooks/useCurrentUser';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useUrlPage } from '../hooks/useUrlPage';
import { useUrlTab } from '../hooks/useUrlTab';
import { useAddressVerify } from '../hooks/useAddressVerify';
import { formatPhone } from '../utils/formatPhone';
import { formatTimestamp, formatExactTimestamp } from '../lib/formatTimestamp';
import { TimeAgo } from '../components/TimeAgo';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { extractApiError, showError, showInfo, showSuccess, showUndo } from '../lib/toast';
import AppLayout from '../components/AppLayout';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
import LocationActivityStream from '../components/LocationActivityStream';
import LocationFilesTab from '../components/LocationFilesTab';
import ServiceLocationContactDialog from '../components/ServiceLocationContactDialog';
import { ContactBlock } from '../components/detail/ContactBlock';
import NotifBell from '../components/detail/NotifBell';
import NotificationPreferencesDialog from '../components/NotificationPreferencesDialog';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import ConfirmDialog from '../components/ConfirmDialog';
import NoteDialog from '../components/NoteDialog';
import { AssignedUsersCell } from '../components/ui/AssignedUsersCell';
import { WorkOrderTypePill } from '../components/ui/WorkOrderTypePill';
import TagPicker from '../components/TagPicker';
import { TagPill } from '../components/ui/TagPill';
import { nextTagColor } from '../utils/tagColor';
import IconButton from '../components/IconButton';
import { DenseTable, DenseTHead, DenseRow } from '../components/ui/DenseTable';
import { Card } from '../components/catalyst/card';
import { Button } from '../components/catalyst/button';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
import { Field, Label } from '../components/catalyst/fieldset';
import { Textarea } from '../components/catalyst/textarea';
import { Heading } from '../components/catalyst/heading';
import { ToggleGroup, ToggleGroupOption } from '../components/ui/ToggleGroup';
import { US_STATES } from '../constants/states';
import { AddressSuggestion } from '../components/AddressSuggestion';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../components/catalyst/dropdown';
import { Pill } from '../components/ui/Pill';
import { PhotoLightbox } from '../components/ui/PhotoLightbox';
import { Callout } from '../components/ui/Callout';
import { Tabs } from '../components/ui/Tabs';
import { ListFooter } from '../components/ui/ListFooter';
import { EquipmentSummaryCard } from '../components/detail/EquipmentSummaryCard';
import type { ServiceLocationDetailDto, PremiseType, UpdateServiceLocationRequest, AddressVerifyRequest } from '../api/customerApi';
import {
  mockAttention,
  type MockTone,
} from './serviceLocationDetailMocks';

type TabId = 'overview' | 'equipment' | 'jobs' | 'invoices' | 'dispatches' | 'contacts' | 'files' | 'activity';
const LOCATION_TABS = [
  'overview',
  'equipment',
  'jobs',
  'invoices',
  'dispatches',
  'contacts',
  'files',
  'activity',
] as const satisfies readonly TabId[];

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

  const [activeTab, setActiveTab] = useUrlTab(LOCATION_TABS, 'overview');
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

  // Drives the Invoices tab-count badge; the tab re-reads the same count cache.
  const { data: locationInvoicesPage } = useQuery(locationInvoiceCountQueryOptions(id ?? ''));
  // Drives the Dispatches tab-count badge; the tab body runs its own paged queries.
  const { data: locationDispatchesCount } = useQuery(locationDispatchCountQueryOptions(id ?? ''));
  // Drives the Files tab-count badge — sums the two file sources' anchor-wide
  // counts (job/equipment aggregate + direct site uploads) off lean limit-1
  // pages. Keyed under the ['location-files', id] prefix so the tab's
  // upload/delete/profile invalidations refresh the badge too. The aggregate
  // read (work-order-service /files) can be down independently of direct
  // uploads — its failure just drops that side of the sum.
  const { data: directFilesCount } = useQuery({
    queryKey: ['location-files', id, 'direct-count'] as const,
    queryFn: () => locationFilesApi.list(id!, { limit: 1 }),
    enabled: !!id,
  });
  const { data: aggFilesCount } = useQuery({
    queryKey: ['location-files', id, 'agg-count'] as const,
    queryFn: () => filesApi.listForServiceLocation(id!, { limit: 1 }),
    enabled: !!id,
    retry: 1,
  });
  const filesCount =
    directFilesCount || aggFilesCount
      ? (directFilesCount?.counts.all ?? 0) + (aggFilesCount?.counts.all ?? 0)
      : undefined;

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
    { id: 'invoices', label: getName('invoice', true), count: locationInvoicesPage?.totalElements },
    { id: 'dispatches', label: getName('dispatch', true), count: locationDispatchesCount?.totalElements },
    { id: 'contacts', label: 'Contacts', count: contactCount },
    { id: 'files', label: 'Files', count: filesCount },
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
          {activeTab === 'dispatches' && <DispatchesTab location={location} />}
          {activeTab === 'contacts' && <ContactsTab location={location} canEdit={canEditServiceLocations} />}
          {activeTab === 'files' && (
            <LocationFilesTab locationId={location.id} canEdit={canEditServiceLocations} />
          )}

          {activeTab === 'activity' && (
            <LocationActivityStream serviceLocationId={location.id} />
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
// Header card — pin mark, name, status pills + tag cluster, meta, actions
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
          <HeaderTags location={location} canEdit={!!canEdit} />
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

      {/* Action cluster. On mobile this sits full-width on its own line below
          the name and must never wrap: New Work Order + Schedule visit collapse
          to icon-only (labels hide < sm), the kebab carries Close, and Edit
          stays the one labeled primary, flexing to fill the row. Catalyst's
          TouchTarget already gives each Button a 44px hit area on coarse
          pointers; the kebab gets a wider mobile pad to match. */}
      <div className="flex items-center gap-1.5 max-sm:w-full sm:flex-shrink-0">
        <Button
          outline
          size="xs"
          onClick={onNewJob}
          aria-label={t('common.actions.new', { entity: getName('work_order') })}
          title={t('common.actions.new', { entity: getName('work_order') })}
        >
          <PlusIcon className="size-4" />
          <span className="relative top-[0.5px] hidden sm:inline">
            {t('common.actions.new', { entity: getName('work_order') })}
          </span>
        </Button>
        <Button
          outline
          size="xs"
          onClick={() => showInfo('Visit scheduling isn’t available yet')}
          aria-label="Schedule visit"
          title="Schedule visit"
        >
          <CalendarDaysIcon className="size-4" />
          <span className="relative top-[0.5px] hidden sm:inline">Schedule visit</span>
        </Button>
        {(canEdit || onClose) && (
          <Dropdown>
            <DropdownButton as={IconButton} aria-label={t('common.moreOptions')} className="max-sm:p-2">
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
          <Button color="accent" size="xs" onClick={() => setEditing(true)} className="max-sm:flex-1">
            {t('common.edit')}
          </Button>
        )}
      </div>
    </div>
  );
}

// Inline edit of the CORE location record only: name, address, premise type,
// and region. Everything else on the page edits in place — site instructions,
// contacts and notes in their own cards, tags right on the header pill line;
// the status lifecycle (Close) stays a footer/dropdown action with
// confirmation + side effects — none of that belongs here.
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

  const av = useAddressVerify();
  const addrReq: AddressVerifyRequest = {
    streetAddress,
    streetAddressLine2: streetAddressLine2 || null,
    city,
    state,
    zipCode,
  };

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
          ...(av.coordsFor(addrReq) ?? {}),
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
        <span className="text-[11.5px] text-fg-muted">· instructions, contacts &amp; notes edit in their own cards below; tags edit on the header</span>
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

      {/* Street + apt. Stacks on mobile (street then apt, each full-width);
          8/4 split returns at sm. */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-12">
        <Field className="sm:col-span-8">
          <Label className="text-xs">{t('common.form.streetAddress')} *</Label>
          <Input value={streetAddress} onChange={(e) => setStreetAddress(e.target.value)} onBlur={() => av.run(addrReq)} required />
        </Field>
        <Field className="sm:col-span-4">
          <Label className="text-xs">{t('common.form.addressLine2')}</Label>
          <Input
            value={streetAddressLine2}
            onChange={(e) => setStreetAddressLine2(e.target.value)}
            placeholder="Apt"
          />
        </Field>
      </div>

      {/* City / state / zip / region. On mobile this stacks: City full-width,
          State + Zip share a row (2-up), Region full-width — the 12-col grid is
          kept and the per-field spans go responsive so the dense desktop layout
          is untouched while State stops collapsing into a stepper-width box. */}
      <div className="mt-3 grid grid-cols-12 gap-2">
        <Field className={hasRegions ? 'col-span-12 sm:col-span-4' : 'col-span-12 sm:col-span-6'}>
          <Label className="text-xs">{t('common.form.city')} *</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} onBlur={() => av.run(addrReq)} required />
        </Field>
        <Field className="col-span-6 sm:col-span-2">
          <Label className="text-xs">{t('common.form.state')} *</Label>
          <Select value={state} onChange={(e) => setState(e.target.value)} onBlur={() => av.run(addrReq)} required>
            <option value="">{t('common.form.select')}</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field className={hasRegions ? 'col-span-6 sm:col-span-2' : 'col-span-6 sm:col-span-4'}>
          <Label className="text-xs">{t('common.form.zipCode')} *</Label>
          <Input value={zipCode} onChange={(e) => setZipCode(e.target.value)} onBlur={() => av.run(addrReq)} inputMode="numeric" required />
        </Field>
        {hasRegions && (
          <Field className="col-span-12 sm:col-span-4">
            <Label className="text-xs">
              {getName('dispatch_region')}
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

      <AddressSuggestion
        verify={av}
        typed={addrReq}
        onAccept={(a) => {
          setStreetAddress(a.streetAddress);
          setCity(a.city);
          setState(a.state);
          setZipCode(a.zipCode);
        }}
      />

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
  // Always the premise glyph — the site photo deliberately does NOT replace
  // the mark (type recognition stays stable); the photo renders as a banner
  // on the Site instructions card instead.
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

// Per-location invoice count (FIN-1) — `totalElements` off a lean size-1 page.
// Drives the tab-count badge and the tab's "N invoices" rollup sub; the tab
// body runs its own filtered/paged list query. Keyed under the
// ['location-invoices'] prefix so invoice/payment mutations elsewhere
// (invalidateLocationInvoiceCaches) refresh it too.
function locationInvoiceCountQueryOptions(serviceLocationId: string) {
  return {
    queryKey: ['location-invoices', serviceLocationId, 'count'] as const,
    queryFn: () => invoicesApi.getAll({ serviceLocationId, size: 1 }),
    enabled: Boolean(serviceLocationId),
  };
}

// Per-location dispatch count — `totalElements` off a lean size-1 page of the
// full history listing (which counts every dispatch, incl. cancelled/no-show).
// Drives the tab-count badge; the tab body runs its own upcoming/past queries
// under the same ['location-dispatches'] prefix so one invalidation sweeps all.
function locationDispatchCountQueryOptions(serviceLocationId: string) {
  return {
    queryKey: ['location-dispatches', serviceLocationId, 'count'] as const,
    queryFn: () => dispatchesApi.listForServiceLocation(serviceLocationId, { size: 1 }),
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
          <ActivityTeaser serviceLocationId={location.id} onViewActivity={onViewActivity} />
        </div>

        {/* Right rail — reference / pre-arrival. (Tags live on the header
            pill line, not here.) */}
        <div className="flex flex-col gap-3">
          <SiteInstructionsCard location={location} canEdit={canEdit} />
          <SiteContactCard location={location} canEdit={canEdit} onViewAll={onViewContacts} />
          <ParentCustomerCard location={location} />
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
// Exported for reuse on the SINGLE customer-detail page (one wallet, one site —
// it inlines this location's operational cards). Impl stays here for now so its
// module-private row/helper deps don't have to move; relocate to
// components/detail/ when convenient (see project_customer_detail_redesign).
export function SiteWorkOrdersCard({
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
  // < sm the column table clips (STATUS falls off the right edge), so swap to a
  // stacked-card list. JS toggle rather than CSS so only one layout is in the
  // DOM at a time (no duplicate rows for screen readers / tests).
  const isDesktop = useMediaQuery('(min-width: 640px)');

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
      ) : isDesktop ? (
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
                  woType={safeTypes.find((tp) => tp.id === wo.workOrderTypeId)}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Mobile (< sm): stacked WO cards instead of the clipped column table.
        <ul className="divide-y divide-border-soft">
          {sorted.map((wo) => (
            <WorkOrderCardMobile
              key={wo.id}
              wo={wo}
              woType={safeTypes.find((tp) => tp.id === wo.workOrderTypeId)}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

// Row tint shared by both layouts: in-progress reads "live" (info); an
// unscheduled elevated-priority job is the escalation signal (warning).
// Cancelled rows stay untinted.
function woRowTint(wo: WorkOrderSummary): string {
  if (wo.lifecycleState === 'CANCELLED') return '';
  if (wo.progressCategory === 'IN_PROGRESS') {
    return 'bg-[color-mix(in_oklch,var(--info-500)_6%,var(--bg-elev))]';
  }
  const elevated = wo.priority === 'URGENT' || wo.priority === 'HIGH';
  if (!wo.scheduledDate && elevated) {
    return 'bg-[color-mix(in_oklch,var(--warning-500)_7%,var(--bg-elev))]';
  }
  return '';
}

// Title line shared by the desktop row and the mobile card — WO id (mono) +
// type pill + elevated-priority chip. Identical markup in both layouts.
// Minimal work-order-type shape the rows pass down for the colored type pill +
// the deriveJobLabel name fallback. A full WorkOrderType satisfies it.
type WoTypeRef = { name: string; accentId?: string | null };

function WoTitleLine({ wo, woType }: { wo: WorkOrderSummary; woType?: WoTypeRef }) {
  const { t } = useTranslation();
  const priority = wo.priority ?? 'NORMAL';
  const elevated = priority === 'URGENT' || priority === 'HIGH';
  return (
    <div className="flex flex-wrap items-baseline gap-1.5">
      <span className="font-mono text-[12px] font-bold text-fg-strong">
        {wo.workOrderNumber || `#${wo.id.slice(0, 8)}`}
      </span>
      <WorkOrderTypePill type={woType} />
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
  );
}

// Status / cancelled pill shared by both layouts.
function WoStatusPill({ wo }: { wo: WorkOrderSummary }) {
  const { t } = useTranslation();
  if (wo.lifecycleState === 'CANCELLED') {
    return <Pill tone="neutral">{t('workOrders.actions.cancelledBadge')}</Pill>;
  }
  return (
    <Pill tone={WO_PROGRESS_TONE[wo.progressCategory]} dot>
      {t(`workOrders.progress.${WO_PROGRESS_KEY[wo.progressCategory]}`)}
    </Pill>
  );
}

function WorkOrderRow({
  wo,
  woType,
}: {
  wo: WorkOrderSummary;
  woType?: WoTypeRef;
}) {
  const navigate = useNavigate();
  const jobLabel = deriveJobLabel(wo, woType?.name);
  return (
    <tr
      className={`cursor-pointer border-b border-border-soft hover:bg-bg-hover ${woRowTint(wo)}`}
      onClick={() => navigate(`/work-orders/${wo.id}`)}
    >
      <td className="px-3.5 py-2">
        <WoTitleLine wo={wo} woType={woType} />
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
        <WoStatusPill wo={wo} />
      </td>
      <td className="px-3.5 py-2">
        <AssignedUsersCell users={wo.assignedUsers} />
      </td>
      <td className="px-3.5 py-2 text-[11.5px] text-fg-muted">{formatWoDate(wo.scheduledDate)}</td>
    </tr>
  );
}

// Mobile (< sm) presentation of a work order. The 5-column table can't fit, so
// each WO becomes a stacked, full-width, tappable block: id + type + priority
// lead line 1 with the status pill pinned right (never clipped), the summary on
// line 2, and equipment · tech · scheduled fold into one wrapping muted meta
// line. The whole block navigates to the WO.
function WorkOrderCardMobile({ wo, woType }: { wo: WorkOrderSummary; woType?: WoTypeRef }) {
  const navigate = useNavigate();
  const jobLabel = deriveJobLabel(wo, woType?.name);
  const go = () => navigate(`/work-orders/${wo.id}`);

  // Render only the meta segments that exist, separated by · (mirrors the
  // header meta pattern). Tech is omitted entirely when unassigned rather than
  // showing a bare dash.
  const meta: React.ReactNode[] = [];
  if (wo.equip && wo.equip.count > 0) {
    meta.push(<span key="equip">{wo.equip.label}</span>);
  }
  if (wo.assignedUsers && wo.assignedUsers.length > 0) {
    meta.push(<AssignedUsersCell key="tech" users={wo.assignedUsers} />);
  }
  if (wo.scheduledDate) {
    meta.push(
      <span key="sched" className="inline-flex items-center gap-1">
        <CalendarDaysIcon className="size-3.5" />
        {formatWoDate(wo.scheduledDate)}
      </span>
    );
  }

  return (
    <li className={woRowTint(wo)}>
      <div
        role="button"
        tabIndex={0}
        onClick={go}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            go();
          }
        }}
        className="flex cursor-pointer flex-col gap-1 px-3.5 py-2.5 focus:outline-none focus-visible:bg-bg-hover active:bg-bg-hover"
      >
        {/* Line 1 — id + type + priority (left), status pill pinned right */}
        <div className="flex items-start justify-between gap-2">
          <WoTitleLine wo={wo} woType={woType} />
          <div className="shrink-0">
            <WoStatusPill wo={wo} />
          </div>
        </div>
        {/* Line 2 — summary */}
        <div className="text-[12px] text-fg">{jobLabel}</div>
        {/* Line 3 — equipment · tech · scheduled (wrapping is fine here) */}
        {meta.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-fg-muted">
            {meta.map((node, i) => (
              <span key={i} className="flex items-center gap-x-2">
                {i > 0 && <span className="text-fg-dim">·</span>}
                {node}
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function techInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase();
}

// Activity teaser — the overview answers "what's the state of this site," not
// "what happened over time." Activity is an audit trail, not knowledge, so it's
// a bounded peek at the operational feed: the 5 most recent events, not the
// full log. The chronological feed lives on the Activity tab — keep this short.
// Notes (knowledge) stays the prominent block above it. Shares the glyph/tone
// mapping + summary resolution with the Activity tab.
function ActivityTeaser({
  serviceLocationId,
  onViewActivity,
}: {
  serviceLocationId: string;
  onViewActivity: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  // Mirror the tab's default view: business (BUSINESS) + financial milestones,
  // merged to the 5 most recent. Audit/communications are not part of the
  // default surface.
  const { data: businessData } = useQuery({
    queryKey: ['location-activity-teaser', serviceLocationId],
    queryFn: () => activityApi.listForLocation(serviceLocationId, { limit: 5 }),
    enabled: !!serviceLocationId,
  });
  const { data: financialData } = useQuery({
    queryKey: ['location-financial-activity-teaser', serviceLocationId],
    queryFn: () => financialActivityApi.getForLocation(serviceLocationId, { limit: 500 }).then((p) => p.content),
    enabled: !!serviceLocationId,
  });
  const recent = buildRecentActivity(
    { events: businessData?.content ?? [], financial: financialData ?? [] },
    t,
    getName,
    5
  );
  if (recent.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-bg-elev shadow-sm">
      <div className="flex items-center gap-2 border-b border-border-soft px-3.5 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-dim">Recent activity</span>
        <span className="grow" />
        <CardLink onClick={onViewActivity}>View activity →</CardLink>
      </div>
      {recent.map((item, i) => {
        const s = ACTIVITY_TONE_STYLE[item.tone];
        return (
          <div
            key={item.id}
            className={`flex items-center gap-2.5 px-3.5 py-1.5 ${i < recent.length - 1 ? 'border-b border-border-soft' : ''}`}
          >
            <div
              className="flex size-[18px] shrink-0 items-center justify-center rounded text-[11px] font-bold"
              style={{ background: s.bg, color: s.fg }}
            >
              {item.glyph}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2">
              <span className="text-[12.5px] font-medium text-fg-strong">{item.text}</span>
              {item.obj && <span className="text-[11px] text-fg-dim">· {item.obj}</span>}
            </div>
            <span className="shrink-0 text-[11px] text-fg-dim" title={item.tsExact}>
              {item.ts}
            </span>
          </div>
        );
      })}
    </div>
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

// ─────────────────────────────────────────────────────────────────────────
// Site photo banner — the single canonical front-of-building/house shot at
// the top of Site instructions. Arrival orientation: "what the place looks
// like when you pull up." One image, not a gallery — additional angles are
// ordinary Files photos. Deliberately NOT the avatar/mark (that stays the
// premise glyph for type recognition). The same file surfaces in the Files
// tab with a "Site photo" chip; replace/unset lives in that tab's lightbox.
// Empty state is a slim dashed add affordance that uploads + promotes
// (PATCH isProfile) in one gesture.
// ─────────────────────────────────────────────────────────────────────────
const SITE_PHOTO_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function SitePhotoBanner({ location, canEdit }: { location: ServiceLocationDetailDto; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const thumb = location.profileImageThumbnailUrl;

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const uploaded = await locationFilesApi.upload(location.id, file);
      // Promote in the same gesture — "Add site photo" IS the promotion.
      return locationFilesApi.patch(location.id, uploaded.id, { isProfile: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-location', location.id] });
      queryClient.invalidateQueries({ queryKey: ['service-locations'] });
      queryClient.invalidateQueries({ queryKey: ['location-files', location.id] });
      showSuccess('Site photo set');
    },
    onError: (err: unknown) => showError('Couldn’t set site photo', extractApiError(err) ?? undefined),
  });

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!SITE_PHOTO_IMAGE_TYPES.includes(file.type)) {
      showError('Couldn’t set site photo', 'Unsupported type — JPEG, PNG, or WebP only');
      return;
    }
    if (file.size > FILE_MAX_BYTES) {
      showError('Couldn’t set site photo', `Too large — max ${Math.round(FILE_MAX_BYTES / 1024 / 1024)} MB`);
      return;
    }
    uploadMutation.mutate(file);
  };

  // No photo set: slim dashed placeholder (edit-capable users only).
  if (!thumb) {
    if (!canEdit) return null;
    return (
      <div className="border-b border-border-soft">
        <input
          ref={fileInputRef}
          type="file"
          accept={SITE_PHOTO_IMAGE_TYPES.join(',')}
          onChange={(e) => {
            handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
          className="sr-only"
          aria-label="Add site photo"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex w-full items-center justify-center gap-1.5 border border-dashed border-transparent bg-bg-elev-2 px-3.5 py-2.5 text-[11.5px] font-medium text-fg-muted hover:text-fg-strong disabled:cursor-not-allowed"
        >
          <PhotoIcon className="size-4 text-fg-dim" />
          {uploadMutation.isPending ? 'Uploading…' : 'Add site photo'}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        title="Open photo"
        className="relative block w-full border-b border-border-soft"
      >
        <img src={thumb} alt="Site photo" className="aspect-[16/7] w-full object-cover" />
        <span className="absolute bottom-2 right-2 rounded bg-black/45 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-[2px]">
          Site photo
        </span>
      </button>
      {/* Full-size URL pending backend (profileImageUrl on the detail DTO);
          the thumb keeps the lightbox working until it lands. */}
      <PhotoLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        src={location.profileImageUrl ?? thumb}
        alt="Site photo"
        caption="Site photo"
      />
    </>
  );
}

// Exported for the SINGLE customer-detail page (shared site-instructions card).
export function SiteInstructionsCard({ location, canEdit }: { location: ServiceLocationDetailDto; canEdit: boolean }) {
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
      {/* ── Site photo banner — arrival orientation, leads the card ── */}
      <SitePhotoBanner location={location} canEdit={canEdit} />

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

// ContactBlock — the shared one-contact row (name · role, best-reach phone as
// the accent tel: action, email secondary, after-hours/notes when present) —
// now lives in components/detail/ContactBlock.tsx and is reused by the customer
// Billing-contacts card. Imported above.

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

// Exported for the SINGLE customer-detail page (shared site-contact card).
export function SiteContactCard({
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

  // Contacts is the one tab that doesn't become a DenseTable on mobile: phone
  // numbers are the whole point and a stacked table would still bury them. Below
  // sm we swap the directory table for ContactBlock cards (every number a
  // tappable tel: link), reusing the overview's contact-card layout.
  const isDesktop = useMediaQuery('(min-width: 640px)');

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
      ) : isDesktop ? (
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
      ) : (
        // Mobile: ContactBlock cards — name + Primary badge + role, every phone
        // a tappable tel: link, actions always visible (touch has no hover).
        <div className="divide-y divide-border-soft">
          {rows.map((c) => (
            <div key={c.id} className="px-3.5 py-3">
              <ContactBlock
                contact={c}
                primary={c.isPrimary}
                showAllPhones
                actionsVisible
                badge={c.isPrimary ? <Pill tone="info">Primary</Pill> : undefined}
                actions={
                  canEdit ? (
                    <>
                      <button
                        onClick={() => setContactDialog({ open: true, contact: c })}
                        title={t('common.edit')}
                        aria-label={t('common.edit')}
                        className="p-1 text-fg-dim hover:text-fg-strong"
                      >
                        <PencilIcon className="size-4" />
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
                          aria-label={t('contacts.makePrimary')}
                          className="p-1 text-fg-dim hover:text-fg-strong disabled:opacity-50"
                        >
                          <StarIcon className="size-4" />
                        </button>
                      )}
                      {!c.isPrimary && (
                        <button
                          onClick={() => setContactToDelete(c)}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          className="p-1 text-fg-dim hover:text-danger-500"
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      )}
                    </>
                  ) : undefined
                }
              />
            </div>
          ))}
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
  const { getName } = useGlossary();
  const termsDays = location.customerPaymentTermsDays;

  const customerBalance = location.customerOutstandingBalance;
  const siteOpenAmount = location.openInvoiceAmount;
  const siteOpenCount = location.openInvoiceCount ?? 0;
  const hasFinance =
    typeof customerBalance === 'number' || typeof siteOpenAmount === 'number';

  // REAL coverage — agreements whose active coverage includes THIS location
  // (reverse lookup: GET /work-orders/agreements?serviceLocationId=). Empty/404
  // → no line. Defaults to CONTRACT, which is right for a "Billed to" card.
  const { data: coveringAgreements } = useQuery({
    queryKey: ['agreements', { serviceLocationId: location.id }],
    queryFn: () => agreementApi.list({ serviceLocationId: location.id }),
    enabled: Boolean(location.id),
  });
  const primaryAgreement = coveringAgreements?.[0];

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

      {primaryAgreement && (
        <div className="mt-2 border-t border-border-soft pt-2 text-[11.5px] text-fg-muted">
          Covered by{' '}
          <Link
            to={`/agreements/${primaryAgreement.id}`}
            className="font-mono font-medium text-fg-strong hover:text-fg-accent"
          >
            {primaryAgreement.agreementNumber}
          </Link>
          {' · '}
          <span className="text-fg">{primaryAgreement.name}</span>
          {coveringAgreements && coveringAgreements.length > 1 && (
            <span className="text-fg-dim"> · +{coveringAgreements.length - 1} more</span>
          )}
        </div>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Header tag cluster — tags ride the header pill line (after the status
// pill, divider between), each tinted by its palette color, capped at 4
// with a "+N" overflow chip. There is no Tags card; add/remove lives here.
//
//   · "+" chip → combobox popover anchored to the cluster (typeahead over
//     the tenant library, inline "Create '{text}'"). Apply is immediate —
//     no Save step — so the popover stays open for multi-tagging.
//   · Remove: hover-revealed × on a pill, or uncheck the tag in the
//     popover's applied section. Both are instant; an undo toast is the
//     safety valve. Removing clears the assignment only — the tag itself
//     stays in the tenant catalog (deleting is tag management's job).
//   · "+N" opens the same popover (all applied tags listed with their
//     checkmarks) rather than expanding inline, so the header stays tight.
// ─────────────────────────────────────────────────────────────────────────
const HEADER_TAG_CAP = 4;

function HeaderTags({ location, canEdit }: { location: ServiceLocationDetailDto; canEdit: boolean }) {
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

  // Removal is instant (no confirm) — the undo toast restores the pre-remove
  // id set via the idempotent sync. `tagIds` is captured at mutate time, so
  // it still includes the tag being removed.
  const removeMutation = useMutation({
    mutationFn: (tag: { id: string; name: string }) =>
      tagApi.removeFromServiceLocation(location.id, tag.id),
    onSuccess: (_data, tag) => {
      invalidate();
      const prevIds = tagIds;
      showUndo(t('tags.removedToast', { name: tag.name }), t('common.undo'), () =>
        applyMutation.mutate(prevIds)
      );
    },
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

  const busy = applyMutation.isPending || createMutation.isPending || removeMutation.isPending;

  const visible = tags.slice(0, HEADER_TAG_CAP);
  const overflow = tags.length - visible.length;

  // Nothing to show and nothing addable — render nothing (no divider).
  if (tags.length === 0 && !canEdit) return null;

  return (
    <>
      <span aria-hidden className="h-3.5 w-px self-center bg-border" />
      {visible.map((tag) => (
        <TagPill
          key={tag.id}
          color={tag.color}
          name={tag.name}
          removeOnHover
          onRemove={canEdit ? () => removeMutation.mutate(tag) : undefined}
          removeLabel={t('tags.remove', { name: tag.name })}
        />
      ))}
      <span className="relative inline-flex items-center gap-1.5">
        {overflow > 0 && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t('tags.showAll', { count: tags.length })}
            className="cursor-pointer text-[11px] font-semibold text-fg-muted hover:text-fg"
          >
            +{overflow}
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={t('tags.addTag')}
            className="flex h-[19px] w-[19px] cursor-pointer items-center justify-center rounded-full border border-dashed border-border text-[12px] leading-none text-fg-muted hover:border-border-strong hover:text-fg"
          >
            +
          </button>
        )}
        {picking && (
          <div className="absolute top-full left-0 z-50 mt-1.5 w-64">
            <TagPicker
              appliedTagIds={tagIds}
              onApply={(tag: Tag) => applyMutation.mutate([...tagIds, tag.id])}
              onCreate={(name) => createMutation.mutate(name)}
              onRemove={canEdit ? (tag) => removeMutation.mutate(tag) : undefined}
              onClose={() => setPicking(false)}
              canCreate={canEdit}
              busy={busy}
            />
          </div>
        )}
      </span>
    </>
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

const EQUIPMENT_PAGE_SIZE = 25;

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
  const { page, pageHref, resetPage } = useUrlPage('equipmentPage');
  // Defer the search input so we don't fire a request per keystroke (same
  // pattern as the global Equipment page).
  const deferredSearch = useDeferredValue(q.trim());

  const listParams: ListEquipmentParams = {
    serviceLocationId,
    status: EquipmentStatus.ACTIVE,
    search: deferredSearch || undefined,
    warrantyExpired: filter === 'warranty' ? true : undefined,
    hasOpenWorkOrder: filter === 'open-wo' ? true : undefined,
    page: page - 1,
    size: EQUIPMENT_PAGE_SIZE,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['equipment', listParams],
    queryFn: () => equipmentApi.list(listParams),
    enabled: !!serviceLocationId,
  });
  const rows = useMemo(() => data?.content ?? [], [data]);
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;
  const showingStart = total === 0 ? 0 : (page - 1) * EQUIPMENT_PAGE_SIZE + 1;
  const showingEnd = Math.min(page * EQUIPMENT_PAGE_SIZE, total);

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
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
            placeholder="Search by ID, make, model, serial…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-dim"
          />
          {q && (
            <button onClick={() => { setQ(''); resetPage(); }} className="px-1 text-[11px] text-fg-dim hover:text-fg-strong">
              ×
            </button>
          )}
        </div>

        {chips.map((c) => {
          const active = filter === c.id;
          return (
            <button
              key={c.id}
              onClick={() => { setFilter(active ? null : c.id); resetPage(); }}
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
          <Button plain size="xs" onClick={() => { setFilter(null); resetPage(); }}>
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
        {isLoading ? (
          <div className="px-5 py-10 text-center text-[12px] text-fg-muted">
            {t('common.actions.loading', { entities: getName('equipment', true) })}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {hasFilters
                ? 'No equipment matches'
                : t('common.actions.noEntitiesYet', { entities: getName('equipment', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {hasFilters ? 'Adjust your search or clear filters.' : 'Add equipment to get started.'}
            </div>
          </div>
        ) : (
          // DenseTable: dense columns on desktop, one card per unit < 640px
          // (thumbnail + name/serial lead, kebab top-right, the rest stack as
          // muted lines). Type bands survive via the dense-group-header class.
          <div className="overflow-x-auto">
            <DenseTable>
              <DenseTHead>
                <tr>
                  {/* Capacity column omitted — it lives in attributes.capacity
                      and nothing captures it yet, so it'd be empty for every row.
                      Restore it once there's a capture path. */}
                  <th>{getName('equipment')}</th>
                  <th>Make / Model</th>
                  <th>Location on site</th>
                  <th className="right">Age</th>
                  <th>Last service</th>
                  <th>Next PM</th>
                  <th>Warranty</th>
                  <th>Status</th>
                  <th />
                </tr>
              </DenseTHead>
              <tbody>
                {Object.entries(grouped).flatMap(([type, items]) => [
                  <tr key={`h-${type}`} className="dense-group-header">
                    <td colSpan={9}>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-strong">{type}</span>
                      <span className="ml-2 font-mono text-[10.5px] tabular-nums text-fg-muted">{items.length}</span>
                    </td>
                  </tr>,
                  ...items.map((e) => (
                    <EquipmentRow key={e.id} e={e} onEdit={onEdit} onDelete={onDelete} />
                  )),
                ])}
              </tbody>
            </DenseTable>
          </div>
        )}
        <ListFooter
          page={page}
          totalPages={totalPages}
          pageHref={pageHref}
          left={t('common.pagination.showing', { start: showingStart, end: showingEnd, total: total.toLocaleString() })}
        />
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

  return (
    <DenseRow
      // The only live state is an open work order; tint that row info (preserved
      // through the reflow). No flag/attention tint — equipment flagging was
      // removed in the redesign.
      className={e.hasOpenWorkOrder ? 'row-live' : undefined}
      onClick={(ev) => {
        const target = ev.target as HTMLElement;
        if (target.closest('[role="menu"]') || target.closest('button[aria-label]')) return;
        navigate(`/equipment/${e.id}`);
      }}
    >
      <td>
        <div className="flex items-center gap-2.5">
          <EquipmentThumbnail url={e.profileImageUrl} name={e.name} sizeClass="size-8" fit="contain" />
          <div className="min-w-0">
            {/* Name is words → proportional; the serial below is an identifier
                matched character-by-character against a data plate → mono. */}
            <div className="truncate text-[12px] font-bold text-fg-strong">{e.name}</div>
            {e.serialNumber && <div className="truncate font-mono text-[11px] text-fg-muted">{e.serialNumber}</div>}
          </div>
        </div>
      </td>
      <td>
        <div className="text-[12px] text-fg">{e.make || '—'}</div>
        {e.model && <div className="text-[11px] text-fg-muted">{e.model}</div>}
      </td>
      <td className="text-[11.5px] text-fg-muted">{e.locationOnSite || '—'}</td>
      <td className="right font-mono text-[12px] font-semibold tabular-nums text-fg-strong">
        {age === null ? <span className="text-fg-dim">—</span> : `${age}y`}
      </td>
      <td className="text-[11.5px] text-fg-muted">
        {e.lastServicedAt ? <TimeAgo iso={e.lastServicedAt} /> : '—'}
      </td>
      {/* Next PM has no backend source yet — unblocks with the agreement /
          recurring-visit work. */}
      <td className="text-[11.5px] text-fg-dim">—</td>
      <td className={`text-[11.5px] ${warrantyExpired ? 'text-fg-dim' : 'text-fg-muted'}`}>
        {!e.warrantyExpiresAt ? '—' : warrantyExpired ? 'Expired' : `Thru ${formatWoDate(e.warrantyExpiresAt)}`}
      </td>
      <td>
        {e.hasOpenWorkOrder ? (
          <Pill tone="info" dot live>
            Open work order
          </Pill>
        ) : (
          <span className="text-[11px] text-fg-dim">—</span>
        )}
      </td>
      <td className="text-right">
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
    </DenseRow>
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

// Status chip — single-select mirror of JOB_STATUS_FILTERS. The backend has no
// multi-status param (an "Open" entry would take two requests), so each entry
// maps to at most one `status`. "Overdue" rides the server-derived
// `overdue=true` (open + strictly past due) rather than `status=OVERDUE`, so a
// SENT invoice past its due date matches even before the stored status flips.
// Statuses come from the InvoiceStatus enum, never free text — the server
// rejects unknown values (unlike `sort`, which silently drops them).
const INVOICE_STATUS_FILTERS: { id: string; label: string; params: Partial<ListInvoicesParams> }[] = [
  { id: 'all', label: 'All', params: {} },
  { id: 'overdue', label: 'Overdue', params: { overdue: true } },
  { id: 'draft', label: 'Draft', params: { status: InvoiceStatus.DRAFT } },
  { id: 'sent', label: 'Sent', params: { status: InvoiceStatus.SENT } },
  { id: 'paid', label: 'Paid', params: { status: InvoiceStatus.PAID } },
  { id: 'cancelled', label: 'Cancelled', params: { status: InvoiceStatus.CANCELLED } },
  { id: 'void', label: 'Void', params: { status: InvoiceStatus.VOID } },
];
const INVOICES_PAGE_SIZE = 25;

function InvoicesTab({ location }: { location: ServiceLocationDetailDto }) {
  const { getName } = useGlossary();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [statusId, setStatusId] = useState('all');
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [search, setSearch] = useState('');
  const { page, pageHref, resetPage } = useUrlPage('invoicesPage');
  const deferredSearch = useDeferredValue(search.trim());

  const statusParams = INVOICE_STATUS_FILTERS.find((s) => s.id === statusId)?.params ?? {};

  const params: ListInvoicesParams = {
    serviceLocationId: location.id,
    ...statusParams,
    // The chip's inclusive day strings pass through as-is.
    from: dateRange.from || undefined,
    to: dateRange.to || undefined, // inclusive on the backend — no +1-day trick
    q: deferredSearch || undefined,
    page: page - 1, // local state is 1-based; backend page is 0-based
    size: INVOICES_PAGE_SIZE,
    sort: 'invoiceDate,desc',
  };

  // Filtered/paged list + count + summary are independent reads — fire in
  // parallel. All keyed so invalidateLocationInvoiceCaches refreshes them.
  const { data, isLoading } = useQuery({
    queryKey: ['location-invoices', location.id, params],
    queryFn: () => invoicesApi.getAll(params),
  });
  const rows = data?.content ?? [];
  const total = data?.totalElements ?? 0;
  const totalPages = data?.totalPages ?? 0;

  // Unfiltered site total — shared cache with the tab-count badge.
  const { data: countPage } = useQuery(locationInvoiceCountQueryOptions(location.id));
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
      sub: t('common.entitiesCount', { entities: getName('invoice', true), count: countPage?.totalElements ?? 0 }),
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

  const filtersActive = statusId !== 'all' || Boolean(dateRange.from || dateRange.to) || !!deferredSearch;
  const showingStart = total === 0 ? 0 : (page - 1) * INVOICES_PAGE_SIZE + 1;
  const showingEnd = Math.min(page * INVOICES_PAGE_SIZE, total);

  const clearFilters = () => {
    setStatusId('all');
    setDateRange(EMPTY_DATE_RANGE);
    setSearch('');
    resetPage();
  };

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

      {/* Filter bar — same toolbar pattern as the Jobs tab. `q` matches invoice
          number OR customer name server-side, but the customer is constant at a
          location, so the placeholder is honest about what it's for. (Heads-up:
          the backend doesn't escape LIKE wildcards in `q` — `%` matches all.) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[200px] max-w-[320px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search invoice #…"
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
          displayValue={INVOICE_STATUS_FILTERS.find((s) => s.id === statusId)?.label ?? 'All'}
          onChange={(id) => {
            setStatusId(id as string);
            resetPage();
          }}
        >
          {INVOICE_STATUS_FILTERS.map((s) => (
            <ChipListboxOption key={s.id} value={s.id}>
              {s.label}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        <DateRangeChip
          label="Issued"
          ariaLabel="Issued date"
          value={dateRange}
          onChange={(r) => {
            setDateRange(r);
            resetPage();
          }}
        />

        {filtersActive && (
          <Button plain size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      <Card
        title={<CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>{getName('invoice', true)}</CardTitle>}
        padding="none"
      >
        {isLoading ? (
          <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
            {t('common.actions.loading', { entities: getName('invoice', true) })}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-3.5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {filtersActive
                ? 'No matching invoices'
                : t('common.actions.noEntitiesYet', { entities: getName('invoice', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {filtersActive
                ? 'Adjust your search or clear filters.'
                : `${getName('invoice', true)} for work at this site will appear here.`}
            </div>
            {filtersActive && (
              <Button plain size="xs" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* DenseTable: dense columns on desktop, one card per invoice
                < 640px (INV# leads, Balance pins top-right, the rest stack). */}
            <div className="overflow-x-auto">
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{getName('invoice')}</th>
                    <th>For work</th>
                    <th>Bill to</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>{t('workOrders.table.statusHeader')}</th>
                    <th className="right">Amount</th>
                    <th className="right">Balance</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {rows.map((inv) => (
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
              </DenseTable>
            </div>
            <ListFooter
              page={page}
              totalPages={totalPages}
              pageHref={pageHref}
              left={t('common.pagination.showing', {
                start: showingStart,
                end: showingEnd,
                total: total.toLocaleString(),
              })}
            />
          </>
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
  // Server-derived `overdue` is canonical — same rule as the overdue filter
  // (open + strictly past due), so badge and filter always agree. It also
  // covers SENT rows whose stored status hasn't flipped to OVERDUE yet. Never
  // recompute from dueDate client-side (timezone drift).
  const overdue = inv.overdue && !voided;
  const balance = invMoney(inv.balanceDue);
  const forJob = wo?.workOrderNumber ?? (inv.workOrderId ? `#${inv.workOrderId.slice(0, 8)}` : '—');
  const desc = wo ? deriveJobLabel(wo, typeName) : null;
  const clickable = !!inv.workOrderId;

  return (
    <DenseRow
      className={voided ? 'opacity-60' : undefined}
      onClick={clickable ? () => onOpen(inv.workOrderId!) : undefined}
    >
      <td>
        <span className="font-mono text-[12px] font-bold text-fg-strong">{inv.invoiceNumber}</span>
      </td>
      <td>
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
      <td className="text-[11.5px] text-fg">{billTo}</td>
      <td className="text-[11.5px] text-fg-muted">{formatTimestamp(inv.invoiceDate)}</td>
      <td className="text-[11.5px] text-fg-muted">{formatTimestamp(inv.dueDate)}</td>
      <td>
        <Pill tone={overdue ? 'warning' : INVOICE_STATUS_TONE[inv.status]} dot>
          {overdue ? INVOICE_STATUS_LABEL.OVERDUE : INVOICE_STATUS_LABEL[inv.status]}
        </Pill>
      </td>
      {/* Void/cancelled amount is meaningless money — strike + mute it so a
          voided $100 doesn't scan as real AR (the row dimming alone leaves the
          bold amount pulling full weight). */}
      <td
        className={`right font-mono text-[12px] tabular-nums ${
          voided ? 'font-normal text-fg-muted line-through' : 'font-bold text-fg-strong'
        }`}
      >
        {fmtMoney.format(invMoney(inv.totalAmount))}
      </td>
      {/* What's still owed — the actionable number for a CSR. Settled rows go
          dim; voided rows have no receivable at all, so a dash (not $0.00,
          which would read as "paid off"). */}
      <td
        className={`right font-mono text-[12px] tabular-nums ${
          voided ? 'text-fg-dim' : balance > 0 ? 'font-semibold text-fg-strong' : 'text-fg-dim'
        }`}
      >
        {voided ? '—' : fmtMoney.format(balance)}
      </td>
    </DenseRow>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Dispatches tab — the dispatched-visit history + schedule at this site. A
// work order can produce many dispatches (multi-day, return trips, crews);
// a dispatch is one tech's trip on one date. Read + drill-through, NOT a
// scheduling surface — that lives on the dispatch board / WO detail. Two
// server views off the location-scoped mapping
// (GET /scheduling/dispatches?serviceLocationId=): Upcoming (when=upcoming,
// strictly future open dispatches, soonest first — small and bounded, one
// fetch) above Past (the exact complement: window already started OR a
// terminal status; newest first, paged — history is unbounded for a busy
// site). The toolbar's search / status / date filters ride the endpoint's
// q / status / from-to params and AND with the `when` partition on both
// queries — everything is server-filtered, nothing is sieved client-side.
// ─────────────────────────────────────────────────────────────────────────
const DISPATCH_STATUS_TONE: Record<DispatchStatus, 'info' | 'success' | 'neutral' | 'warning'> = {
  SCHEDULED: 'info',
  IN_PROGRESS: 'success',
  COMPLETED: 'neutral',
  CANCELLED: 'neutral',
  NO_SHOW: 'warning',
};
// Overdue = a SCHEDULED dispatch whose arrival window has fully elapsed and nobody
// has progressed it — the window END is the tripwire (window-start passed is
// normal "in window"). Reads the wall clock internally so render-scope callers
// stay clear of the react-hooks/purity rule (same convention as ApprovalsPage).
const dispatchIsOverdue = (v: LocationDispatchResponse) =>
  v.status === 'SCHEDULED' && new Date(v.arrivalWindowEnd).getTime() < Date.now();

const DISPATCH_DATE_FMT = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const DISPATCH_TIME_FMT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });
function formatArrivalWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (Number.isNaN(s.getTime())) return '—';
  const sameDay = s.toDateString() === e.toDateString();
  return sameDay
    ? `${DISPATCH_DATE_FMT.format(s)} · ${DISPATCH_TIME_FMT.format(s)}–${DISPATCH_TIME_FMT.format(e)}`
    : `${DISPATCH_DATE_FMT.format(s)} ${DISPATCH_TIME_FMT.format(s)} – ${DISPATCH_DATE_FMT.format(e)} ${DISPATCH_TIME_FMT.format(e)}`;
}

// Summary preferred, WO number as the floor — workOrderNumber is non-nullable
// on this endpoint (unsynced-WO dispatches are omitted), so a title always exists.
function locationDispatchTitle(v: LocationDispatchResponse): string {
  return v.workOrderSummary || v.workOrderNumber;
}

const DISPATCHES_PAGE_SIZE = 25;
// Status filter options mirror the wire union (status is repeatable on the
// backend, but a single-select chip matches the invoices/jobs toolbars).
// Picking a terminal status leaves `when=upcoming` validly empty — the
// Upcoming card simply hides, so no per-section option scoping is needed.
const DISPATCH_STATUS_OPTIONS: DispatchStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'];

// Exported for the SINGLE customer-detail page (shared dispatches tab).
export function DispatchesTab({ location }: { location: ServiceLocationDetailDto }) {
  const { getName } = useGlossary();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [statusSel, setStatusSel] = useState<'all' | DispatchStatus>('all');
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [search, setSearch] = useState('');
  const { page, pageHref, resetPage } = useUrlPage('dispatchesPage');
  const deferredSearch = useDeferredValue(search.trim());

  // Shared filter slice — ANDs with the `when` partition on both queries.
  // The chip's inclusive day strings convert to half-open ISO instants on
  // arrivalWindowStart (either side open-ended).
  const range = instantRangeForDays(dateRange.from || undefined, dateRange.to || undefined);
  const filters = {
    q: deferredSearch || undefined,
    status: statusSel === 'all' ? undefined : statusSel,
    from: range.from,
    to: range.to,
  };

  // Two independent server views — fire in parallel. Upcoming is the small
  // actionable set; one max-size page covers any realistic schedule.
  const { data: upcomingPage, isLoading: upcomingLoading } = useQuery({
    queryKey: ['location-dispatches', location.id, 'upcoming', filters] as const,
    queryFn: () => dispatchesApi.listForServiceLocation(location.id, { when: 'upcoming', size: 200, ...filters }),
  });
  const { data: pastPage, isLoading: pastLoading } = useQuery({
    queryKey: ['location-dispatches', location.id, 'past', filters, page] as const,
    queryFn: () =>
      dispatchesApi.listForServiceLocation(location.id, {
        when: 'past',
        page: page - 1, // local state is 1-based; backend page is 0-based
        size: DISPATCHES_PAGE_SIZE,
        ...filters,
      }),
  });

  const upcoming = upcomingPage?.content ?? [];
  const past = pastPage?.content ?? [];
  const pastTotal = pastPage?.totalElements ?? 0;
  const totalPages = pastPage?.totalPages ?? 0;
  const isLoading = upcomingLoading || pastLoading;
  const openWorkOrder = (v: LocationDispatchResponse) => navigate(`/work-orders/${v.workOrderId}`);

  const filtersActive = statusSel !== 'all' || Boolean(dateRange.from || dateRange.to) || !!deferredSearch;
  const clearFilters = () => {
    setStatusSel('all');
    setDateRange(EMPTY_DATE_RANGE);
    setSearch('');
    resetPage();
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar — same pattern as the Invoices/Jobs tabs. `q` matches WO
          number/summary + tech name server-side (literal %/_ are escaped). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-8 min-w-[200px] max-w-[320px] flex-1 items-center gap-2 rounded-md border border-border bg-bg-elev px-2.5">
          <MagnifyingGlassIcon className="size-3.5 text-fg-dim" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search by tech or work order…"
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
          value={statusSel}
          displayValue={statusSel === 'all' ? 'All' : t(`workOrders.dispatches.status.${statusSel}`)}
          onChange={(id) => {
            setStatusSel(id as 'all' | DispatchStatus);
            resetPage();
          }}
        >
          <ChipListboxOption value="all">All</ChipListboxOption>
          {DISPATCH_STATUS_OPTIONS.map((s) => (
            <ChipListboxOption key={s} value={s}>
              {t(`workOrders.dispatches.status.${s}`)}
            </ChipListboxOption>
          ))}
        </FilterChipListbox>

        <DateRangeChip
          label={t('workOrders.table.scheduled')}
          ariaLabel="Scheduled date"
          value={dateRange}
          onChange={(r) => {
            setDateRange(r);
            resetPage();
          }}
        />

        {filtersActive && (
          <Button plain size="xs" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>

      {isLoading ? (
        <Card padding="none">
          <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
            {t('common.actions.loading', { entities: getName('dispatch', true) })}
          </div>
        </Card>
      ) : upcoming.length === 0 && pastTotal === 0 ? (
        <Card padding="none">
          <div className="px-3.5 py-10 text-center">
            <div className="text-[13px] font-semibold text-fg-strong">
              {filtersActive
                ? `No matching ${getName('dispatch', true).toLowerCase()}`
                : t('common.actions.noEntitiesYet', { entities: getName('dispatch', true) })}
            </div>
            <div className="mt-1 text-[12px] text-fg-muted">
              {filtersActive
                ? 'Adjust your search or clear filters.'
                : `Scheduled and completed ${getName('dispatch', true).toLowerCase()} at this site will appear here.`}
            </div>
            {filtersActive && (
              <Button plain size="xs" className="mt-2" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {upcoming.length > 0 && (
            <Card
              title={<CardTitle icon={<CalendarDaysIcon className="size-3.5" />}>Upcoming</CardTitle>}
              action={
                <span className="font-mono text-[11px] tabular-nums text-fg-muted">
                  {upcomingPage?.totalElements ?? upcoming.length}
                </span>
              }
              padding="none"
            >
              <DispatchesTable rows={upcoming} onOpen={openWorkOrder} />
            </Card>
          )}

          {pastTotal > 0 && (
            <Card
              title={<CardTitle icon={<ClockIcon className="size-3.5" />}>Past</CardTitle>}
              action={<span className="font-mono text-[11px] tabular-nums text-fg-muted">{pastTotal}</span>}
              padding="none"
            >
              <DispatchesTable rows={past} onOpen={openWorkOrder} />
              <ListFooter
                page={page}
                totalPages={totalPages}
                pageHref={pageHref}
                left={t('common.pagination.showing', {
                  start: pastTotal === 0 ? 0 : (page - 1) * DISPATCHES_PAGE_SIZE + 1,
                  end: Math.min(page * DISPATCHES_PAGE_SIZE, pastTotal),
                  total: pastTotal.toLocaleString(),
                })}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function DispatchesTable({
  rows,
  onOpen,
}: {
  rows: LocationDispatchResponse[];
  onOpen: (v: LocationDispatchResponse) => void;
}) {
  const { getName } = useGlossary();
  const { t } = useTranslation();
  return (
    // DenseTable: dense column layout on desktop, auto-stacks to one card per
    // row < 640px (When leads the card, Status pins top-right, the rest stack
    // as muted lines) — no bespoke mobile markup, consistent with the lists.
    <div className="overflow-x-auto">
      <DenseTable>
        <DenseTHead>
          <tr>
            <th>When</th>
            <th>Type</th>
            <th>{getName('work_order')}</th>
            <th>Tech</th>
            <th>{t('workOrders.table.statusHeader')}</th>
          </tr>
        </DenseTHead>
        <tbody>
          {rows.map((v) => (
            <DispatchRow key={v.id} dispatch={v} onOpen={() => onOpen(v)} />
          ))}
        </tbody>
      </DenseTable>
    </div>
  );
}

function DispatchRow({
  dispatch,
  onOpen,
}: {
  dispatch: LocationDispatchResponse;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const overdue = dispatchIsOverdue(dispatch);
  const live = dispatch.status === 'IN_PROGRESS';
  const didntHappen = dispatch.status === 'CANCELLED' || dispatch.status === 'NO_SHOW';
  const tone = overdue ? 'warning' : DISPATCH_STATUS_TONE[dispatch.status];
  const title = locationDispatchTitle(dispatch);
  const techName = dispatch.assignedUserName;
  // Row tint preserved through the DenseTable reflow: in-progress = live (info),
  // overdue = escalation (warning).
  const tintClass = live ? 'row-live' : overdue ? 'row-warn' : undefined;

  return (
    <DenseRow onClick={onOpen} className={tintClass}>
      {/* When leads (mobile card title). nowrap keeps the window on one line on
          desktop; it wraps on the full-width mobile card. */}
      <td className="whitespace-nowrap text-[11.5px] text-fg max-sm:whitespace-normal">
        {formatArrivalWindow(dispatch.arrivalWindowStart, dispatch.arrivalWindowEnd)}
      </td>
      <td>
        {dispatch.workOrderTypeName ? (
          <span className="rounded-[3px] border border-border-soft bg-bg-active px-1.5 text-[10px] font-semibold text-fg-muted">
            {dispatch.workOrderTypeName}
          </span>
        ) : (
          <span className="text-[11px] text-fg-dim">—</span>
        )}
      </td>
      <td>
        <div className="font-mono text-[11px] text-fg-muted">
          {dispatch.workOrderNumber}
        </div>
        {title !== dispatch.workOrderNumber && (
          <div className={`mt-0.5 max-w-[280px] truncate text-[10.5px] ${didntHappen ? 'text-fg-muted line-through' : 'text-fg'}`} title={title}>
            {title}
          </div>
        )}
      </td>
      <td>
        <DispatchTechCell name={techName} live={live} muted={didntHappen} />
      </td>
      {/* Status — last cell → pins top-right on the mobile card, never clipped. */}
      <td>
        <Pill tone={tone} dot live={live}>
          {overdue ? 'Overdue' : t(`workOrders.dispatches.status.${dispatch.status}`)}
        </Pill>
      </td>
    </DenseRow>
  );
}

// Round initials avatar (round = person) + resolved tech name. Live dot when
// on site. Name can be null while the user-cache catches up — fall back rather
// than blank the cell. Same name-hash color as user avatars elsewhere.
function DispatchTechCell({ name, live, muted }: { name: string | null; live: boolean; muted: boolean }) {
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

// Jobs-tab row — the site's full work-order list, routed through DenseTable so
// it stacks on mobile like the lists. (The Overview's Work-orders card keeps its
// curated peek card instead.) Reuses the shared WoTitleLine / WoStatusPill so
// the cell content matches the peek; the row tint maps to the DenseTable tint
// classes via the same rule as woRowTint.
function JobDenseRow({ wo, woType }: { wo: WorkOrderSummary; woType?: WoTypeRef }) {
  const navigate = useNavigate();
  const jobLabel = deriveJobLabel(wo, woType?.name);
  const elevated = wo.priority === 'URGENT' || wo.priority === 'HIGH';
  const tintClass =
    wo.lifecycleState === 'CANCELLED'
      ? undefined
      : wo.progressCategory === 'IN_PROGRESS'
        ? 'row-live'
        : !wo.scheduledDate && elevated
          ? 'row-warn'
          : undefined;
  return (
    <DenseRow className={tintClass} onClick={() => navigate(`/work-orders/${wo.id}`)}>
      <td>
        <WoTitleLine wo={wo} woType={woType} />
        <div className="mt-0.5 max-w-[420px] truncate text-[10.5px] text-fg" title={jobLabel}>
          {jobLabel}
        </div>
      </td>
      <td>
        {wo.equip && wo.equip.count > 0 ? (
          <span className="text-[11px] text-fg-muted">{wo.equip.label}</span>
        ) : (
          <span className="text-[11px] text-fg-dim">—</span>
        )}
      </td>
      <td>
        <WoStatusPill wo={wo} />
      </td>
      <td>
        <AssignedUsersCell users={wo.assignedUsers} />
      </td>
      <td className="text-[11.5px] text-fg-muted">{formatWoDate(wo.scheduledDate)}</td>
    </DenseRow>
  );
}

function JobsTab({ location, onNewJob }: { location: ServiceLocationDetailDto; onNewJob: () => void }) {
  const { getName } = useGlossary();
  const { t } = useTranslation();

  // Default to All — this tab is the site's full work-order history, not just
  // the open set (the Overview card already surfaces the open/recent peek).
  const [statusId, setStatusId] = useState('all');
  const [typeIds, setTypeIds] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>(EMPTY_DATE_RANGE);
  const [search, setSearch] = useState('');
  const { page, pageHref, resetPage } = useUrlPage('jobsPage');
  const deferredSearch = useDeferredValue(search.trim());

  const { data: workOrderTypes } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const safeTypes = useMemo(() => (Array.isArray(workOrderTypes) ? workOrderTypes : []), [workOrderTypes]);
  const typeName = (id?: string | null) => safeTypes.find((tp) => tp.id === id)?.name;

  const statusParams = JOB_STATUS_FILTERS.find((s) => s.id === statusId)?.params ?? {};

  const params: ListWorkOrdersParams = {
    serviceLocationId: location.id,
    ...statusParams,
    workOrderTypeIds: typeIds.length ? typeIds : undefined,
    // The chip's inclusive day strings pass through as-is.
    scheduledDateFrom: dateRange.from || undefined,
    scheduledDateTo: dateRange.to || undefined,
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

  const filtersActive =
    statusId !== 'all' || typeIds.length > 0 || Boolean(dateRange.from || dateRange.to) || !!deferredSearch;
  const showingStart = total === 0 ? 0 : (page - 1) * JOBS_PAGE_SIZE + 1;
  const showingEnd = Math.min(page * JOBS_PAGE_SIZE, total);

  const clearFilters = () => {
    setStatusId('all');
    setTypeIds([]);
    setDateRange(EMPTY_DATE_RANGE);
    setSearch('');
    resetPage();
  };

  const typeDisplay =
    typeIds.length === 1 ? (typeName(typeIds[0]) ?? '1 selected') : typeIds.length > 1 ? `${typeIds.length} selected` : null;

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

        <DateRangeChip
          label={t('workOrders.table.scheduled')}
          ariaLabel="Scheduled date"
          value={dateRange}
          onChange={(r) => {
            setDateRange(r);
            resetPage();
          }}
        />

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
            {/* DenseTable: dense columns on desktop, one card per job < 640px
                (WO# + type lead, Scheduled pins top-right, the rest stack). */}
            <div className="overflow-x-auto">
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{getName('work_order')}</th>
                    <th>{getName('equipment')}</th>
                    <th>{t('workOrders.table.statusHeader')}</th>
                    <th>{t('workOrders.table.assigned')}</th>
                    <th>{t('workOrders.table.scheduled')}</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {rows.map((wo) => (
                    <JobDenseRow key={wo.id} wo={wo} woType={safeTypes.find((tp) => tp.id === wo.workOrderTypeId)} />
                  ))}
                </tbody>
              </DenseTable>
            </div>
            <ListFooter
              page={page}
              totalPages={totalPages}
              pageHref={pageHref}
              left={t('common.pagination.showing', {
                start: showingStart,
                end: showingEnd,
                total: total.toLocaleString(),
              })}
            />
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
