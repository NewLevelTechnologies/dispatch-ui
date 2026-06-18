/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), short operational labels + separators stay literal to match ServiceLocationDetailPage + the customer-detail variants. */
// Equipment detail — the leaf entity (lives under a Location, under a Customer).
// Redesigned onto the shared detail-page shell (header card → tab row → 2-col
// overview → destructive footer) that Location / Customer / Agreement detail use,
// so the four pages read as one design. Equipment-distinct intent: the nameplate
// photo is the source of truth, service history is the longitudinal marquee (no
// derived "replace me" flag), warranty drives money decisions, and "Open work
// order" is the only live status (derived from the WO list, not stored).
//
// Units / Filters / Notes are CONDITIONAL overview cards, not tabs (HVAC has
// units + filters; a water heater doesn't). Photos / Videos stay as their own
// tabs for now — they merge into a single Media tab + nameplate peek in the
// next pass.
import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  customerApi,
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  equipmentFiltersApi,
  equipmentImagesApi,
  equipmentNotesApi,
  tenantFilterSizesApi,
  EquipmentStatus,
  EQUIPMENT_IMAGE_MAX_PER_EQUIPMENT,
  type EquipmentFilter,
  type EquipmentImage,
  type EquipmentSummary,
  type ProgressCategory,
  type TenantFilterSize,
  type UpdateEquipmentRequest,
  type WorkOrderSummary,
} from '../api';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlTab } from '../hooks/useUrlTab';
import { showSuccess, showError, extractApiError } from '../lib/toast';
import { formatTimestamp } from '../lib/formatTimestamp';
import { formatFilterSize } from '../utils/formatFilterSize';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../components/catalyst/dropdown';
import { Pill } from '../components/ui/Pill';
import { Tabs } from '../components/ui/Tabs';
import { Callout } from '../components/ui/Callout';
import IconButton from '../components/IconButton';
import ConfirmDialog from '../components/ConfirmDialog';
import EditableField from '../components/EditableField';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import EquipmentFilterFormDialog from '../components/EquipmentFilterFormDialog';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentImageUploadDialog from '../components/EquipmentImageUploadDialog';
import EquipmentNotesSection from '../components/EquipmentNotesSection';
import EquipmentVideosSection from '../components/EquipmentVideosSection';
import EquipmentPhotoLightbox from '../components/EquipmentPhotoLightbox';
import WorkOrdersList from '../components/WorkOrdersList';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
// Card title + quiet "View all" affordance — reused from the customer-detail
// chrome so equipment cards match the other redesigned detail pages exactly.
import { CardTitle, CardLink } from '../components/customer-detail/shared';
import {
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FunnelIcon,
  MapPinIcon,
  PlusIcon,
  Square3Stack3DIcon,
  StarIcon as StarIconOutline,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

// Photos + Videos stay as tabs this pass; the rest fold into overview cards.
type TabId = 'overview' | 'service-history' | 'photos' | 'videos' | 'notes';
const EQUIPMENT_TABS: readonly TabId[] = ['overview', 'service-history', 'photos', 'videos', 'notes'];

// Above this many tenant filter sizes the quick-add palette collapses to the
// top N by sortOrder with a "Show all" toggle — keeps the Filters card tight.
const FILTER_SIZE_CHIP_COLLAPSED = 8;

// WO progress → Pill tone (replaces the Catalyst Badge color map). Mirrors the
// sky/blue/amber/lime intent of WorkOrdersList in the design-system tones.
const PROGRESS_PILL: Record<ProgressCategory, 'neutral' | 'info' | 'accent' | 'warning' | 'success'> = {
  NOT_STARTED: 'neutral',
  AWAITING_SCHEDULE: 'info',
  IN_PROGRESS: 'accent',
  BLOCKED: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

const PROGRESS_TRANSLATION_KEYS: Record<ProgressCategory, string> = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Date-only display for editable lifecycle fields (install / warranty expiry).
function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Warranty coverage from the expiry date. Module-scope (not the render body) so
// the clock read stays out of the component's pure path — same as formatInstalled.
function warrantyState(iso: string | null | undefined): { has: boolean; active: boolean } {
  if (!iso) return { has: false, active: false };
  const exp = new Date(iso);
  if (Number.isNaN(exp.getTime())) return { has: false, active: false };
  return { has: true, active: exp.getTime() >= new Date().getTime() };
}

// "Installed Mar 2020 (6y)" for the header meta line. Age in whole years; under
// a year drops the age suffix. Returns null when there's no install date.
function formatInstalled(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const monthYear = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
  return `Installed ${monthYear}${years >= 1 ? ` (${years}y)` : ''}`;
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { key: routeKey } = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useUrlTab(EQUIPMENT_TABS, 'overview');
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<EquipmentFilter | null>(null);
  const [prefilledSize, setPrefilledSize] = useState<
    { lengthIn: number; widthIn: number; thicknessIn: number } | null
  >(null);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAllFilterSizes, setShowAllFilterSizes] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAddUnitOpen, setIsAddUnitOpen] = useState(false);
  const [isNewWorkOrderOpen, setIsNewWorkOrderOpen] = useState(false);
  const [retireConfirm, setRetireConfirm] = useState(false);

  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ['equipment-detail', id],
    queryFn: () => equipmentApi.getById(id!),
    enabled: !!id,
  });

  // Reference data for the inline-editable Type / Category selects on Specs.
  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
  });
  const { data: equipmentCategories = [] } = useQuery({
    queryKey: ['equipment-categories', equipment?.equipmentTypeId ?? ''],
    queryFn: () => equipmentCategoriesApi.getAll(equipment?.equipmentTypeId ?? undefined),
    enabled: Boolean(equipment?.equipmentTypeId),
  });

  // Service location (Located-at card + back-link) and its customer (the card's
  // owner line + New WO prefill). Equipment carries only serviceLocationId.
  const { data: serviceLocation } = useQuery({
    queryKey: ['service-location', equipment?.serviceLocationId ?? ''],
    queryFn: () => customerApi.getServiceLocationById(equipment!.serviceLocationId),
    enabled: Boolean(equipment?.serviceLocationId),
  });
  const { data: locationCustomer } = useQuery({
    queryKey: ['customers', serviceLocation?.customerId ?? ''],
    queryFn: () => customerApi.getById(serviceLocation!.customerId),
    enabled: Boolean(serviceLocation?.customerId),
  });

  const { data: filters = [], isLoading: filtersLoading } = useQuery({
    queryKey: ['equipment-filters', id],
    queryFn: () => equipmentFiltersApi.getAll(id!),
    enabled: !!id,
  });
  const { data: filterSizes = [] } = useQuery({
    queryKey: ['tenant-filter-sizes'],
    queryFn: () => tenantFilterSizesApi.getAll(),
  });
  const activeFilterSizes = filterSizes.filter((s) => !s.archivedAt);

  // Photos. Presigned URLs are short-lived, so this is keyed independently from
  // the embedded equipment.images array and refetched per visit.
  const { data: images = [], isLoading: imagesLoading, error: imagesError } = useQuery({
    queryKey: ['equipment-images', id],
    queryFn: () => equipmentImagesApi.list(id!),
    enabled: !!id,
  });

  // Full notes list — backs the Notes tab (the "show all" target until the
  // shared notes drawer lands). The overview card reads equipment.recentNotes.
  const { data: allNotes = [] } = useQuery({
    queryKey: ['equipment-notes', id],
    queryFn: () => equipmentNotesApi.list(id!),
    enabled: !!id,
  });

  // Service history — WOs touching this unit. Shared cache with the rendered
  // WorkOrdersList so the peek, the tab count, and the live "Open work order"
  // pill all read off one fetch.
  const { data: serviceHistoryData } = useQuery(workOrdersListQueryOptions({ equipmentId: id ?? '' }));

  // Sub-units (Units card). Flat array; 2-level hierarchy means these are the
  // direct children. Skipped when this equipment is itself a sub-unit.
  const { data: descendants = [] } = useQuery({
    queryKey: ['equipment-descendants', id],
    queryFn: () => equipmentApi.getDescendants(id!),
    enabled: !!id && !equipment?.parentId,
  });

  const invalidateEquipmentRelatedCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
  };
  const imageInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-images', id] });
    invalidateEquipmentRelatedCaches();
  };

  const deleteFilterMutation = useMutation({
    mutationFn: (filterId: string) => equipmentFiltersApi.delete(id!, filterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-filters', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', id] });
    },
    onError: (err) => showError(t('equipment.filters.errorDelete'), extractApiError(err)),
  });

  const setProfileImageMutation = useMutation({
    mutationFn: (imageId: string) => equipmentImagesApi.patch(id!, imageId, { isProfile: true }),
    onSuccess: imageInvalidate,
    onError: (err) => showError(t('equipment.images.errorUpdate'), extractApiError(err)),
  });
  const updateCaptionMutation = useMutation({
    mutationFn: ({ imageId, caption }: { imageId: string; caption: string | null }) =>
      equipmentImagesApi.patch(id!, imageId, { caption }),
    onSuccess: imageInvalidate,
    onError: (err) => showError(t('equipment.images.errorUpdate'), extractApiError(err)),
  });
  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => equipmentImagesApi.delete(id!, imageId),
    onSuccess: imageInvalidate,
    onError: (err) => showError(t('equipment.images.errorDelete'), extractApiError(err)),
  });

  // Retire / reactivate — flips status, preserving every related record. The
  // destructive-footer action (retire, not delete). Delete stays in the ⋯ menu.
  const retireMutation = useMutation({
    mutationFn: (next: EquipmentStatus) => equipmentApi.update(id!, { status: next }),
    onSuccess: (_data, next) => {
      invalidateEquipmentRelatedCaches();
      setRetireConfirm(false);
      showSuccess(next === EquipmentStatus.RETIRED ? 'Equipment retired' : 'Equipment reactivated');
    },
    onError: (err) => showError(t('common.form.errorUpdate', { entity: getName('equipment') }), extractApiError(err)),
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: () => equipmentApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-descendants'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      if (routeKey !== 'default') navigate(-1);
      else navigate('/equipment');
    },
    onError: (err) => showError(t('common.form.errorDelete', { entity: getName('equipment') }), extractApiError(err)),
  });

  const handleDeleteEquipment = () => {
    if (!equipment) return;
    if (window.confirm(t('common.actions.deleteConfirm', { name: equipment.name }))) {
      deleteEquipmentMutation.mutate();
    }
  };

  // Single-field PATCH for every inline EditableField. The field stays in edit
  // mode if this throws, so we surface then re-throw — same as WorkOrderDetail.
  const handleSaveField = async <K extends keyof UpdateEquipmentRequest>(
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => {
    try {
      await equipmentApi.update(id!, { [field]: next } as UpdateEquipmentRequest);
      invalidateEquipmentRelatedCaches();
    } catch (err) {
      showError(t('common.form.errorUpdate', { entity: getName('equipment') }), extractApiError(err));
      throw err;
    }
  };

  // Changing type resets category — the old category likely doesn't belong to
  // the new type. User picks a fresh category after.
  const handleSaveType = async (typeId: string) => {
    try {
      await equipmentApi.update(id!, { equipmentTypeId: typeId || null, equipmentCategoryId: null });
      invalidateEquipmentRelatedCaches();
    } catch (err) {
      showError(t('common.form.errorUpdate', { entity: getName('equipment') }), extractApiError(err));
      throw err;
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">
          {t('common.actions.loadingEntity', { entity: getName('equipment') })}
        </div>
      </AppLayout>
    );
  }

  if (error || !equipment) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-[1240px] px-1 py-4">
          <Callout kind="danger">
            {t('common.actions.errorLoadingEntity', { entity: getName('equipment') })}
            {error && `: ${(error as Error).message}`}
          </Callout>
          <Button outline size="xs" className="mt-3" onClick={() => navigate('/equipment')}>
            ← {t('common.actions.backTo', { entities: getName('equipment', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const isSubUnit = Boolean(equipment.parentId);
  const isRetired = equipment.status === EquipmentStatus.RETIRED;

  // ── Derived header state ──
  const typeLabel = equipment.equipmentCategoryName || equipment.equipmentTypeName || null;
  // "Open work order" — the only live status, derived from the WO list (any WO
  // that isn't completed/cancelled). Not a stored equipment field.
  const openWo = (serviceHistoryData?.content ?? []).find(
    (wo) => wo.progressCategory !== 'COMPLETED' && wo.progressCategory !== 'CANCELLED'
  );
  const { has: hasWarranty, active: underWarranty } = warrantyState(equipment.warrantyExpiresAt);

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('equipment.tabs.overview') },
    { id: 'service-history', label: t('equipment.tabs.serviceHistory'), count: serviceHistoryData?.totalElements ?? 0 },
    { id: 'photos', label: t('equipment.tabs.photos'), count: images.length },
    { id: 'videos', label: t('equipment.tabs.videos') },
    { id: 'notes', label: t('equipment.tabs.notes'), count: allNotes.length },
  ];

  // ── Header meta line (render only populated items) ──
  const makeModel =
    equipment.make && equipment.model
      ? (<span>{equipment.make} <span className="font-mono">{equipment.model}</span></span>)
      : equipment.make
        ? <span>{equipment.make}</span>
        : equipment.model
          ? <span className="font-mono">{equipment.model}</span>
          : null;
  const installed = formatInstalled(equipment.installDate);
  const meta: React.ReactNode[] = [];
  if (makeModel) meta.push(<span key="mm">{makeModel}</span>);
  if (equipment.serialNumber) meta.push(<span key="sn">SN <span className="font-mono">{equipment.serialNumber}</span></span>);
  if (installed) meta.push(<span key="inst">{installed}</span>);
  if (equipment.locationOnSite) meta.push(<span key="site">{equipment.locationOnSite}</span>);

  const locationLabel = serviceLocation
    ? serviceLocation.locationName ||
      `${serviceLocation.address.streetAddress}, ${serviceLocation.address.city}`
    : getName('service_location');

  const filterChips = showAllFilterSizes
    ? activeFilterSizes
    : activeFilterSizes.slice(0, FILTER_SIZE_CHIP_COLLAPSED);

  const openCreateFilter = () => {
    setEditingFilter(null);
    setPrefilledSize(null);
    setIsFilterDialogOpen(true);
  };
  const openCreateFromSize = (size: TenantFilterSize) => {
    setEditingFilter(null);
    setPrefilledSize({ lengthIn: size.lengthIn, widthIn: size.widthIn, thicknessIn: size.thicknessIn });
    setIsFilterDialogOpen(true);
  };
  const openEditFilter = (f: EquipmentFilter) => {
    setEditingFilter(f);
    setPrefilledSize(null);
    setIsFilterDialogOpen(true);
  };
  const handleDeleteFilter = (f: EquipmentFilter) => {
    if (window.confirm(t('equipment.filters.deleteConfirm'))) deleteFilterMutation.mutate(f.id);
  };
  const handleSetProfileImage = (img: EquipmentImage) => {
    if (!img.isProfile) setProfileImageMutation.mutate(img.id);
  };
  const handleEditCaption = (img: EquipmentImage) => {
    const next = window.prompt(t('equipment.images.newCaption'), img.caption ?? '');
    if (next === null) return;
    updateCaptionMutation.mutate({ imageId: img.id, caption: next.trim() || null });
  };
  const handleDeleteImage = (img: EquipmentImage) => {
    if (window.confirm(t('equipment.images.deleteConfirm'))) deleteImageMutation.mutate(img.id);
  };
  const imageLimitReached = images.length >= EQUIPMENT_IMAGE_MAX_PER_EQUIPMENT;

  const typeOptions = [
    { value: '', label: t('common.none') },
    ...equipmentTypes.map((tp) => ({ value: tp.id, label: tp.name })),
  ];
  const categoryOptions = [
    { value: '', label: t('common.none') },
    ...equipmentCategories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const recentWorkOrders = (serviceHistoryData?.content ?? []).slice(0, 3);
  const showFiltersCard = filters.length > 0 || activeFilterSizes.length > 0;
  const hasDescription = Boolean(equipment.description?.trim());
  // Direct sub-units only — exclude any grandchild (a descendant whose parent is
  // itself a descendant). The product rule is 2 levels, so this is normally the
  // full list; the guard keeps the card flat if the backend ever returns deeper.
  const descendantIds = new Set(descendants.map((d) => d.id));
  const units = descendants.filter((d) => !(d.parentId && descendantIds.has(d.parentId)));
  const showUnitsCard = !isSubUnit && units.length > 0;

  return (
    <AppLayout>
      <div className="px-1 py-1">
        <div className="mx-auto max-w-[1240px]">
          {/* Smart back: the parent location is equipment's natural home. */}
          <RouterLink
            to={`/service-locations/${equipment.serviceLocationId}`}
            className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong"
          >
            ← {locationLabel}
          </RouterLink>

          {/* Header — photo + name + derived pills + meta + actions. */}
          <div className="mb-3 flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:gap-3.5">
            <EquipmentThumbnail
              url={equipment.profileImageUrl}
              name={t('equipment.detail.profileImageAlt', { name: equipment.name })}
              sizeClass="size-[52px]"
              fit="contain"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Heading level={1} size="page-sm" className="m-0">
                  {equipment.name}
                </Heading>
                {isRetired && <Pill tone="neutral">{t('equipment.status.retired')}</Pill>}
                {typeLabel && <Pill tone="neutral">{typeLabel}</Pill>}
                {openWo && (
                  <Pill tone="info" dot live>
                    Open work order
                  </Pill>
                )}
                {hasWarranty && (
                  <Pill tone={underWarranty ? 'success' : 'neutral'} dot>
                    {underWarranty ? 'Under warranty' : 'Warranty expired'}
                  </Pill>
                )}
              </div>
              {isSubUnit && equipment.parentName && (
                <div className="mt-1 text-[11.5px]">
                  <RouterLink
                    to={`/equipment/${equipment.parentId}`}
                    className="text-fg-accent hover:underline"
                  >
                    Part of {equipment.parentName}
                  </RouterLink>
                </div>
              )}
              {meta.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-fg-muted">
                  {meta.map((node, i) => (
                    <span key={i} className="flex items-center gap-x-2.5">
                      {i > 0 && <span className="text-fg-dim">·</span>}
                      {node}
                    </span>
                  ))}
                </div>
              )}
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
                  <DropdownItem onClick={handleDeleteEquipment}>
                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
              <Button color="accent" size="xs" onClick={() => setIsEditDialogOpen(true)} className="max-sm:flex-1">
                {t('common.edit')}
              </Button>
            </div>
          </div>

          <div className="mb-3.5">
            <Tabs value={activeTab} onChange={(tabId) => setActiveTab(tabId as TabId)} tabs={tabs} />
          </div>

          {/* ── Overview ── 2-col by content shape: wide left, narrow reference right. */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_340px]">
              {/* Left (wide) */}
              <div className="flex flex-col gap-3">
                {/* Service history peek */}
                <Card
                  title={<CardTitle icon={<WrenchScrewdriverIcon className="size-3.5" />}>{t('common.recentEntities', { entities: getName('work_order', true) })}</CardTitle>}
                  subtitle={equipment.lastServicedAt ? `Last serviced ${formatTimestamp(equipment.lastServicedAt)}` : undefined}
                  action={
                    (serviceHistoryData?.totalElements ?? 0) > 0 ? (
                      <CardLink onClick={() => setActiveTab('service-history')}>{t('common.viewAll')}</CardLink>
                    ) : undefined
                  }
                  padding="none"
                >
                  {recentWorkOrders.length === 0 ? (
                    <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
                      {t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}
                    </div>
                  ) : (
                    <ul className="divide-y divide-border-soft">
                      {recentWorkOrders.map((wo) => (
                        <ServiceHistoryRow key={wo.id} wo={wo} t={t} />
                      ))}
                    </ul>
                  )}
                </Card>

                {/* Units (sub-equipment) — conditional */}
                {showUnitsCard && (
                  <Card
                    title={<CardTitle icon={<Square3Stack3DIcon className="size-3.5" />}>{getName('equipment_component', true)}</CardTitle>}
                    action={<CardLink onClick={() => setIsAddUnitOpen(true)}>+ {t('common.add')}</CardLink>}
                    padding="none"
                  >
                    <ul className="divide-y divide-border-soft">
                      {units.map((u) => (
                        <UnitRow key={u.id} unit={u} />
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Notes — capped card (composer + recent). EquipmentNotesSection
                    brings its own "Notes (N)" heading + composer + "+N more"
                    overflow, so the card carries no title of its own. Full list
                    on the Notes tab. */}
                <Card padding="none">
                  <div className="px-3.5 py-3">
                    <EquipmentNotesSection
                      equipmentId={id!}
                      recentNotes={equipment.recentNotes ?? []}
                      noteCount={equipment.noteCount ?? 0}
                      bare
                    />
                  </div>
                </Card>

                {/* Description — conditional; inline-editable textarea. */}
                {hasDescription && (
                  <Card title={<CardTitle>{t('common.form.description')}</CardTitle>}>
                    <EditableField
                      as="textarea"
                      value={equipment.description ?? ''}
                      onSave={(v) => handleSaveField('description', v || null)}
                      ariaLabel={t('common.form.description')}
                      placeholder={t('equipment.detail.descriptionPlaceholder')}
                    />
                  </Card>
                )}
              </div>

              {/* Right (narrow reference) */}
              <div className="flex flex-col gap-3">
                {/* Located at — top of rail (techs need "where" fast) */}
                <Card title={<CardTitle icon={<MapPinIcon className="size-3.5" />}>Located at</CardTitle>}>
                  <RouterLink
                    to={`/service-locations/${equipment.serviceLocationId}`}
                    className="text-[13px] font-semibold text-fg-strong hover:text-fg-accent"
                  >
                    {locationLabel}
                  </RouterLink>
                  {locationCustomer && (
                    <div className="mt-0.5 text-[11.5px] text-fg-muted">{locationCustomer.name}</div>
                  )}
                  {serviceLocation && (
                    <div className="text-[11.5px] text-fg-muted">
                      {[serviceLocation.address.streetAddress, serviceLocation.address.city, serviceLocation.address.state]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  )}
                  <div className="mt-2.5 rounded-[8px] bg-bg-elev-2 px-2.5 py-2">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      {t('equipment.form.locationOnSite')}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-fg-strong">
                      <EditableField
                        value={equipment.locationOnSite ?? ''}
                        onSave={(v) => handleSaveField('locationOnSite', v || null)}
                        ariaLabel={t('equipment.form.locationOnSite')}
                      />
                    </div>
                  </div>
                </Card>

                {/* Specs — flexible identity facts; warranty sub-block at the bottom. */}
                <Card title={<CardTitle>Specs</CardTitle>}>
                  <FieldGrid>
                    <FieldRow label={t('equipment.form.type')}>
                      <EditableField
                        as="select"
                        value={equipment.equipmentTypeId ?? ''}
                        options={typeOptions}
                        onSave={(v) => handleSaveType(v)}
                        ariaLabel={t('equipment.form.type')}
                      />
                    </FieldRow>
                    <FieldRow label={t('equipment.form.category')}>
                      <EditableField
                        as="select"
                        value={equipment.equipmentCategoryId ?? ''}
                        options={categoryOptions}
                        onSave={(v) => handleSaveField('equipmentCategoryId', v || null)}
                        disabled={!equipment.equipmentTypeId}
                        ariaLabel={t('equipment.form.category')}
                      />
                    </FieldRow>
                    <FieldRow label={t('equipment.form.make')}>
                      <EditableField
                        value={equipment.make ?? ''}
                        onSave={(v) => handleSaveField('make', v || null)}
                        ariaLabel={t('equipment.form.make')}
                      />
                    </FieldRow>
                    <FieldRow label={t('equipment.form.model')}>
                      <EditableField
                        value={equipment.model ?? ''}
                        onSave={(v) => handleSaveField('model', v || null)}
                        ariaLabel={t('equipment.form.model')}
                        className="font-mono"
                      />
                    </FieldRow>
                    <FieldRow label={t('equipment.form.serialNumber')}>
                      <EditableField
                        value={equipment.serialNumber ?? ''}
                        onSave={(v) => handleSaveField('serialNumber', v || null)}
                        ariaLabel={t('equipment.form.serialNumber')}
                        className="font-mono"
                      />
                    </FieldRow>
                    <FieldRow label={t('equipment.form.assetTag')}>
                      <EditableField
                        value={equipment.assetTag ?? ''}
                        onSave={(v) => handleSaveField('assetTag', v || null)}
                        ariaLabel={t('equipment.form.assetTag')}
                        className="font-mono"
                      />
                    </FieldRow>
                  </FieldGrid>

                  {/* Warranty — money-decision sub-block; always shown. */}
                  <div className="mt-3 rounded-[8px] bg-bg-elev-2 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                        Warranty
                      </span>
                      {hasWarranty && (
                        <Pill tone={underWarranty ? 'success' : 'neutral'} dot>
                          {underWarranty ? 'Under warranty' : 'Warranty expired'}
                        </Pill>
                      )}
                    </div>
                    <FieldGrid className="mt-1.5">
                      <FieldRow label={t('equipment.form.warrantyExpiresAt')}>
                        <EditableField
                          value={equipment.warrantyExpiresAt ?? ''}
                          onSave={(v) => handleSaveField('warrantyExpiresAt', v || null)}
                          ariaLabel={t('equipment.form.warrantyExpiresAt')}
                          renderDisplay={(v) => (v ? formatDate(v) : '—')}
                        />
                      </FieldRow>
                      <FieldRow label={t('equipment.form.warrantyDetails')}>
                        <EditableField
                          value={equipment.warrantyDetails ?? ''}
                          onSave={(v) => handleSaveField('warrantyDetails', v || null)}
                          ariaLabel={t('equipment.form.warrantyDetails')}
                        />
                      </FieldRow>
                    </FieldGrid>
                  </div>
                </Card>

                {/* Filters — sizes this unit takes; quick-add from tenant sizes. */}
                {showFiltersCard && (
                  <Card
                    title={<CardTitle icon={<FunnelIcon className="size-3.5" />}>{t('equipment.tabs.filters')}</CardTitle>}
                    action={<CardLink onClick={openCreateFilter}>+ {t('equipment.filters.addFilter')}</CardLink>}
                    padding="none"
                  >
                    {activeFilterSizes.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 border-b border-border-soft px-3.5 py-2.5">
                        {filterChips.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => openCreateFromSize(s)}
                            className="rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] font-medium text-fg-muted hover:border-fg-dim hover:text-fg-strong"
                          >
                            {formatFilterSize(s)}
                          </button>
                        ))}
                        {activeFilterSizes.length > FILTER_SIZE_CHIP_COLLAPSED && (
                          <button
                            type="button"
                            onClick={() => setShowAllFilterSizes((v) => !v)}
                            className="card-action"
                          >
                            {showAllFilterSizes
                              ? t('equipment.filters.showFewer')
                              : t('equipment.filters.showAll', { count: activeFilterSizes.length })}
                          </button>
                        )}
                      </div>
                    )}
                    {filtersLoading ? (
                      <div className="px-3.5 py-5 text-center text-[12px] text-fg-muted">
                        {t('equipment.filters.loading')}
                      </div>
                    ) : filters.length === 0 ? (
                      <div className="px-3.5 py-5 text-center text-[12px] text-fg-muted">
                        {t('equipment.filters.empty')}
                      </div>
                    ) : (
                      <ul className="divide-y divide-border-soft">
                        {filters.map((f) => (
                          <li key={f.id} className="flex items-center gap-2 px-3.5 py-2">
                            <span className="font-mono text-[12.5px] text-fg-strong">{formatFilterSize(f)}</span>
                            {f.quantity > 1 && <span className="text-[11px] text-fg-muted">×{f.quantity}</span>}
                            {f.label && <span className="truncate text-[11px] text-fg-muted">{f.label}</span>}
                            <div className="ml-auto -my-1.5">
                              <Dropdown>
                                <DropdownButton as={IconButton} aria-label={t('common.moreOptions')}>
                                  <EllipsisVerticalIcon className="size-4" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  <DropdownItem onClick={() => openEditFilter(f)}>
                                    <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                  </DropdownItem>
                                  <DropdownItem onClick={() => handleDeleteFilter(f)}>
                                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                                  </DropdownItem>
                                </DropdownMenu>
                              </Dropdown>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ── Service history tab ── */}
          {activeTab === 'service-history' && id && <WorkOrdersList equipmentId={id} />}

          {/* ── Photos tab ── (merges into Media next pass) */}
          {activeTab === 'photos' && (
            <div>
              <div className="mb-3 flex items-center justify-end">
                <Button
                  size="xs"
                  onClick={() => setIsImageUploadOpen(true)}
                  disabled={imageLimitReached}
                  title={
                    imageLimitReached
                      ? t('equipment.images.limitReached', {
                          entity: getName('equipment'),
                          max: EQUIPMENT_IMAGE_MAX_PER_EQUIPMENT,
                        })
                      : undefined
                  }
                >
                  <PlusIcon className="size-4" />
                  {t('equipment.images.addPhoto')}
                </Button>
              </div>

              {imagesError ? (
                <Callout kind="danger">
                  {t('equipment.images.errorLoading')}: {(imagesError as Error).message}
                </Callout>
              ) : imagesLoading ? (
                <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">{t('equipment.images.loading')}</div>
              ) : images.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-border px-3.5 py-10 text-center text-[12px] text-fg-muted">
                  {t('equipment.images.empty')}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {images.map((img, i) => (
                    <div
                      key={img.id}
                      className="group relative overflow-hidden rounded-lg ring-1 ring-border"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(i)}
                        aria-label={t('equipment.images.openFullSize')}
                        className="block aspect-square w-full bg-bg-elev-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                      >
                        <img
                          src={img.thumbnailUrl ?? img.url}
                          alt={img.caption ?? equipment.name}
                          className="size-full object-cover transition-opacity group-hover:opacity-90"
                          loading="lazy"
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSetProfileImage(img)}
                        aria-label={img.isProfile ? t('equipment.images.profile') : t('equipment.images.setAsProfile')}
                        aria-pressed={img.isProfile}
                        title={img.isProfile ? t('equipment.images.profile') : t('equipment.images.setAsProfile')}
                        className="absolute left-1 top-1 flex size-8 items-center justify-center rounded-full bg-bg-elev/80 backdrop-blur transition-colors hover:bg-bg-elev"
                      >
                        {img.isProfile ? (
                          <StarIconSolid className="size-5 text-amber-500" />
                        ) : (
                          <StarIconOutline className="size-5 text-fg-muted hover:text-amber-500" />
                        )}
                      </button>

                      <div className="absolute right-1 top-1">
                        <Dropdown>
                          <DropdownButton
                            plain
                            aria-label={t('common.moreOptions')}
                            className="rounded-full bg-bg-elev/80 backdrop-blur"
                          >
                            <EllipsisVerticalIcon className="size-5" />
                          </DropdownButton>
                          <DropdownMenu anchor="bottom end">
                            <DropdownItem onClick={() => handleEditCaption(img)}>
                              <DropdownLabel>{t('equipment.images.editCaption')}</DropdownLabel>
                            </DropdownItem>
                            <DropdownItem onClick={() => handleDeleteImage(img)}>
                              <DropdownLabel>{t('common.delete')}</DropdownLabel>
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                      </div>

                      {img.caption && (
                        <div className="border-t border-border bg-bg-elev px-2 py-1.5 text-xs text-fg-muted">
                          <span className="line-clamp-1">{img.caption}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Videos tab ── (merges into Media next pass) */}
          {activeTab === 'videos' && id && <EquipmentVideosSection equipmentId={id} />}

          {/* ── Notes tab ── (show-all target until the shared notes drawer lands) */}
          {activeTab === 'notes' && (
            <EquipmentNotesSection
              equipmentId={id!}
              recentNotes={allNotes}
              noteCount={allNotes.length}
              bare
            />
          )}

          {/* Destructive footer — retire (not delete); preserves all records. */}
          <div className="mt-3.5">
            <Callout
              kind="neutral"
              icon={null}
              title={isRetired ? `${equipment.name} is retired` : `Retire ${equipment.name}`}
              action={
                <Button
                  outline={isRetired ? true : 'red'}
                  size="xxs"
                  onClick={() => setRetireConfirm(true)}
                  disabled={retireMutation.isPending}
                >
                  {isRetired ? 'Reactivate' : 'Retire'}
                </Button>
              }
            >
              {isRetired
                ? 'Restores the unit to the location’s active equipment list. New work orders can reference it again.'
                : 'Marks the unit decommissioned. Service history, media, filters and warranty are preserved; it drops off the location’s active equipment list.'}
            </Callout>
          </div>
        </div>
      </div>

      <EquipmentFilterFormDialog
        isOpen={isFilterDialogOpen}
        onClose={() => {
          setIsFilterDialogOpen(false);
          setEditingFilter(null);
          setPrefilledSize(null);
        }}
        equipmentId={id!}
        filter={editingFilter}
        prefilledSize={prefilledSize}
      />

      <EquipmentImageUploadDialog
        isOpen={isImageUploadOpen}
        onClose={() => setIsImageUploadOpen(false)}
        equipmentId={id!}
        defaultSetProfile={images.length === 0}
      />

      <EquipmentPhotoLightbox
        equipmentId={id!}
        images={images}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      <EquipmentFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        equipment={equipment}
      />

      {/* Add sub-unit — locked to this parent + its location. */}
      <EquipmentFormDialog
        isOpen={isAddUnitOpen}
        onClose={() => setIsAddUnitOpen(false)}
        lockedParent={{ id: equipment.id, name: equipment.name }}
        lockedServiceLocationId={equipment.serviceLocationId}
      />

      <WorkOrderFormDialog
        isOpen={isNewWorkOrderOpen}
        onClose={() => setIsNewWorkOrderOpen(false)}
        prefilledCustomer={locationCustomer ? { id: locationCustomer.id, name: locationCustomer.name } : null}
      />

      <ConfirmDialog
        isOpen={retireConfirm}
        onClose={() => setRetireConfirm(false)}
        onConfirm={() => retireMutation.mutate(isRetired ? EquipmentStatus.ACTIVE : EquipmentStatus.RETIRED)}
        title={isRetired ? `Reactivate ${equipment.name}?` : `Retire ${equipment.name}?`}
        message={
          isRetired
            ? 'Restores the unit to the location’s active equipment list.'
            : 'Marks the unit decommissioned. Service history, media, filters and warranty are preserved.'
        }
        confirmLabel={isRetired ? 'Reactivate' : 'Retire'}
        isDestructive={!isRetired}
        isPending={retireMutation.isPending}
      />
    </AppLayout>
  );
}

// ── Sub-components ──

/** One row in the Overview service-history peek: date · WO# · status · summary. */
function ServiceHistoryRow({ wo, t }: { wo: WorkOrderSummary; t: (k: string, o?: Record<string, unknown>) => string }) {
  const dateIso = wo.scheduledDate ?? wo.completedDate ?? wo.createdAt;
  const woNumber = wo.workOrderNumber ?? `#${wo.id.slice(0, 8)}`;
  const firstItem = wo.workItems[0];
  const extraItems = wo.workItemCount - 1;
  return (
    <li>
      <RouterLink to={`/work-orders/${wo.id}`} className="block px-3.5 py-2 hover:bg-bg-elev-2">
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="whitespace-nowrap text-[11px] text-fg-muted">{formatTimestamp(dateIso)}</span>
          <span className="font-medium text-fg-strong">{woNumber}</span>
          <Pill tone={PROGRESS_PILL[wo.progressCategory]} dot inline>
            {t(`workOrders.progress.${PROGRESS_TRANSLATION_KEYS[wo.progressCategory]}`)}
          </Pill>
        </div>
        {firstItem && (
          <div className="mt-0.5 truncate text-[11px] text-fg-muted">
            {firstItem.description}
            {extraItems > 0 && (
              <span className="ml-1 text-fg-dim">{t('workOrders.table.workItemsMore', { count: extraItems })}</span>
            )}
          </div>
        )}
      </RouterLink>
    </li>
  );
}

/** One row in the Units card: a direct sub-unit, linking to its detail page. */
function UnitRow({ unit }: { unit: EquipmentSummary }) {
  const typeCategory =
    unit.equipmentTypeName && unit.equipmentCategoryName
      ? `${unit.equipmentTypeName} / ${unit.equipmentCategoryName}`
      : unit.equipmentTypeName || unit.equipmentCategoryName || null;
  const sub = [typeCategory, unit.model, unit.serialNumber].filter(Boolean).join(' · ');
  return (
    <li>
      <RouterLink to={`/equipment/${unit.id}`} className="flex items-center gap-2.5 px-3.5 py-2 hover:bg-bg-elev-2">
        <EquipmentThumbnail url={unit.profileImageUrl} name={unit.name} sizeClass="size-8" fit="contain" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12.5px] font-medium text-fg-strong">{unit.name}</span>
            {unit.hasOpenWorkOrder && <Pill tone="info" dot live inline>Open WO</Pill>}
          </div>
          {sub && <div className="truncate text-[11px] text-fg-muted">{sub}</div>}
        </div>
        <ChevronRightIcon className="size-4 shrink-0 text-fg-dim" />
      </RouterLink>
    </li>
  );
}

/**
 * Compact 2-col label/value grid for the dense Specs / warranty blocks. Uses
 * semantic tokens; 4px gaps and no per-row borders keep each row ~24px tall.
 */
function FieldGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl
      className={[
        'grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[12.5px] text-fg-strong',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </dl>
  );
}

/** Single label/value row in a FieldGrid. */
function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="self-center text-[11px] text-fg-muted">{label}</dt>
      <dd className="min-w-0 self-center">{children}</dd>
    </>
  );
}
