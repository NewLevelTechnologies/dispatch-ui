/* eslint-disable i18next/no-literal-string -- dense detail page; entity names go through getName()/t(), short operational labels + separators stay literal to match ServiceLocationDetailPage + the customer-detail variants. */
// Equipment detail — the leaf entity (lives under a Location, under a Customer).
// Redesigned onto the shared detail-page shell (header card → tab row → 2-col
// overview → destructive footer) that Location / Customer / Agreement detail use,
// so the four pages read as one design. Equipment-distinct intent: the profile
// photo is the source of truth, service history is the longitudinal marquee (no
// derived "replace me" flag), warranty drives money decisions, and "Open work
// order" is the only live status (derived from the WO list, not stored).
//
// Units / Filters / Notes are CONDITIONAL overview cards, not tabs (HVAC has
// units + filters; a water heater doesn't). Photos + Videos live together on a
// single Media tab, with a profile-photo-led media peek on the overview.
import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  customerApi,
  equipmentApi,
  equipmentFiltersApi,
  equipmentFilesApi,
  equipmentImagesApi,
  tenantFilterSizesApi,
  workOrderTypesApi,
  EquipmentStatus,
  type Equipment,
  type EquipmentFilter,
  type EquipmentImage,
  type EquipmentSummary,
  type TenantFilterSize,
  type UpdateEquipmentRequest,
} from '../api';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlTab } from '../hooks/useUrlTab';
import { showSuccess, showError, extractApiError } from '../lib/toast';
import { formatTimestamp } from '../lib/formatTimestamp';
import { formatFilterSize } from '../utils/formatFilterSize';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { EditableCard } from '../components/ui/EditableCard';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
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
import { DenseTable, DenseTHead, DenseRow } from '../components/ui/DenseTable';
import { AssignedUsersCell } from '../components/ui/AssignedUsersCell';
import { WorkOrderTypePill } from '../components/ui/WorkOrderTypePill';
import IconButton from '../components/IconButton';
import ConfirmDialog from '../components/ConfirmDialog';
import EditableField from '../components/EditableField';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import EquipmentFilterFormDialog from '../components/EquipmentFilterFormDialog';
import EquipmentMediaUploadDialog from '../components/EquipmentMediaUploadDialog';
import EquipmentNotesCard from '../components/EquipmentNotesCard';
import EquipmentServiceHistoryTab from '../components/EquipmentServiceHistoryTab';
import EquipmentVideosSection from '../components/EquipmentVideosSection';
import EquipmentMediaLightbox, { type MediaLightboxItem } from '../components/EquipmentMediaLightbox';
import WorkOrderFormDialog from '../components/WorkOrderFormDialog';
// Card title + quiet "View all" affordance — reused from the customer-detail
// chrome so equipment cards match the other redesigned detail pages exactly.
import { CardTitle, CardLink } from '../components/customer-detail/shared';
import {
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FunnelIcon,
  MapPinIcon,
  PencilIcon,
  PhotoIcon,
  PlusIcon,
  Square3Stack3DIcon,
  StarIcon as StarIconOutline,
  VideoCameraIcon,
  WrenchScrewdriverIcon,
} from '@heroicons/react/24/outline';
import { PlayIcon } from '@heroicons/react/24/solid';

// Overview · Service history · Media. Notes/Filters/Units fold into overview
// cards; an Activity tab is pending an equipment-scoped activity API.
type TabId = 'overview' | 'service-history' | 'media';
const EQUIPMENT_TABS: readonly TabId[] = ['overview', 'service-history', 'media'];

// Above this many tenant filter sizes the quick-add palette collapses to the
// top N by sortOrder with a "Show all" toggle — keeps the Filters card tight.
const FILTER_SIZE_CHIP_COLLAPSED = 8;

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

// Card-level inline-edit draft for the Identity card (name + make/model/serial/
// asset tag/installed + warranty). Mirrors the hand-rolled editing-state pattern
// on Location/Customer detail: seed from the record, diff for dirty, PATCH the
// section. Type/Category are NOT here — recategorization carries the spec-clearing
// guard and stays in the full Edit form.
interface IdentityDraft {
  make: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  installDate: string;
  warrantyExpiresAt: string;
  warrantyLaborExpiresAt: string;
  warrantyDetails: string;
}
const EMPTY_IDENTITY: IdentityDraft = {
  make: '', model: '', serialNumber: '', assetTag: '', installDate: '',
  warrantyExpiresAt: '', warrantyLaborExpiresAt: '', warrantyDetails: '',
};
function seedIdentity(eq: Equipment): IdentityDraft {
  return {
    make: eq.make ?? '',
    model: eq.model ?? '',
    serialNumber: eq.serialNumber ?? '',
    assetTag: eq.assetTag ?? '',
    installDate: eq.installDate ?? '',
    warrantyExpiresAt: eq.warrantyExpiresAt ?? '',
    warrantyLaborExpiresAt: eq.warrantyLaborExpiresAt ?? '',
    warrantyDetails: eq.warrantyDetails ?? '',
  };
}

