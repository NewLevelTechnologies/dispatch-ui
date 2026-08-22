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
import { useTranslation } from '@dispatch/i18n';
import {
  customerApi,
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  equipmentCategoryFieldsApi,
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
} from '../api/setup';
import { workOrdersListQueryOptions } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { useUrlTab } from '../hooks/useUrlTab';
import { showSuccess, showError, extractApiError } from '../lib/toast';
import { formatTimestamp } from '@dispatch/utils';
import { formatFilterSize } from '../utils/formatFilterSize';
import { titleCaseAddress } from '../utils/titleCaseAddress';
import { parseAttributes, buildAttributes, formatSpecValue } from '../utils/equipmentAttributes';
import { SpecFieldInput } from '../components/EquipmentSpecFields';
import AppLayout from '../components/AppLayout';
import { Card } from '../components/catalyst/card';
import { Heading } from '../components/catalyst/heading';
import { Button } from '../components/catalyst/button';
import { Field, Label } from '../components/catalyst/fieldset';
import { Input } from '../components/catalyst/input';
import { Select } from '../components/catalyst/select';
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
import { LoadingState } from '../components/ui/LoadingState';
import { DenseTable, DenseTHead, DenseRow } from '../components/ui/DenseTable';
import { AssignedUsersCell } from '../components/ui/AssignedUsersCell';
import { WorkOrderTypePill } from '../components/ui/WorkOrderTypePill';
import IconButton from '../components/IconButton';
import ConfirmDialog from '../components/ConfirmDialog';
import EditableField from '../components/EditableField';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import EquipmentFilterFormDialog from '../components/EquipmentFilterFormDialog';
import EquipmentMediaUploadDialog from '../components/EquipmentMediaUploadDialog';
import NotesCard from '../components/NotesCard';
import EquipmentServiceHistoryTab from '../components/EquipmentServiceHistoryTab';
import EquipmentVideosSection from '../components/EquipmentVideosSection';
import EquipmentDocumentsSection from '../components/EquipmentDocumentsSection';
import EquipmentMediaLightbox, { type MediaLightboxItem } from '../components/EquipmentMediaLightbox';
// Card title + quiet "View all" affordance — reused from the customer-detail
// chrome so equipment cards match the other redesigned detail pages exactly.
import { CardTitle, CardLink } from '../components/customer-detail/shared';
import {
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FunnelIcon,
  MapPinIcon,
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

// Warranty coverage from the expiry date. Module-scope (not the render body) so
// the clock read stays out of the component's pure path — same as formatInstalled.
function warrantyState(iso: string | null | undefined): { has: boolean; active: boolean } {
  if (!iso) return { has: false, active: false };
  const exp = new Date(iso);
  if (Number.isNaN(exp.getTime())) return { has: false, active: false };
  return { has: true, active: exp.getTime() >= new Date().getTime() };
}

// Header identity inline-edit draft — everything shown in the header strip +
// pills: name, type/category (cascading), make/model/serial/asset/install.
// Warranty lives in its own card. Type/Category edit here too; changing category
// runs the spec-carry guard inline (see the header edit block).
interface IdentityDraft {
  name: string;
  equipmentTypeId: string;
  equipmentCategoryId: string;
  make: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  installDate: string;
}
function seedIdentity(eq: Equipment): IdentityDraft {
  return {
    name: eq.name ?? '',
    equipmentTypeId: eq.equipmentTypeId ?? '',
    equipmentCategoryId: eq.equipmentCategoryId ?? '',
    make: eq.make ?? '',
    model: eq.model ?? '',
    serialNumber: eq.serialNumber ?? '',
    assetTag: eq.assetTag ?? '',
    installDate: eq.installDate ?? '',
  };
}

// Warranty card inline-edit draft.
interface WarrantyDraft {
  warrantyExpiresAt: string;
  warrantyLaborExpiresAt: string;
  warrantyDetails: string;
}
function seedWarranty(eq: Equipment): WarrantyDraft {
  // Slice to yyyy-MM-dd so the values seat in <input type="date"> regardless of
  // whether the API hands back a date or a full ISO datetime.
  return {
    warrantyExpiresAt: (eq.warrantyExpiresAt ?? '').slice(0, 10),
    warrantyLaborExpiresAt: (eq.warrantyLaborExpiresAt ?? '').slice(0, 10),
    warrantyDetails: eq.warrantyDetails ?? '',
  };
}

// "Installed Mar 2020 (6 years)" for the header identity strip. Age in whole
// years; under a year drops the suffix. Null when there's no install date.
function formatInstalled(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const my = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;
  return `Installed ${my}${years >= 1 ? ` (${years} ${years === 1 ? 'year' : 'years'})` : ''}`;
}

// "Mar 2030" — compact month/year for the Specs Installed row + warranty lines.
function monthYear(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
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
  const [retireConfirm, setRetireConfirm] = useState(false);
  // Destructive confirms — Catalyst ConfirmDialog, never the native window.confirm.
  const [equipmentDeleteConfirm, setEquipmentDeleteConfirm] = useState(false);
  const [filterToDelete, setFilterToDelete] = useState<EquipmentFilter | null>(null);
  const [imageToDelete, setImageToDelete] = useState<EquipmentImage | null>(null);
  // Header identity — a visible "Edit" flips the header into an inline edit block
  // (name + type/category cascade + make/model/serial/asset/install). Warranty is
  // its own card. Draft is null until editing starts.
  const [identityEditing, setIdentityEditing] = useState(false);
  const [identityDraft, setIdentityDraft] = useState<IdentityDraft | null>(null);
  const [warrantyEditing, setWarrantyEditing] = useState(false);
  const [warrantyDraft, setWarrantyDraft] = useState<WarrantyDraft | null>(null);
  // On-site location — inline edit in the Located-at card (explicit Edit link).
  const [editOnSite, setEditOnSite] = useState(false);
  const [onSiteDraft, setOnSiteDraft] = useState('');
  const [savingOnSite, setSavingOnSite] = useState(false);

  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ['equipment-detail', id],
    queryFn: () => equipmentApi.getById(id!),
    enabled: !!id,
  });

  // Type → Category cascade + the draft category's fields (for the inline
  // spec-carry guard). Fetched only while editing the header identity.
  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
    enabled: identityEditing,
  });
  const { data: editCategories = [] } = useQuery({
    queryKey: ['equipment-categories', identityDraft?.equipmentTypeId ?? ''],
    queryFn: () => equipmentCategoriesApi.getAll(identityDraft?.equipmentTypeId || undefined),
    enabled: identityEditing && Boolean(identityDraft?.equipmentTypeId),
  });
  const { data: draftCategoryFields = [] } = useQuery({
    queryKey: ['equipment-category-fields', identityDraft?.equipmentCategoryId ?? ''],
    queryFn: () => equipmentCategoryFieldsApi.getAll(identityDraft!.equipmentCategoryId),
    enabled: identityEditing && Boolean(identityDraft?.equipmentCategoryId),
  });

  // Service location (Located-at card + back-link). Equipment carries only
  // serviceLocationId; the new-WO button prefills intake with it.
  const { data: serviceLocation } = useQuery({
    queryKey: ['service-location', equipment?.serviceLocationId ?? ''],
    queryFn: () => customerApi.getServiceLocationById(equipment!.serviceLocationId),
    enabled: Boolean(equipment?.serviceLocationId),
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

  // Documents — manuals/spec sheets/warranties (kind DOCUMENT). Page-level read
  // for the Files-tab count; EquipmentDocumentsSection shares the same query key.
  const { data: documentsData } = useQuery({
    queryKey: ['equipment-files', id, 'DOCUMENT'] as const,
    queryFn: () => equipmentFilesApi.list(id!, { kind: 'DOCUMENT', limit: 100 }),
    enabled: !!id,
  });
  const documents = documentsData?.content ?? [];

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
  // Nameplate role — settable AND clearable (a wrongly-tagged photo must be
  // fixable, and an equipment can legitimately have no nameplate shot). Setting
  // it true server-side clears any other nameplate (one image per role);
  // independent of isProfile.
  const setNameplateImageMutation = useMutation({
    mutationFn: ({ imageId, value }: { imageId: string; value: boolean }) =>
      equipmentImagesApi.patch(id!, imageId, { isNameplate: value }),
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
    if (equipment) setEquipmentDeleteConfirm(true);
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

  // ── Header identity inline edit ──
  const setId = (patch: Partial<IdentityDraft>) =>
    setIdentityDraft((d) => (d ? { ...d, ...patch } : d));
  const beginIdentityEdit = () => {
    setIdentityDraft(seedIdentity(equipment!));
    setIdentityEditing(true);
  };
  // PATCH name/type/category/make/model/serial/asset/install. Attributes are NOT
  // sent here: the Specs card serializes only the current category's keys, so
  // stale specs drop on its next save; sending attributes on a category change
  // could trip the new category's required-field validation.
  const identitySave = useMutation({
    mutationFn: () => {
      const d = identityDraft!;
      return equipmentApi.update(id!, {
        name: d.name.trim(),
        equipmentTypeId: d.equipmentTypeId || null,
        equipmentCategoryId: d.equipmentCategoryId || null,
        make: d.make.trim() || null,
        model: d.model.trim() || null,
        serialNumber: d.serialNumber.trim() || null,
        assetTag: d.assetTag.trim() || null,
        installDate: d.installDate || null,
      });
    },
    onSuccess: () => {
      invalidateEquipmentRelatedCaches();
      setIdentityEditing(false);
      showSuccess(t('common.form.successUpdate', { entity: getName('equipment'), defaultValue: 'Equipment updated' }));
    },
    onError: (err) =>
      showError(t('common.form.errorUpdate', { entity: getName('equipment') }), extractApiError(err) ?? undefined),
  });
  const identityDirty =
    !!identityDraft && !!equipment && JSON.stringify(identityDraft) !== JSON.stringify(seedIdentity(equipment));
  // Inline spec-carry guard: when the draft category differs from the saved one,
  // existing spec keys that aren't in the new category's field set fall away
  // (kept keys carry; the drop happens on the next Specs save).
  const identityCategoryChanged =
    !!identityDraft && !!equipment && identityDraft.equipmentCategoryId !== (equipment.equipmentCategoryId ?? '');
  const droppedSpecKeys = identityCategoryChanged
    ? Object.keys(parseAttributes(equipment?.attributes)).filter(
        (k) => !draftCategoryFields.some((f) => f.fieldKey === k)
      )
    : [];

  // ── Warranty card inline edit ──
  const warrantySave = useMutation({
    mutationFn: () => {
      const d = warrantyDraft!;
      return equipmentApi.update(id!, {
        warrantyExpiresAt: d.warrantyExpiresAt || null,
        warrantyLaborExpiresAt: d.warrantyLaborExpiresAt || null,
        warrantyDetails: d.warrantyDetails.trim() || null,
      });
    },
    onSuccess: () => {
      invalidateEquipmentRelatedCaches();
      setWarrantyEditing(false);
      showSuccess(t('common.form.successUpdate', { entity: getName('equipment'), defaultValue: 'Equipment updated' }));
    },
    onError: (err) =>
      showError(t('common.form.errorUpdate', { entity: getName('equipment') }), extractApiError(err) ?? undefined),
  });
  const setW = (patch: Partial<WarrantyDraft>) => setWarrantyDraft((d) => (d ? { ...d, ...patch } : d));
  const beginWarrantyEdit = () => {
    setWarrantyDraft(seedWarranty(equipment!));
    setWarrantyEditing(true);
  };
  const warrantyDirty =
    !!warrantyDraft && !!equipment && JSON.stringify(warrantyDraft) !== JSON.stringify(seedWarranty(equipment));

  // ── Specs — the category's custom fields, card-level inline edit (PATCH the
  // full `attributes` object). Shares the cache key with the form + settings. ──
  const { data: specFields = [] } = useQuery({
    queryKey: ['equipment-category-fields', equipment?.equipmentCategoryId ?? ''],
    queryFn: () => equipmentCategoryFieldsApi.getAll(equipment!.equipmentCategoryId!),
    enabled: Boolean(equipment?.equipmentCategoryId),
  });
  const [specEditing, setSpecEditing] = useState(false);
  const [specDraft, setSpecDraft] = useState<Record<string, string>>({});
  const specValuesView = parseAttributes(equipment?.attributes);
  const specSave = useMutation({
    mutationFn: () => equipmentApi.update(id!, { attributes: buildAttributes(specFields, specDraft) }),
    onSuccess: () => {
      invalidateEquipmentRelatedCaches();
      setSpecEditing(false);
      showSuccess(t('common.form.successUpdate', { entity: getName('equipment'), defaultValue: 'Equipment updated' }));
    },
    onError: (err) =>
      showError(t('common.form.errorUpdate', { entity: getName('equipment') }), extractApiError(err) ?? undefined),
  });
  const specDirty = specEditing && JSON.stringify(specDraft) !== JSON.stringify(specValuesView);
  const specRequiredMissing = specFields.some(
    (f) => f.required && f.dataType !== 'BOOLEAN' && !(specDraft[f.fieldKey] ?? '').trim()
  );

  if (isLoading) {
    return (
      <AppLayout>
        <LoadingState label={t('common.actions.loadingEntity', { entity: getName('equipment') })} />
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
  // Single classification pill = Type · Category (the hierarchy), per the mock.
  const typeLabel = [equipment.equipmentTypeName, equipment.equipmentCategoryName].filter(Boolean).join(' · ') || null;
  // "Open work order" — the only live status, derived from the WO list (any WO
  // that isn't completed/cancelled). Not a stored equipment field.
  const openWo = (serviceHistoryData?.content ?? []).find(
    (wo) => wo.progressCategory !== 'COMPLETED' && wo.progressCategory !== 'CANCELLED'
  );
  const { has: hasWarranty, active: underWarranty } = warrantyState(equipment.warrantyExpiresAt);
  const laborWarranty = warrantyState(equipment.warrantyLaborExpiresAt);
  const totalMedia = images.length + videos.length;
  const totalFiles = totalMedia + documents.length;

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: t('equipment.tabs.overview') },
    { id: 'service-history', label: t('equipment.tabs.serviceHistory'), count: serviceHistoryData?.totalElements ?? 0 },
    { id: 'media', label: t('equipment.tabs.files'), count: totalFiles },
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
  const handleDeleteFilter = (f: EquipmentFilter) => setFilterToDelete(f);
  const handleSetProfileImage = (img: EquipmentImage) => {
    if (!img.isProfile) setProfileImageMutation.mutate(img.id);
  };
  const handleToggleNameplate = (img: EquipmentImage) => {
    setNameplateImageMutation.mutate({ imageId: img.id, value: !img.isNameplate });
  };
  const handleEditCaption = (img: EquipmentImage) => {
    const next = window.prompt(t('equipment.images.newCaption'), img.caption ?? '');
    if (next === null) return;
    updateCaptionMutation.mutate({ imageId: img.id, caption: next.trim() || null });
  };
  const handleDeleteImage = (img: EquipmentImage) => setImageToDelete(img);

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
      isNameplate: p.isNameplate,
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

          {/* Header — identity lives here (name + type/category pills + a
              read-only strip of make/model/serial/asset/install + derived
              warranty chip). A visible "Edit" flips it into an inline edit block
              (edit-where-you-see-it, like Location/Customer). "Advanced edit" in
              the ⋯ is an optional convenience, not the only path. */}
          <div className="mb-3 rounded-[10px] border border-border bg-bg-elev px-4 py-3.5 shadow-sm">
            {identityEditing && identityDraft ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (identityDraft.name.trim()) identitySave.mutate();
                }}
              >
                {/* Tight 2-line layout (matches the mock): thumbnail · name · actions
                    on the first line; type/category/make/model/serial/installed in one
                    horizontal field row on the second. */}
                <div className="flex items-start gap-3.5">
                  <EquipmentThumbnail
                    url={equipment.profileImageUrl}
                    name={t('equipment.detail.profileImageAlt', { name: equipment.name })}
                    category={equipment.equipmentCategoryName}
                    type={equipment.equipmentTypeName}
                    monogram
                    sizeClass="size-[52px]"
                    fit="contain"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                      Edit equipment
                    </div>
                    <Input
                      autoFocus
                      aria-label={t('common.form.name')}
                      placeholder={t('common.form.name')}
                      value={identityDraft.name}
                      onChange={(e) => setId({ name: e.target.value })}
                      className="[&_input]:!text-[15px] [&_input]:!font-semibold"
                    />
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      <Field size="xs" className="w-[7rem]">
                        <Label size="xs">{t('equipment.form.type')}</Label>
                        <Select
                          value={identityDraft.equipmentTypeId}
                          onChange={(e) => setId({ equipmentTypeId: e.target.value, equipmentCategoryId: '' })}
                          aria-label={t('equipment.form.type')}
                        >
                          <option value="">{t('common.none')}</option>
                          {equipmentTypes.map((ty) => (
                            <option key={ty.id} value={ty.id}>{ty.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field size="xs" className="w-[8.5rem]">
                        <Label size="xs">{t('equipment.form.category')}</Label>
                        <Select
                          value={identityDraft.equipmentCategoryId}
                          onChange={(e) => setId({ equipmentCategoryId: e.target.value })}
                          disabled={!identityDraft.equipmentTypeId}
                          aria-label={t('equipment.form.category')}
                        >
                          <option value="">{identityDraft.equipmentTypeId ? t('common.none') : 'Pick a type first'}</option>
                          {editCategories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </Select>
                      </Field>
                      <Field size="xs" className="w-[7.5rem]">
                        <Label size="xs">{t('equipment.form.make')}</Label>
                        <Input size="xs" value={identityDraft.make} onChange={(e) => setId({ make: e.target.value })} />
                      </Field>
                      <Field size="xs" className="w-[7.5rem]">
                        <Label size="xs">{t('equipment.form.model')}</Label>
                        <Input size="xs" value={identityDraft.model} onChange={(e) => setId({ model: e.target.value })} />
                      </Field>
                      <Field size="xs" className="w-[8rem]">
                        <Label size="xs">{t('equipment.form.serialNumber')}</Label>
                        <Input size="xs" className="font-mono" value={identityDraft.serialNumber} onChange={(e) => setId({ serialNumber: e.target.value })} />
                      </Field>
                      <Field size="xs" className="w-[9rem]">
                        <Label size="xs">{t('equipment.form.installDate')}</Label>
                        <Input size="xs" type="date" value={identityDraft.installDate} onChange={(e) => setId({ installDate: e.target.value })} />
                      </Field>
                    </div>
                    {/* Inline spec-carry guard on category change. */}
                    {identityCategoryChanged && droppedSpecKeys.length > 0 && (
                      <div
                        className="mt-2.5 rounded-[7px] px-2.5 py-2 text-[11.5px] text-warning-fg"
                        style={{
                          background: 'color-mix(in oklch, var(--warning-500) 9%, var(--bg-elev))',
                          border: '1px solid color-mix(in oklch, var(--warning-500) 35%, var(--border))',
                        }}
                      >
                        Changing the category clears {droppedSpecKeys.length} spec value
                        {droppedSpecKeys.length === 1 ? '' : 's'} that don’t apply to the new category; matching fields are kept.
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button plain size="xs" type="button" onClick={() => setIdentityEditing(false)} disabled={identitySave.isPending}>
                      {t('common.cancel')}
                    </Button>
                    <Button
                      color="accent"
                      size="xs"
                      type="submit"
                      disabled={!identityDirty || !identityDraft.name.trim() || identitySave.isPending}
                    >
                      {identitySave.isPending ? t('common.saving') : t('common.update')}
                    </Button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3.5">
                <EquipmentThumbnail
                  url={equipment.profileImageUrl}
                  name={t('equipment.detail.profileImageAlt', { name: equipment.name })}
                  category={equipment.equipmentCategoryName}
                  type={equipment.equipmentTypeName}
                  monogram
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
                  {/* Identity strip — read-only meta line of universal facts only
                      (make/model · serial · installed). "Location on site" is NOT
                      here — it lives in the Located-at card. Edit via the header
                      "Edit". Renders only populated items.

                      The "·" is a trailing separator glued to the END of each
                      non-last fact (inside its own non-wrapping flex span), so when
                      the row wraps a fact always leads with its own text — never an
                      orphaned bullet at the start of a line. */}
                  {(() => {
                    const items: React.ReactNode[] = [];
                    if (equipment.make || equipment.model) {
                      items.push(
                        <span>
                          {equipment.make}
                          {equipment.make && equipment.model ? ' ' : ''}
                          {equipment.model}
                        </span>
                      );
                    }
                    if (equipment.serialNumber) {
                      items.push(<span>SN <span className="font-mono">{equipment.serialNumber}</span></span>);
                    }
                    const installed = formatInstalled(equipment.installDate);
                    if (installed) items.push(<span>{installed}</span>);
                    if (items.length === 0) return null;
                    return (
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-fg-muted">
                        {items.map((node, i) => (
                          <span key={i} className="flex items-center gap-x-2">
                            {node}
                            {i < items.length - 1 && (
                              <span className="text-fg-dim" aria-hidden="true">·</span>
                            )}
                          </span>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                <div className="flex items-center gap-1.5 max-sm:w-full sm:flex-shrink-0">
                  <Button
                    outline
                    size="xs"
                    onClick={() => navigate(`/work-orders/new?locationId=${equipment.serviceLocationId}`)}
                    aria-label={t('common.actions.new', { entity: getName('work_order') })}
                  >
                    <PlusIcon className="size-4" />
                    <span className="relative top-[0.5px] hidden sm:inline">
                      {t('common.actions.new', { entity: getName('work_order') })}
                    </span>
                  </Button>
                  <Button outline size="xs" onClick={beginIdentityEdit} aria-label="Edit equipment details">
                    {t('common.edit')}
                  </Button>
                  <Dropdown>
                    <DropdownButton as={IconButton} aria-label={t('common.moreOptions')} className="max-sm:p-2">
                      <EllipsisVerticalIcon className="size-4" />
                    </DropdownButton>
                    <DropdownMenu anchor="bottom end">
                      {/* Optional convenience — change several things at once. */}
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
            )}
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

                {/* Media peek — a single row that fills the column: a 1.4fr profile
                    tile + four 1fr gallery squares (CSS grid, like the mock). Tiles
                    are fluid (~110px square at the standard rail), not fixed thumbs;
                    the full browsing gallery is the Media tab. "+N" overlays the last tile. */}
                <Card
                  title={<CardTitle icon={<PhotoIcon className="size-3.5" />}>{t('equipment.tabs.media')}</CardTitle>}
                  action={totalMedia > 0 ? <CardLink onClick={goToMedia}>{t('common.viewAll')} {totalMedia} →</CardLink> : undefined}
                >
                  {totalMedia === 0 ? (
                    <p className="text-[12px] text-fg-muted">No photos or videos yet</p>
                  ) : (
                    <div
                      className="grid gap-1.5"
                      style={{ gridTemplateColumns: profilePhoto ? '1.4fr repeat(4, 1fr)' : 'repeat(5, 1fr)' }}
                    >
                      {/* Every tile opens the combined lightbox at its item —
                          photos and videos arrow together from there. */}
                      {profilePhoto && (
                        <MediaPeekTile
                          onClick={() => setLightboxIndex(0)}
                          thumb={profilePhoto.thumbnailUrl ?? profilePhoto.url}
                          alt={profilePhoto.caption ?? equipment.name}
                          label="Profile"
                          isNameplate={profilePhoto.isNameplate}
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
                          isNameplate={m.isNameplate}
                          isVideo={m.isVideo}
                          durationSeconds={m.durationSeconds}
                          overflow={i === peekShown.length - 1 ? peekOverflow : 0}
                        />
                      ))}
                    </div>
                  )}
                </Card>

                {/* Notes — shared NotesCard (pinned + 3 recent, "Show all" drawer). */}
                <NotesCard entityType="equipment" entityId={id!} />

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
                    className="text-[13px] font-semibold text-fg-accent hover:underline"
                  >
                    {locationLabel}
                  </RouterLink>
                  {serviceLocation && (
                    <div className="mt-0.5 text-[11.5px] text-fg-muted">
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
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-accent">
                        {t('equipment.form.locationOnSite')}
                      </div>
                      {!editOnSite && (
                        <CardLink
                          ariaLabel="Edit on-site location"
                          onClick={() => {
                            setOnSiteDraft(equipment.locationOnSite ?? '');
                            setEditOnSite(true);
                          }}
                        >
                          {t('common.edit')}
                        </CardLink>
                      )}
                    </div>
                    {editOnSite ? (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <Input
                          size="xs"
                          autoFocus
                          value={onSiteDraft}
                          onChange={(e) => setOnSiteDraft(e.target.value)}
                          aria-label={t('equipment.form.locationOnSite')}
                        />
                        <Button plain size="xs" type="button" onClick={() => setEditOnSite(false)} disabled={savingOnSite}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          color="accent"
                          size="xs"
                          type="button"
                          disabled={savingOnSite}
                          onClick={async () => {
                            setSavingOnSite(true);
                            try {
                              await handleSaveField('locationOnSite', onSiteDraft.trim() || null);
                              setEditOnSite(false);
                            } catch {
                              /* handleSaveField surfaced the error; stay in edit. */
                            } finally {
                              setSavingOnSite(false);
                            }
                          }}
                        >
                          {savingOnSite ? t('common.saving') : t('common.update')}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[12.5px] text-fg-strong">{equipment.locationOnSite || '—'}</div>
                    )}
                  </div>
                </Card>

                {/* Specs — the category's custom fields (tonnage, refrigerant,
                    voltage, …) + the warranty sub-block. Identity (make/model/serial)
                    and install/age live in the header strip, not here (dedup). The
                    custom-field *values* edit via this card's "Edit"; warranty edits
                    inline in its tinted sub-block. The card always renders so warranty
                    has a home even when the category defines no custom fields. */}
                <Card
                  title={<CardTitle>Specs</CardTitle>}
                  action={
                    specFields.length > 0 && !specEditing ? (
                      <CardLink
                        ariaLabel="Edit specs"
                        onClick={() => {
                          setSpecDraft(parseAttributes(equipment.attributes));
                          setSpecEditing(true);
                        }}
                      >
                        {t('common.edit')}
                      </CardLink>
                    ) : undefined
                  }
                  footer={
                    specEditing ? (
                      <div className="flex items-center justify-end gap-1.5 rounded-b-[10px] border-t border-border-soft bg-bg-elev-2 px-3.5 py-2.5">
                        <Button plain size="xs" type="button" onClick={() => setSpecEditing(false)} disabled={specSave.isPending}>
                          {t('common.cancel')}
                        </Button>
                        <Button
                          color="accent"
                          size="xs"
                          type="button"
                          onClick={() => specSave.mutate()}
                          disabled={!specDirty || specRequiredMissing}
                        >
                          {specSave.isPending ? t('common.saving') : t('common.update')}
                        </Button>
                      </div>
                    ) : undefined
                  }
                >
                  {specEditing ? (
                    /* Edit mode owns the custom-field *values* only — identity +
                       install live in the header, warranty in its own sub-block. */
                    <div className="flex flex-col gap-2.5">
                      {specFields.map((f) => (
                        <SpecFieldInput
                          key={f.id}
                          field={f}
                          value={specDraft[f.fieldKey] ?? ''}
                          onChange={(v) => setSpecDraft((d) => ({ ...d, [f.fieldKey]: v }))}
                        />
                      ))}
                    </div>
                  ) : (
                    <>
                      {specFields.length > 0 && (
                        <FieldGrid>
                          {specFields.map((f) => (
                            <FieldRow key={f.id} label={f.label}>
                              {formatSpecValue(f, specValuesView[f.fieldKey])}
                            </FieldRow>
                          ))}
                        </FieldGrid>
                      )}

                      {/* Warranty — drives money decisions, so it lives in the
                          reference table with its own inline edit. Success-tinted
                          while parts are covered; neutral once expired. */}
                      <div
                        className="mt-3 rounded-[8px] px-3 py-2.5"
                        style={
                          underWarranty
                            ? {
                                background: 'color-mix(in oklch, var(--success-500) 7%, var(--bg-elev))',
                                border: '1px solid color-mix(in oklch, var(--success-500) 22%, var(--border))',
                              }
                            : { background: 'var(--bg-elev-2)', border: '1px solid var(--border-soft)' }
                        }
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <div
                            className="text-[10.5px] font-semibold uppercase tracking-[0.08em]"
                            style={{ color: underWarranty ? 'var(--success-600)' : 'var(--fg-muted)' }}
                          >
                            Warranty
                          </div>
                          {!warrantyEditing && (
                            <CardLink ariaLabel="Edit warranty" onClick={beginWarrantyEdit}>
                              {t('common.edit')}
                            </CardLink>
                          )}
                        </div>

                        {warrantyEditing && warrantyDraft ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <Field>
                              <Label>Parts covered through</Label>
                              <Input
                                type="date"
                                value={warrantyDraft.warrantyExpiresAt}
                                onChange={(e) => setW({ warrantyExpiresAt: e.target.value })}
                              />
                            </Field>
                            <Field>
                              <Label>Labor covered through</Label>
                              <Input
                                type="date"
                                value={warrantyDraft.warrantyLaborExpiresAt}
                                onChange={(e) => setW({ warrantyLaborExpiresAt: e.target.value })}
                              />
                            </Field>
                            <Field>
                              <Label>{t('equipment.form.warrantyDetails')}</Label>
                              <Input
                                value={warrantyDraft.warrantyDetails}
                                onChange={(e) => setW({ warrantyDetails: e.target.value })}
                              />
                            </Field>
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                plain
                                size="xs"
                                type="button"
                                onClick={() => setWarrantyEditing(false)}
                                disabled={warrantySave.isPending}
                              >
                                {t('common.cancel')}
                              </Button>
                              <Button
                                color="accent"
                                size="xs"
                                type="button"
                                onClick={() => warrantySave.mutate()}
                                disabled={!warrantyDirty}
                              >
                                {warrantySave.isPending ? t('common.saving') : t('common.update')}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1">
                            <div className="text-[12px] text-fg-strong">
                              {hasWarranty
                                ? `Parts ${underWarranty ? 'thru' : 'expired'} ${monthYear(equipment.warrantyExpiresAt)}`
                                : 'Parts —'}
                            </div>
                            {laborWarranty.has && (
                              <div className="text-[12px] text-fg-muted">
                                {`Labor ${laborWarranty.active ? 'thru' : 'expired'} ${monthYear(equipment.warrantyLaborExpiresAt)}`}
                              </div>
                            )}
                            {equipment.warrantyDetails && (
                              <div className="mt-1 text-[11px] text-fg-muted">{equipment.warrantyDetails}</div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </Card>

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
              {/* Header — counts + one shared "Add files" control */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-fg-muted">
                  {totalFiles} items · {images.length} photos · {videos.length} videos · {documents.length} docs
                </span>
                <span className="flex-1" />
                <Button outline size="xs" onClick={() => setIsMediaUploadOpen(true)}>
                  <PlusIcon className="size-4" />
                  Add files
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
                            {/* Top-left is labels only — the role badge(s). Profile and
                                Nameplate are independent flags, so both can show side by
                                side (wrap if the tile is narrow). Always visible; the
                                actions live top-right. */}
                            {(img.isProfile || img.isNameplate) && (
                              <div className="absolute left-1 top-1 flex flex-wrap items-start gap-1">
                                {img.isProfile && (
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.04em] text-white"
                                    style={{ background: 'var(--accent-500)' }}
                                  >
                                    Profile
                                  </span>
                                )}
                                {img.isNameplate && (
                                  <span
                                    className="rounded px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-[0.04em] text-white"
                                    style={{ background: 'var(--accent-500)' }}
                                  >
                                    Nameplate
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Top-right: actions, clustered + hover/focus-reveal so they
                                don't clutter the tile at rest (the role badges stay put,
                                top-left). The set-profile star is the action only — shown
                                on non-profile tiles; the PROFILE badge already conveys the
                                set state, so no star there. Set-as-nameplate is in the kebab. */}
                            <div className="absolute right-1 top-1 flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                              {!img.isProfile && (
                                <button
                                  type="button"
                                  onClick={() => handleSetProfileImage(img)}
                                  aria-label={t('equipment.images.setAsProfile')}
                                  title={t('equipment.images.setAsProfile')}
                                  className="flex size-8 items-center justify-center rounded-full bg-bg-elev/80 backdrop-blur transition-colors hover:bg-bg-elev"
                                >
                                  <StarIconOutline className="size-5 text-fg-muted hover:text-amber-500" />
                                </button>
                              )}
                              <Dropdown>
                                <DropdownButton
                                  plain
                                  aria-label={t('common.moreOptions')}
                                  className="rounded-full bg-bg-elev/80 backdrop-blur"
                                >
                                  <EllipsisVerticalIcon className="size-5" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  <DropdownItem onClick={() => handleToggleNameplate(img)}>
                                    <DropdownLabel>
                                      {img.isNameplate
                                        ? t('equipment.images.unsetNameplate')
                                        : t('equipment.images.setAsNameplate')}
                                    </DropdownLabel>
                                  </DropdownItem>
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

                  {/* Documents — manuals, spec sheets, warranties */}
                  <Card
                    title={<CardTitle>Documents</CardTitle>}
                    action={<span className="text-[11px] text-fg-dim">{documents.length}</span>}
                    padding="none"
                  >
                    <div className="p-3">{id && <EquipmentDocumentsSection equipmentId={id} />}</div>
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

      <ConfirmDialog
        isOpen={equipmentDeleteConfirm}
        onClose={() => setEquipmentDeleteConfirm(false)}
        onConfirm={() => deleteEquipmentMutation.mutate()}
        title="Delete equipment?"
        message={t('common.actions.deleteConfirm', { name: equipment.name })}
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteEquipmentMutation.isPending}
      />

      <ConfirmDialog
        isOpen={!!filterToDelete}
        onClose={() => setFilterToDelete(null)}
        onConfirm={() => filterToDelete && deleteFilterMutation.mutate(filterToDelete.id)}
        title="Delete filter?"
        message="Removes this filter size from the unit."
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteFilterMutation.isPending}
      />

      <ConfirmDialog
        isOpen={!!imageToDelete}
        onClose={() => setImageToDelete(null)}
        onConfirm={() => imageToDelete && deleteImageMutation.mutate(imageToDelete.id)}
        title="Delete photo?"
        message="Removes this photo from the unit's media."
        confirmLabel={t('common.delete')}
        isDestructive
        isPending={deleteImageMutation.isPending}
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
        <EquipmentThumbnail url={unit.profileImageUrl} name={unit.name} category={unit.equipmentCategoryName} type={unit.equipmentTypeName} monogram sizeClass="size-8" fit="contain" />
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
  isNameplate?: boolean;
  isVideo?: boolean;
  durationSeconds?: number | null;
  // Position in the combined media gallery (photos then videos) → opens the
  // lightbox at this item.
  mediaIndex: number;
}

/**
 * One tile in the overview Media peek row. Each tile is `aspect-square w-full`,
 * so it fills its grid track — the profile photo (`hero`) sits in the wider
 * 1.4fr track and is accent-ringed; the gallery thumbs fill the 1fr tracks.
 * `object-cover` crops to fill (never distorts). Videos get a play badge +
 * duration; a label rides a bottom gradient; `overflow` paints a "+N" cover on
 * the last tile. Play badge, duration, and label caption are kept but shrunk —
 * big browsing belongs to the Media tab.
 */
function MediaPeekTile({
  thumb,
  alt,
  label,
  isNameplate = false,
  isVideo = false,
  durationSeconds,
  hero = false,
  overflow = 0,
  onClick,
}: {
  thumb: string | null;
  alt: string;
  label: string;
  isNameplate?: boolean;
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
        'group relative block aspect-square w-full overflow-hidden rounded-md bg-bg-elev-2 ring-1',
        hero ? 'ring-[color-mix(in_oklch,var(--accent-500)_45%,var(--border))]' : 'ring-border',
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

      {/* Role badges, top-left — Profile (the hero tile) and/or Nameplate; both
          can show (independent flags), wrapping if the tile is tight. */}
      {(hero || isNameplate) && !overflow && (
        <span className="absolute left-1 top-1 flex flex-wrap gap-0.5">
          {hero && (
            <span
              className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-white"
              style={{ background: 'var(--accent-500)' }}
            >
              Profile
            </span>
          )}
          {isNameplate && (
            <span
              className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-[0.04em] text-white"
              style={{ background: 'var(--accent-500)' }}
            >
              Nameplate
            </span>
          )}
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