// m:ss for a video's duration overlay (mirrors EquipmentVideosSection).
function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
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
  const [isMediaUploadOpen, setIsMediaUploadOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAllFilterSizes, setShowAllFilterSizes] = useState(false);
  const [isNewWorkOrderOpen, setIsNewWorkOrderOpen] = useState(false);
  const [retireConfirm, setRetireConfirm] = useState(false);
  // Identity card — card-level inline edit (Edit → inputs → Save/Cancel → PATCH),
  // mirroring the editing-state cards on Location/Customer detail.
  const [identityEditing, setIdentityEditing] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft>(EMPTY_IDENTITY);
  // Header name — inline pencil edit (the canonical, only home for the name).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ['equipment-detail', id],
    queryFn: () => equipmentApi.getById(id!),
    enabled: !!id,
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

  // Videos — page-level read for the media peek + Media tab count. Shares the
  // exact query key/fn EquipmentVideosSection uses, so the Media tab's own
  // section reads from the same cache (no double fetch).
  const { data: videosData } = useQuery({
    queryKey: ['equipment-files', id, 'VIDEO'] as const,
    queryFn: () => equipmentFilesApi.list(id!, { kind: 'VIDEO', limit: 50 }),
    enabled: !!id,
  });
  const videos = (videosData?.content ?? []).filter((f) => f.status !== 'FAILED');

  // Service history — WOs touching this unit. Shared cache with the rendered
  // WorkOrdersList so the peek, the tab count, and the live "Open work order"
  // pill all read off one fetch.
  const { data: serviceHistoryData } = useQuery(workOrdersListQueryOptions({ equipmentId: id ?? '' }));

  // Work-order type id → name for the service-history peek's Type column.
  const { data: woTypesData } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const safeWoTypes = Array.isArray(woTypesData) ? woTypesData : [];

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

  // Identity card section save — one PATCH for name + make/model/serial/asset
  // tag/installed + warranty. Invalidate + toast + exit edit on success; stay in
  // edit on error so the draft isn't lost (same as Location/Customer detail).
  const identitySave = useMutation({
    mutationFn: () =>
      equipmentApi.update(id!, {
        make: identityDraft.make.trim() || null,
        model: identityDraft.model.trim() || null,
        serialNumber: identityDraft.serialNumber.trim() || null,
        assetTag: identityDraft.assetTag.trim() || null,
        installDate: identityDraft.installDate || null,
        warrantyExpiresAt: identityDraft.warrantyExpiresAt || null,
        warrantyLaborExpiresAt: identityDraft.warrantyLaborExpiresAt || null,
        warrantyDetails: identityDraft.warrantyDetails.trim() || null,
      }),
    onSuccess: () => {
      invalidateEquipmentRelatedCaches();
      setIdentityEditing(false);
      showSuccess(t('common.form.successUpdate', { entity: getName('equipment'), defaultValue: 'Equipment updated' }));
    },
    onError: (err) =>
      showError(t('common.form.errorUpdate', { entity: getName('equipment') }), extractApiError(err) ?? undefined),
  });
  const setId = (patch: Partial<IdentityDraft>) => setIdentityDraft((d) => ({ ...d, ...patch }));
  // Disable Save until something actually changed (mirrors Location/Customer dirty-tracking).
  const identityDirty =
    !!equipment && JSON.stringify(identityDraft) !== JSON.stringify(seedIdentity(equipment));

  // Commit the header name edit. Name is required, so an empty draft just exits
  // without a write; reuses the single-field PATCH (surfaces its own error).
  const submitName = async () => {
    const next = nameDraft.trim();
    if (!next || next === equipment?.name) {
      setEditingName(false);
      return;
    }
    try {
      await handleSaveField('name', next);
      setEditingName(false);
    } catch {
      /* handleSaveField surfaced the error; stay in edit so the draft isn't lost. */
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
  const totalMedia = images.length + videos.length;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('equipment.tabs.overview') },
    { id: 'service-history', label: t('equipment.tabs.serviceHistory'), count: serviceHistoryData?.totalElements ?? 0 },
    { id: 'media', label: t('equipment.tabs.media'), count: totalMedia },
  ];


  const locationLabel = serviceLocation
    ? serviceLocation.locationName ||
      `${serviceLocation.address.streetAddress}, ${serviceLocation.address.city}`
    : getName('service_location');

  // Quick-add suggestions = tenant common sizes this unit doesn't already take.
  const assignedSizes = new Set(filters.map((f) => formatFilterSize(f)));
  const quickAddCandidates = activeFilterSizes.filter((s) => !assignedSizes.has(formatFilterSize(s)));
  const quickAddChips = showAllFilterSizes
    ? quickAddCandidates
    : quickAddCandidates.slice(0, FILTER_SIZE_CHIP_COLLAPSED);

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

  const recentWorkOrders = (serviceHistoryData?.content ?? []).slice(0, 3);
  const showFiltersCard = filters.length > 0 || activeFilterSizes.length > 0;
  const hasDescription = Boolean(equipment.description?.trim());
  // Direct sub-units only — exclude any grandchild (a descendant whose parent is
  // itself a descendant). The product rule is 2 levels, so this is normally the
  // full list; the guard keeps the card flat if the backend ever returns deeper.
  const descendantIds = new Set(descendants.map((d) => d.id));
  const units = descendants.filter((d) => !(d.parentId && descendantIds.has(d.parentId)));
  const showUnitsCard = !isSubUnit && units.length > 0;

  // ── Media (peek + tab) ── The profile photo leads the gallery + the peek.
  const profilePhoto = images.find((img) => img.isProfile) ?? null;
  const galleryPhotos = images.filter((img) => !img.isProfile);
  // Profile photo leads the Media tab grid + the lightbox order.
  const orderedImages = profilePhoto ? [profilePhoto, ...galleryPhotos] : galleryPhotos;
  const MEDIA_PEEK_MAX = 4;
  // One combined gallery (photos then videos) feeds the lightbox so prev/next
  // crosses every item. `videoIndexOffset` maps a video's position to its slot
  // after the photos. The page + EquipmentVideosSection share the same
  // ['equipment-files', id, 'VIDEO'] query, so the two video lists stay aligned.
  const mediaItems: MediaLightboxItem[] = [
    ...orderedImages.map((image) => ({ kind: 'image' as const, image })),
    ...videos.map((video) => ({ kind: 'video' as const, video })),
  ];
  const videoIndexOffset = orderedImages.length;
  // Peek row = non-profile photos + videos. Each tile carries its index into the
  // combined gallery so a click opens the lightbox at the right item. Gallery
  // photos follow the profile in `orderedImages`, hence the +1 offset.
  const galleryIndexOffset = profilePhoto ? 1 : 0;
  const peekItems: MediaPeekItem[] = [
    ...galleryPhotos.map((p, gi) => ({
      id: p.id,
      thumb: p.thumbnailUrl ?? p.url,
      alt: p.caption ?? equipment.name,
      label: p.caption ?? '',
      mediaIndex: galleryIndexOffset + gi,
    })),
    ...videos.map((v, vi) => ({
      id: v.id,
      thumb: v.thumbnailUrl,
      alt: v.caption ?? v.fileName,
      label: v.caption ?? v.fileName,
      isVideo: true,
      durationSeconds: v.durationSeconds,
      mediaIndex: videoIndexOffset + vi,
    })),
  ];
  const peekShown = peekItems.slice(0, MEDIA_PEEK_MAX);
  const peekOverflow = peekItems.length - peekShown.length;
  const goToMedia = () => setActiveTab('media');

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

          {/* Header — photo + inline-editable name + derived pills + actions.
              Make/model/serial/installed live in the Identity card, on-site in
              the Located-at card — none are duplicated here. */}
          <div className="mb-3 flex flex-col gap-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:gap-3.5">
            <EquipmentThumbnail
              url={equipment.profileImageUrl}
              name={t('equipment.detail.profileImageAlt', { name: equipment.name })}
              sizeClass="size-[52px]"
              fit="contain"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {/* Name is the canonical title and the only place it's edited —
                    pencil-on-hover inline edit (the Identity card no longer
                    carries a name field). */}
                {editingName ? (
                  <Input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onBlur={submitName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); void submitName(); }
                      else if (e.key === 'Escape') { setEditingName(false); }
                    }}
                    aria-label={t('common.form.name')}
                    className="max-w-[320px]"
                  />
                ) : (
                  <span className="group/name inline-flex items-center gap-1">
                    <Heading level={1} size="page-sm" className="m-0">
                      {equipment.name}
                    </Heading>
                    <button
                      type="button"
                      onClick={() => { setNameDraft(equipment.name); setEditingName(true); }}
                      aria-label="Edit name"
                      className="rounded p-0.5 text-fg-muted opacity-0 transition-opacity hover:bg-zinc-100 group-hover/name:opacity-100 dark:hover:bg-white/5"
                    >
                      <PencilIcon className="size-3.5" />
                    </button>
                  </span>
                )}
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
                  {/* Full form is the fallback for recategorize / reassign /
                      bulk changes — the common-case edits happen inline on the
                      cards below. */}
                  <DropdownItem onClick={() => navigate(`/equipment/${id}/edit`)}>
                    <DropdownLabel>Advanced edit</DropdownLabel>
                  </DropdownItem>
                  <DropdownItem onClick={handleDeleteEquipment}>
                    <DropdownLabel>{t('common.delete')}</DropdownLabel>
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
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
                {/* Service history peek — the 3 most recent visits; full table
                    (with filters + paging) lives on the Service history tab. */}
                <Card
                  title={<CardTitle icon={<WrenchScrewdriverIcon className="size-3.5" />}>Service history</CardTitle>}
                  subtitle={equipment.lastServicedAt ? `Last serviced ${formatTimestamp(equipment.lastServicedAt)}` : undefined}
                  action={
                    (serviceHistoryData?.totalElements ?? 0) > 0 ? (
                      <CardLink onClick={() => setActiveTab('service-history')}>
                        {t('common.viewAll')} {serviceHistoryData?.totalElements}
                      </CardLink>
                    ) : undefined
                  }
                  padding="none"
                >
                  {recentWorkOrders.length === 0 ? (
                    <div className="px-3.5 py-6 text-center text-[12px] text-fg-muted">
                      {t('common.actions.noEntitiesYet', { entities: getName('work_order', true) })}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <DenseTable>
                        <DenseTHead>
                          <tr>
                            <th>Date</th>
                            <th>Work order</th>
                            <th>Work</th>
                            <th>Type</th>
                            <th>Tech</th>
                          </tr>
                        </DenseTHead>
                        <tbody>
                          {recentWorkOrders.map((wo) => {
                            const dateIso = wo.scheduledDate ?? wo.completedDate ?? wo.createdAt;
                            const woNumber = wo.workOrderNumber ?? `#${wo.id.slice(0, 8)}`;
                            const firstItem = wo.workItems[0];
                            const extra = wo.workItemCount - 1;
                            // AI/derived blurb for the job — same field the service-history
                            // tab + SiteWorkOrdersCard lead with (declared on the payload,
                            // not yet on the type → cast, matching those call sites).
                            const aiSummary = (wo as { summary?: string | null }).summary?.trim();
                            const woType = safeWoTypes.find((tp) => tp.id === wo.workOrderTypeId);
                            const live =
                              wo.progressCategory === 'IN_PROGRESS' && wo.lifecycleState !== 'CANCELLED';
                            return (
                              <DenseRow
                                key={wo.id}
                                className={`cursor-pointer ${live ? 'bg-[color-mix(in_oklch,var(--info-500)_6%,var(--bg-elev))]' : ''}`}
                                onClick={() => navigate(`/work-orders/${wo.id}`)}
                              >
                                <td className="whitespace-nowrap">
                                  <span className="text-[11.5px] text-fg-muted">{formatTimestamp(dateIso)}</span>
                                </td>
                                <td>
                                  <span className="font-mono text-[11.5px] text-fg-accent">{woNumber}</span>
                                </td>
                                {/* Lead with the work order's AI/derived summary (wo.summary);
                                    fall back to the first work item + "+N more" when absent. */}
                                <td className="max-w-[340px] truncate text-[12px]" title={aiSummary || firstItem?.description || undefined}>
                                  {aiSummary || (
                                    <>
                                      {firstItem?.description ?? '—'}
                                      {extra > 0 && <span className="ml-1 text-[11px] text-fg-dim">+{extra} more</span>}
                                    </>
                                  )}
                                </td>
                                <td>
                                  {woType ? (
                                    <WorkOrderTypePill type={woType} />
                                  ) : (
                                    <span className="text-[11px] text-fg-dim">—</span>
                                  )}
                                </td>
                                <td>
                                  <AssignedUsersCell users={wo.assignedUsers} />
                                </td>
                              </DenseRow>
                            );
                          })}
                        </tbody>
                      </DenseTable>
                    </div>
                  )}
                </Card>

                {/* Units (sub-equipment) — conditional */}
                {showUnitsCard && (
                  <Card
                    title={<CardTitle icon={<Square3Stack3DIcon className="size-3.5" />}>{getName('equipment_component', true)}</CardTitle>}
                    action={<CardLink onClick={() => navigate(`/service-locations/${equipment.serviceLocationId}/equipment/new?parent=${equipment.id}`)}>+ {t('common.add')}</CardLink>}
                    padding="none"
                  >
                    <ul className="divide-y divide-border-soft">
                      {units.map((u) => (
                        <UnitRow key={u.id} unit={u} />
                      ))}
                    </ul>
                  </Card>
                )}

                {/* Media peek — a compact single row of ~100px-tall thumbs (a glance);
                    the full browsing gallery is the Media tab. "+N" overlays the last tile. */}
                <Card
                  title={<CardTitle icon={<PhotoIcon className="size-3.5" />}>{t('equipment.tabs.media')}</CardTitle>}
                  action={totalMedia > 0 ? <CardLink onClick={goToMedia}>{t('common.viewAll')} {totalMedia} →</CardLink> : undefined}
                >
                  {totalMedia === 0 ? (
                    <p className="text-[12px] text-fg-muted">No photos or videos yet</p>
                  ) : (
                    <div className="flex gap-1.5 overflow-hidden">
                      {/* Every tile opens the combined lightbox at its item —
                          photos and videos arrow together from there. */}
                      {profilePhoto && (
                        <MediaPeekTile
                          onClick={() => setLightboxIndex(0)}
                          thumb={profilePhoto.thumbnailUrl ?? profilePhoto.url}
                          alt={profilePhoto.caption ?? equipment.name}
                          label="Profile"
                          hero
                        />
                      )}
                      {peekShown.map((m, i) => (
                        <MediaPeekTile
                          key={m.id}
                          onClick={() => setLightboxIndex(m.mediaIndex)}
                          thumb={m.thumb}
                          alt={m.alt}
                          label={m.label}
                          isVideo={m.isVideo}
                          durationSeconds={m.durationSeconds}
                          overflow={i === peekShown.length - 1 ? peekOverflow : 0}
                        />
                      ))}
                    </div>
                  )}
                </Card>

                {/* Notes — same shape + UX as the customer/location notes cards. */}
                <EquipmentNotesCard equipmentId={id!} />

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
                      {[titleCaseAddress(serviceLocation.address.streetAddress), titleCaseAddress(serviceLocation.address.city), serviceLocation.address.state]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  )}
                  <div
                    className="mt-2.5 rounded-[8px] border px-2.5 py-2"
                    style={{
                      background: 'color-mix(in oklch, var(--accent-500) 8%, var(--bg-elev))',
                      borderColor: 'color-mix(in oklch, var(--accent-500) 22%, var(--border))',
                    }}
                  >
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-accent">
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

                {/* Identity — card-level inline edit (name + make/model/serial/
                    asset tag/installed + warranty). Type/Category are read-only
                    here: recategorizing carries the spec-clearing guard and
                    stays in the full Edit form. */}
                <EditableCard
                  title="Identity"
                  editing={identityEditing}
                  onEdit={() => {
                    setIdentityDraft(seedIdentity(equipment));
                    setIdentityEditing(true);
                  }}
                  onCancel={() => setIdentityEditing(false)}
                  onSave={() => identitySave.mutate()}
                  saving={identitySave.isPending}
                  saveDisabled={!identityDirty}
                >
                  {identityEditing ? (
                    <div className="flex flex-col gap-2.5">
                      <div className="rounded-[7px] bg-bg-elev-2 px-2.5 py-1.5 text-[11px] text-fg-muted">
                        {[equipment.equipmentTypeName, equipment.equipmentCategoryName].filter(Boolean).join(' · ') || 'Unclassified'} — change type or category in the full editor.
                      </div>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Field size="xs">
                          <Label size="xs">{t('equipment.form.make')}</Label>
                          <Input size="xs" value={identityDraft.make} onChange={(e) => setId({ make: e.target.value })} />
                        </Field>
                        <Field size="xs">
                          <Label size="xs">{t('equipment.form.model')}</Label>
                          <Input size="xs" className="font-mono" value={identityDraft.model} onChange={(e) => setId({ model: e.target.value })} />
                        </Field>
                        <Field size="xs">
                          <Label size="xs">{t('equipment.form.serialNumber')}</Label>
                          <Input size="xs" className="font-mono" value={identityDraft.serialNumber} onChange={(e) => setId({ serialNumber: e.target.value })} />
                        </Field>
                        <Field size="xs">
                          <Label size="xs">{t('equipment.form.assetTag')}</Label>
                          <Input size="xs" className="font-mono" value={identityDraft.assetTag} onChange={(e) => setId({ assetTag: e.target.value })} />
                        </Field>
                      </div>
                      <Field size="xs">
                        <Label size="xs">{t('equipment.form.installDate')}</Label>
                        <Input size="xs" type="date" value={identityDraft.installDate} onChange={(e) => setId({ installDate: e.target.value })} />
                      </Field>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Field size="xs">
                          <Label size="xs">Parts covered through</Label>
                          <Input size="xs" type="date" value={identityDraft.warrantyExpiresAt} onChange={(e) => setId({ warrantyExpiresAt: e.target.value })} />
                        </Field>
                        <Field size="xs">
                          <Label size="xs">Labor covered through</Label>
                          <Input size="xs" type="date" value={identityDraft.warrantyLaborExpiresAt} onChange={(e) => setId({ warrantyLaborExpiresAt: e.target.value })} />
                        </Field>
                      </div>
                      <Field size="xs">
                        <Label size="xs">{t('equipment.form.warrantyDetails')}</Label>
                        <Input size="xs" value={identityDraft.warrantyDetails} onChange={(e) => setId({ warrantyDetails: e.target.value })} />
                      </Field>
                    </div>
                  ) : (
                    <>
                      <FieldGrid>
                        <FieldRow label={t('equipment.form.type')}>{equipment.equipmentTypeName || '—'}</FieldRow>
                        <FieldRow label={t('equipment.form.category')}>{equipment.equipmentCategoryName || '—'}</FieldRow>
                        <FieldRow label={t('equipment.form.make')}>{equipment.make || '—'}</FieldRow>
                        <FieldRow label={t('equipment.form.model')}><span className="font-mono">{equipment.model || '—'}</span></FieldRow>
                        <FieldRow label={t('equipment.form.serialNumber')}><span className="font-mono">{equipment.serialNumber || '—'}</span></FieldRow>
                        <FieldRow label={t('equipment.form.assetTag')}><span className="font-mono">{equipment.assetTag || '—'}</span></FieldRow>
                        <FieldRow label={t('equipment.form.installDate')}>{formatDate(equipment.installDate)}</FieldRow>
                      </FieldGrid>

                      {/* Warranty — money-decision sub-block; success-tinted when active. */}
                      <div
                        className="mt-3 rounded-[8px] p-2.5"
                        style={{
                          background: underWarranty
                            ? 'color-mix(in oklch, var(--success-500) 7%, var(--bg-elev))'
                            : 'var(--bg-elev-2)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                            style={{ color: underWarranty ? 'var(--success-600, var(--success-500))' : 'var(--fg-muted)' }}
                          >
                            Warranty
                          </span>
                          {hasWarranty && (
                            <Pill tone={underWarranty ? 'success' : 'neutral'} dot>
                              {underWarranty ? 'Under warranty' : 'Warranty expired'}
                            </Pill>
                          )}
                        </div>
                        <FieldGrid className="mt-1.5">
                          <FieldRow label="Parts covered through">{formatDate(equipment.warrantyExpiresAt)}</FieldRow>
                          <FieldRow label="Labor covered through">{formatDate(equipment.warrantyLaborExpiresAt)}</FieldRow>
                          <FieldRow label={t('equipment.form.warrantyDetails')}>{equipment.warrantyDetails || '—'}</FieldRow>
                        </FieldGrid>
                      </div>
                    </>
                  )}
                </EditableCard>

                {/* Filters — the sizes this unit actually takes render as rows on
                    top; "Quick add" below offers the tenant's common sizes (those
                    not already assigned) as 1-click dashed chips + a custom entry. */}
                {showFiltersCard && (
                  <Card
                    title={<CardTitle icon={<FunnelIcon className="size-3.5" />}>{t('equipment.tabs.filters')}</CardTitle>}
                    padding="none"
                  >
                    {filtersLoading ? (
                      <div className="px-3.5 py-5 text-center text-[12px] text-fg-muted">
                        {t('equipment.filters.loading')}
                      </div>
                    ) : filters.length > 0 ? (
                      <ul className="divide-y divide-border-soft">
                        {filters.map((f) => (
                          <li key={f.id} className="flex items-center gap-2 px-3.5 py-2">
                            <span className="font-mono text-[12.5px] font-bold text-fg-strong">{formatFilterSize(f)}</span>
                            {f.quantity > 1 && <span className="text-[11px] text-fg-muted">×{f.quantity}</span>}
                            {f.label && <span className="truncate text-[11px] text-fg-muted">{f.label}</span>}
                            <span className="ml-auto" />
                            {f.updatedAt && (
                              <span className="whitespace-nowrap text-[10.5px] text-fg-dim">
                                changed {formatTimestamp(f.updatedAt)}
                              </span>
                            )}
                            <div className="-my-1.5">
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
                    ) : (
                      <div className="border-b border-border-soft px-3.5 pt-3 pb-1 text-[12px] text-fg-muted">
                        {t('equipment.filters.empty')}
                      </div>
                    )}

                    {/* Quick add */}
                    <div className="px-3.5 py-2.5">
                      <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                        Quick add
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {quickAddChips.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => openCreateFromSize(s)}
                            // Inline font-size — a bare <button> otherwise picks up the
                            // 13px global, overriding Tailwind's text-[11px].
                            style={{ fontSize: '11px' }}
                            className="rounded-full border border-dashed border-border-strong px-2 py-0.5 font-mono font-semibold text-fg-accent hover:bg-bg-elev-2"
                          >
                            + {formatFilterSize(s)}
                          </button>
                        ))}
                        {quickAddCandidates.length > FILTER_SIZE_CHIP_COLLAPSED && (
                          <button
                            type="button"
                            onClick={() => setShowAllFilterSizes((v) => !v)}
                            className="card-action"
                          >
                            {showAllFilterSizes
                              ? t('equipment.filters.showFewer')
                              : t('equipment.filters.showAll', { count: quickAddCandidates.length })}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={openCreateFilter}
                          style={{ fontSize: '11px' }}
                          className="rounded-full border border-border px-2 py-0.5 font-medium text-fg-muted hover:text-fg-strong"
                        >
                          Custom…
                        </button>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ── Service history tab ── */}
          {activeTab === 'service-history' && id && <EquipmentServiceHistoryTab equipmentId={id} />}

          {/* ── Media tab ── Photos + Videos galleries */}
          {activeTab === 'media' && (
            <div className="flex flex-col gap-4">
              {/* Header — counts + one shared "Add media" control */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-fg-muted">
                  {images.length + videos.length} items · {images.length} photos · {videos.length} videos
                </span>
                <span className="flex-1" />
                <Button outline size="xs" onClick={() => setIsMediaUploadOpen(true)}>
                  <PlusIcon className="size-4" />
                  Add media
                </Button>
              </div>

              {imagesError ? (
                <Callout kind="danger">
                  {t('equipment.images.errorLoading')}: {(imagesError as Error).message}
                </Callout>
              ) : imagesLoading ? (
                <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">{t('equipment.images.loading')}</div>
              ) : (
                <>
                  {/* Photos gallery — profile photo first, marked "Profile". */}
                  <Card
                    title={<CardTitle>{t('equipment.tabs.photos')}</CardTitle>}
                    action={<span className="text-[11px] text-fg-dim">{images.length}</span>}
                    padding="none"
                  >
                    {images.length === 0 ? (
                      <div className="px-3.5 py-10 text-center text-[12px] text-fg-muted">{t('equipment.images.empty')}</div>
                    ) : (
                      <div
                        className="grid gap-3 p-3"
                        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
                      >
                        {orderedImages.map((img, i) => (
                          <div
                            key={img.id}
                            className={`group relative overflow-hidden rounded-lg ring-1 ${
                              img.isProfile
                                ? 'ring-[color-mix(in_oklch,var(--accent-500)_45%,var(--border))]'
                                : 'ring-border'
                            }`}
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
                            {img.isProfile ? (
                              // The profile photo leads the gallery — labeled, no set-profile control.
                              <span
                                className="absolute left-1 top-1 rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.04em] text-white"
                                style={{ background: 'var(--accent-500)' }}
                              >
                                Profile
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleSetProfileImage(img)}
                                aria-label={t('equipment.images.setAsProfile')}
                                title={t('equipment.images.setAsProfile')}
                                className="absolute left-1 top-1 flex size-8 items-center justify-center rounded-full bg-bg-elev/80 backdrop-blur transition-colors hover:bg-bg-elev"
                              >
                                <StarIconOutline className="size-5 text-fg-muted hover:text-amber-500" />
                              </button>
                            )}
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
                            {(img.caption || img.uploadedByName || img.createdAt) && (
                              <div className="border-t border-border bg-bg-elev px-2 py-1">
                                {img.caption && (
                                  <div className="line-clamp-1 text-[11px] text-fg-strong">{img.caption}</div>
                                )}
                                {(img.uploadedByName || img.createdAt) && (
                                  <div className="truncate text-[10px] text-fg-muted">
                                    {[img.uploadedByName, formatTimestamp(img.createdAt)].filter(Boolean).join(' · ')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Videos gallery */}
                  <Card
                    title={<CardTitle>{t('equipment.tabs.videos')}</CardTitle>}
                    action={<span className="text-[11px] text-fg-dim">{videos.length}</span>}
                    padding="none"
                  >
                    <div className="p-3">
                      {id && (
                        <EquipmentVideosSection
                          equipmentId={id}
                          hideUpload
                          onOpenVideo={(i) => setLightboxIndex(videoIndexOffset + i)}
                        />
                      )}
                    </div>
                  </Card>
                </>
              )}
            </div>
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

      <EquipmentMediaUploadDialog
        isOpen={isMediaUploadOpen}
        onClose={() => setIsMediaUploadOpen(false)}
        equipmentId={id!}
        defaultSetProfile={images.length === 0}
      />

      <EquipmentMediaLightbox
        equipmentId={id!}
        items={mediaItems}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
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

interface MediaPeekItem {
  id: string;
  thumb: string | null;
  alt: string;
  label: string;
  isVideo?: boolean;
  durationSeconds?: number | null;
  // Position in the combined media gallery (photos then videos) → opens the
  // lightbox at this item.
  mediaIndex: number;
}

/**
 * One tile in the overview Media peek row. The profile photo (`hero`) is a wider
 * accent-ringed source-of-truth tile (aspect-square, which anchors the row
 * height); the gallery thumbs stretch to match it. Videos get a play badge +
 * duration; a label rides a bottom gradient; `overflow` paints a "+N" cover on
 * the last tile. `square` makes a tile self-size when there's no hero anchor.
 */
// Compact peek tile — fixed 100px-tall thumbnail for the overview Media glance.
// The lead/profile tile is a touch wider (and accent-ringed); the rest are
// 100px squares. `object-cover` crops to fill (never distorts). Play badge,
// duration, and label caption are kept but shrunk — big browsing belongs to
// the Media tab.
function MediaPeekTile({
  thumb,
  alt,
  label,
  isVideo = false,
  durationSeconds,
  hero = false,
  overflow = 0,
  onClick,
}: {
  thumb: string | null;
  alt: string;
  label: string;
  isVideo?: boolean;
  durationSeconds?: number | null;
  hero?: boolean;
  overflow?: number;
  onClick: () => void;
}) {
  const showLabel = !overflow && (label || (isVideo && durationSeconds != null));
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={alt}
      className={[
        'group relative block h-[100px] shrink-0 overflow-hidden rounded-md bg-bg-elev-2 ring-1',
        hero ? 'w-[128px] ring-[color-mix(in_oklch,var(--accent-500)_45%,var(--border))]' : 'w-[100px] ring-border',
      ].join(' ')}
    >
      {thumb ? (
        <img src={thumb} alt={alt} loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-fg-dim">
          {isVideo ? <VideoCameraIcon className="size-5" /> : <PhotoIcon className="size-5" />}
        </span>
      )}

      {isVideo && !overflow && (
        <span className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="grid size-6 place-items-center rounded-full bg-black/55 ring-1 ring-inset ring-white/25">
            <PlayIcon className="size-3 translate-x-px text-white" />
          </span>
        </span>
      )}

      {hero && (
        <span
          className="absolute left-1 top-1 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-white"
          style={{ background: 'var(--accent-500)' }}
        >
          Profile
        </span>
      )}

      {overflow ? (
        <span className="absolute inset-0 grid place-items-center bg-black/55 text-[13px] font-bold text-white">
          +{overflow}
        </span>
      ) : showLabel ? (
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/65 to-transparent px-1 pb-0.5 pt-2.5 text-[9px] font-semibold text-white">
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          {isVideo && durationSeconds != null && (
            <span className="shrink-0 font-mono tabular-nums">{formatDuration(durationSeconds)}</span>
          )}
        </span>
      ) : null}
    </button>
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
