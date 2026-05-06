import { useEffect, useState } from 'react';
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
  tenantFilterSizesApi,
  EquipmentStatus,
  EQUIPMENT_IMAGE_MAX_PER_EQUIPMENT,
  type EquipmentFilter,
  type EquipmentImage,
  type EquipmentSummary,
  type TenantFilterSize,
  type UpdateEquipmentRequest,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import TabNavigation from '../components/TabNavigation';
import EditableField from '../components/EditableField';
import EquipmentFilterFormDialog from '../components/EquipmentFilterFormDialog';
import EquipmentFormDialog from '../components/EquipmentFormDialog';
import EquipmentImageUploadDialog from '../components/EquipmentImageUploadDialog';
import EquipmentPhotoLightbox from '../components/EquipmentPhotoLightbox';
import EquipmentThumbnail from '../components/EquipmentThumbnail';
import WorkOrdersList from '../components/WorkOrdersList';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/catalyst/table';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../components/catalyst/dropdown';
import {
  ArrowLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon as StarIconOutline,
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';

type TabId = 'overview' | 'photos' | 'filters' | 'service-history' | 'components';

// Above this number of tenant filter sizes, the chip palette collapses to
// the top N by sortOrder with a "Show all" toggle. Keeps the filters tab
// header tight when a tenant has curated a long list.
const FILTER_SIZE_CHIP_COLLAPSED = 10;

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// JS Number.toString() naturally drops trailing zeros, so 20.00 → "20" and 1.5 stays "1.5".
function formatInches(n: number): string {
  return String(n);
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { key: routeKey } = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [isFilterDialogOpen, setIsFilterDialogOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<EquipmentFilter | null>(null);
  const [prefilledSize, setPrefilledSize] = useState<
    { lengthIn: number; widthIn: number; thicknessIn: number } | null
  >(null);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [showAllFilterSizes, setShowAllFilterSizes] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Fall back to the equipment list when the user landed here directly (no in-app history).
  const handleBack = () => {
    if (routeKey !== 'default') {
      navigate(-1);
    } else {
      navigate('/equipment');
    }
  };

  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ['equipment-detail', id],
    queryFn: () => equipmentApi.getById(id!),
    enabled: !!id,
  });

  // Components/Units tab is hidden when this equipment is itself a
  // sub-unit (parentId set) — the 2-level hierarchy rule means a sub-unit
  // can't have its own children. If the user had Components active and
  // then navigates to a sub-unit, fall back to Overview so we don't
  // render content for a now-hidden tab. setState in effect is intentional
  // here — we're reconciling prior state with a fetched record.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (equipment?.parentId && activeTab === 'components') {
      setActiveTab('overview');
    }
  }, [equipment?.parentId, activeTab]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Reference data for inline-editable Type / Category selects.
  const { data: equipmentTypes = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
  });

  const { data: equipmentCategories = [] } = useQuery({
    queryKey: ['equipment-categories', equipment?.equipmentTypeId ?? ''],
    queryFn: () => equipmentCategoriesApi.getAll(equipment?.equipmentTypeId ?? undefined),
    enabled: Boolean(equipment?.equipmentTypeId),
  });

  // Resolve the service location for the header breadcrumb. Equipment.serviceLocationId
  // is the only context the equipment payload carries; we fetch the location DTO so the
  // header can render the location name in the breadcrumb instead of a placeholder.
  const { data: serviceLocation } = useQuery({
    queryKey: ['service-location', equipment?.serviceLocationId ?? ''],
    queryFn: () => customerApi.getServiceLocationById(equipment!.serviceLocationId),
    enabled: Boolean(equipment?.serviceLocationId),
  });

  // Per-equipment filter list and tenant-wide common sizes for the quick-add chips.
  const { data: filters = [], isLoading: filtersLoading, error: filtersError } = useQuery({
    queryKey: ['equipment-filters', id],
    queryFn: () => equipmentFiltersApi.getAll(id!),
    enabled: !!id,
  });

  const { data: filterSizes = [] } = useQuery({
    queryKey: ['tenant-filter-sizes'],
    queryFn: () => tenantFilterSizesApi.getAll(),
  });
  const activeFilterSizes = filterSizes.filter((s) => !s.archivedAt);

  const deleteFilterMutation = useMutation({
    mutationFn: (filterId: string) => equipmentFiltersApi.delete(id!, filterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-filters', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', id] });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('equipment.filters.errorDelete'));
    },
  });

  // Photos. URLs in EquipmentImage are presigned and short-lived, so refetch on
  // each visit rather than caching aggressively. The query is independently
  // keyed from the embedded equipment.images array so we can invalidate it
  // after mutations without re-fetching the entire equipment detail payload.
  const { data: images = [], isLoading: imagesLoading, error: imagesError } = useQuery({
    queryKey: ['equipment-images', id],
    queryFn: () => equipmentImagesApi.list(id!),
    enabled: !!id,
  });

  // Service history — work orders touching this equipment. Shared cache with
  // the rendered WorkOrdersList below so we read the count off the same fetch.
  const { data: serviceHistoryData } = useQuery(
    workOrdersListQueryOptions({ equipmentId: id ?? '' })
  );

  // Descendants tree (Components tab). Backend returns a flat array with
  // each row's parentId; we group client-side to render an indented tree.
  const {
    data: descendants = [],
    isLoading: descendantsLoading,
    error: descendantsError,
  } = useQuery({
    queryKey: ['equipment-descendants', id],
    queryFn: () => equipmentApi.getDescendants(id!),
    enabled: !!id,
  });

  // Invalidates every cache that could be holding a stale equipment summary
  // for this id. Equipment data lives in three places: the equipment-side
  // queries, the single-WO detail (`['work-orders', id]` carries
  // workItems[].equipment), and the paginated lists used by Customer /
  // ServiceLocation work-order tabs and the Equipment Service History tab
  // (`['work-orders-list', ...]`).
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

  const setProfileImageMutation = useMutation({
    mutationFn: (imageId: string) =>
      equipmentImagesApi.patch(id!, imageId, { isProfile: true }),
    onSuccess: imageInvalidate,
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('equipment.images.errorUpdate'));
    },
  });

  const updateCaptionMutation = useMutation({
    mutationFn: ({ imageId, caption }: { imageId: string; caption: string | null }) =>
      equipmentImagesApi.patch(id!, imageId, { caption }),
    onSuccess: imageInvalidate,
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('equipment.images.errorUpdate'));
    },
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => equipmentImagesApi.delete(id!, imageId),
    onSuccess: imageInvalidate,
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('equipment.images.errorDelete'));
    },
  });

  // Top-level delete from the header overflow. On success we navigate back to
  // the list (or wherever in-app history takes us) — the detail page can't
  // render a deleted record. Cache invalidation pulls in the same prefixes
  // that EquipmentPage's delete does so list views and embedded WO summaries
  // refresh in lockstep.
  const deleteEquipmentMutation = useMutation({
    mutationFn: () => equipmentApi.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment-descendants'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders'] });
      queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
      if (routeKey !== 'default') {
        navigate(-1);
      } else {
        navigate('/equipment');
      }
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorDelete', { entity: getName('equipment') }));
    },
  });

  const handleDeleteEquipment = () => {
    if (!equipment) return;
    if (
      window.confirm(t('common.actions.deleteConfirm', { name: equipment.name }))
    ) {
      deleteEquipmentMutation.mutate();
    }
  };

  // Single-field PATCH used by every EditableField on the page. EditableField
  // stays in edit mode if this throws, so we propagate after surfacing via alert
  // — same pattern as WorkOrderDetailPage.
  const handleSaveField = async <K extends keyof UpdateEquipmentRequest>(
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => {
    try {
      await equipmentApi.update(id!, { [field]: next } as UpdateEquipmentRequest);
      invalidateEquipmentRelatedCaches();
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('equipment') }));
      throw err;
    }
  };

  // Type changes reset the category — the old category likely doesn't belong to
  // the new type. User picks a fresh category after.
  const handleSaveType = async (typeId: string) => {
    try {
      await equipmentApi.update(id!, {
        equipmentTypeId: typeId || null,
        equipmentCategoryId: null,
      });
      invalidateEquipmentRelatedCaches();
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('equipment') }));
      throw err;
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 text-center">
          <Text>{t('common.actions.loadingEntity', { entity: getName('equipment') })}</Text>
        </div>
      </AppLayout>
    );
  }

  if (error || !equipment) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <Text className="text-red-800 dark:text-red-400">
              {t('common.actions.errorLoadingEntity', { entity: getName('equipment') })}
              {error && `: ${(error as Error).message}`}
            </Text>
          </div>
          <Button className="mt-4" onClick={() => navigate('/equipment')}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.backTo', { entities: getName('equipment', true) })}
          </Button>
        </div>
      </AppLayout>
    );
  }

  // The Components/Units tab is hidden when this equipment is itself a
  // sub-unit (parentId set). The product rule restricts the hierarchy to
  // 2 levels deep, so a sub-unit can't have its own children — surfacing
  // an empty tab on it would imply otherwise. Top-level equipment shows
  // the tab as usual.
  const isSubUnit = Boolean(equipment.parentId);
  const tabs = [
    { id: 'overview', label: t('equipment.tabs.overview') },
    { id: 'photos', label: t('equipment.tabs.photos'), count: images.length },
    { id: 'filters', label: t('equipment.tabs.filters'), count: filters.length },
    {
      id: 'service-history',
      label: t('equipment.tabs.serviceHistory'),
      count: serviceHistoryData?.totalElements ?? 0,
    },
    ...(isSubUnit
      ? []
      : [
          {
            id: 'components',
            label: getName('equipment_component', true),
            count: descendants.length,
          },
        ]),
  ];

  // Group descendants by parent for tree rendering. The map's keys are
  // parent ids; values are the children of that parent. Top-level children
  // of the current equipment use `id` as their parent key.
  const descendantsByParent = new Map<string, typeof descendants>();
  for (const d of descendants) {
    const key = d.parentId ?? '';
    const list = descendantsByParent.get(key) ?? [];
    list.push(d);
    descendantsByParent.set(key, list);
  }
  for (const list of descendantsByParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const openCreateFilter = () => {
    setEditingFilter(null);
    setPrefilledSize(null);
    setIsFilterDialogOpen(true);
  };

  const openCreateFromSize = (size: TenantFilterSize) => {
    setEditingFilter(null);
    setPrefilledSize({
      lengthIn: size.lengthIn,
      widthIn: size.widthIn,
      thicknessIn: size.thicknessIn,
    });
    setIsFilterDialogOpen(true);
  };

  const openEditFilter = (f: EquipmentFilter) => {
    setEditingFilter(f);
    setPrefilledSize(null);
    setIsFilterDialogOpen(true);
  };

  const handleDeleteFilter = (f: EquipmentFilter) => {
    if (window.confirm(t('equipment.filters.deleteConfirm'))) {
      deleteFilterMutation.mutate(f.id);
    }
  };

  const formatFilterSize = (f: { lengthIn: number; widthIn: number; thicknessIn: number }) =>
    `${formatInches(f.lengthIn)} × ${formatInches(f.widthIn)} × ${formatInches(f.thicknessIn)}`;

  const handleSetProfileImage = (img: EquipmentImage) => {
    if (img.isProfile) return;
    setProfileImageMutation.mutate(img.id);
  };

  const handleEditCaption = (img: EquipmentImage) => {
    const next = window.prompt(t('equipment.images.newCaption'), img.caption ?? '');
    if (next === null) return; // user cancelled
    const trimmed = next.trim();
    updateCaptionMutation.mutate({ imageId: img.id, caption: trimmed || null });
  };

  const handleDeleteImage = (img: EquipmentImage) => {
    if (window.confirm(t('equipment.images.deleteConfirm'))) {
      deleteImageMutation.mutate(img.id);
    }
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
  const statusOptions: { value: EquipmentStatus; label: string }[] = [
    { value: EquipmentStatus.ACTIVE, label: t('equipment.status.active') },
    { value: EquipmentStatus.RETIRED, label: t('equipment.status.retired') },
  ];

  // Lifecycle is hidden when every editable field is empty AND lastServicedAt
  // is null — six rows of "—" next to a fully-populated Identification card
  // makes the page feel half-broken. Add the data through the Edit dialog
  // when there's nothing here yet; once any field is set the section
  // unhides automatically.
  const lifecycleHasData =
    Boolean(equipment.installDate) ||
    Boolean(equipment.lastServicedAt) ||
    Boolean(equipment.warrantyExpiresAt) ||
    Boolean(equipment.warrantyDetails);
  const hasDescription = Boolean(equipment.description?.trim());

  return (
    <AppLayout>
      <div className="p-4">
        <div className="mb-1">
          <Button plain onClick={handleBack}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>

        {/* Header: 48px thumbnail + (breadcrumb above name) + status pill +
            actions, all on a single row. Folding the breadcrumb into the
            header saves a row vs. a separate <nav> above. 48px matches the
            cap-height of the breadcrumb + title block — Linear/Notion/GitHub
            avatar scale, recognition cue not display. */}
        <div className="flex items-center gap-3">
          <EquipmentThumbnail
            url={equipment.profileImageUrl}
            name={t('equipment.detail.profileImageAlt', { name: equipment.name })}
            sizeClass="size-16"
            fit="contain"
          />
          <div className="min-w-0 flex-1">
            <nav
              aria-label={t('equipment.detail.breadcrumbAriaLabel', { entity: getName('equipment') })}
              className="flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-500 dark:text-zinc-400"
            >
              <RouterLink
                to={`/service-locations/${equipment.serviceLocationId}`}
                className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-200"
              >
                {serviceLocation
                  ? serviceLocation.locationName ||
                    `${serviceLocation.address.streetAddress}, ${serviceLocation.address.city}`
                  : getName('service_location')}
              </RouterLink>
              {equipment.parentId && (
                <>
                  <ChevronRightIcon className="size-3 text-zinc-400 dark:text-zinc-600" aria-hidden />
                  <RouterLink
                    to={`/equipment/${equipment.parentId}`}
                    className="hover:text-zinc-700 hover:underline dark:hover:text-zinc-200"
                  >
                    {equipment.parentName ?? getName('equipment')}
                  </RouterLink>
                </>
              )}
            </nav>
            <div className="flex flex-wrap items-center gap-2">
              <Heading className="!text-lg">{equipment.name}</Heading>
              <Badge color={equipment.status === EquipmentStatus.ACTIVE ? 'lime' : 'zinc'}>
                {t(`equipment.status.${equipment.status.toLowerCase()}`)}
              </Badge>
            </div>
          </div>

          {/* Header action group. Edit opens the full form dialog; the
              overflow menu carries the destructive Delete. */}
          <div className="flex items-center gap-1">
            <Button outline onClick={() => setIsEditDialogOpen(true)}>
              <PencilIcon className="size-4" />
              {t('common.edit')}
            </Button>
            <Dropdown>
              <DropdownButton plain aria-label={t('common.moreOptions')}>
                <EllipsisVerticalIcon className="size-5" />
              </DropdownButton>
              <DropdownMenu anchor="bottom end">
                <DropdownItem onClick={handleDeleteEquipment}>
                  <DropdownLabel>{t('common.delete')}</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-2">
          <TabNavigation
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as TabId)}
          />
        </div>

        {/* Tab content */}
        <div className="mt-3">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {/* Identification */}
              <section className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                <SectionLabel>{t('equipment.detail.identification')}</SectionLabel>
                <FieldGrid className="mt-1.5">
                  <FieldRow label={t('common.form.name')}>
                    <EditableField
                      value={equipment.name}
                      onSave={(v) => handleSaveField('name', v)}
                      ariaLabel={t('common.form.name')}
                    />
                  </FieldRow>
                  <FieldRow label={t('common.form.status')}>
                    <EditableField
                      as="select"
                      value={equipment.status}
                      options={statusOptions}
                      onSave={(v) => handleSaveField('status', v as EquipmentStatus)}
                      ariaLabel={t('common.form.status')}
                      renderDisplay={(v) => (
                        <Badge color={v === EquipmentStatus.ACTIVE ? 'lime' : 'zinc'}>
                          {t(`equipment.status.${v.toLowerCase()}`)}
                        </Badge>
                      )}
                    />
                  </FieldRow>
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
                  <FieldRow label={t('equipment.form.locationOnSite')}>
                    <EditableField
                      value={equipment.locationOnSite ?? ''}
                      onSave={(v) => handleSaveField('locationOnSite', v || null)}
                      ariaLabel={t('equipment.form.locationOnSite')}
                    />
                  </FieldRow>
                </FieldGrid>
              </section>

              {/* Lifecycle. Hidden entirely when every editable field is
                  empty (and lastServicedAt is null) — six rows of "—"
                  alongside a populated Identification card was reading as
                  "this page is half-broken." Add via the Edit dialog;
                  once any field is set the section reappears. */}
              {lifecycleHasData && (
                <section className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                  <SectionLabel>{t('equipment.detail.lifecycle')}</SectionLabel>
                  <FieldGrid className="mt-1.5">
                    <FieldRow label={t('equipment.form.installDate')}>
                      <EditableField
                        value={equipment.installDate ?? ''}
                        onSave={(v) => handleSaveField('installDate', v || null)}
                        ariaLabel={t('equipment.form.installDate')}
                        renderDisplay={(v) => (v ? formatDate(v) : '—')}
                      />
                    </FieldRow>
                    <FieldRow label={t('equipment.detail.lastServiced')}>
                      <span>
                        {equipment.lastServicedAt ? formatDate(equipment.lastServicedAt) : '—'}
                      </span>
                    </FieldRow>
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
                    <FieldRow label={t('equipment.detail.created')}>
                      <span>{formatDate(equipment.createdAt)}</span>
                    </FieldRow>
                  </FieldGrid>
                </section>
              )}

              {/* Description. Hidden when empty — same reasoning as
                  Lifecycle; an empty card with a placeholder textarea
                  doesn't earn its vertical weight. Adding a description is
                  rare and reachable via the Edit dialog. */}
              {hasDescription && (
                <section className="rounded-lg border border-zinc-200 p-2.5 lg:col-span-2 dark:border-zinc-800">
                  <SectionLabel>{t('common.form.description')}</SectionLabel>
                  <div className="mt-1.5">
                    <EditableField
                      as="textarea"
                      value={equipment.description ?? ''}
                      onSave={(v) => handleSaveField('description', v || null)}
                      ariaLabel={t('common.form.description')}
                      placeholder={t('equipment.detail.descriptionPlaceholder')}
                    />
                  </div>
                </section>
              )}
            </div>
          )}

          {activeTab === 'photos' && (
            <div>
              <div className="mb-3 flex items-center justify-end">
                <Button
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

              {imagesError && (
                <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
                  <Text className="text-sm text-red-800 dark:text-red-400">
                    {t('equipment.images.errorLoading')}: {(imagesError as Error).message}
                  </Text>
                </div>
              )}

              {!imagesError && imagesLoading ? (
                <div className="rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
                  <Text className="text-zinc-500 dark:text-zinc-400">
                    {t('equipment.images.loading')}
                  </Text>
                </div>
              ) : !imagesError && images.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                  <Text className="text-zinc-600 dark:text-zinc-400">
                    {t('equipment.images.empty')}
                  </Text>
                </div>
              ) : (
                !imagesError && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {images.map((img, i) => (
                      <div
                        key={img.id}
                        className="group relative overflow-hidden rounded-lg ring-1 ring-zinc-950/10 dark:ring-white/10"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(i)}
                          aria-label={t('equipment.images.openFullSize')}
                          className="block aspect-square w-full bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-zinc-900"
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
                          aria-label={
                            img.isProfile
                              ? t('equipment.images.profile')
                              : t('equipment.images.setAsProfile')
                          }
                          aria-pressed={img.isProfile}
                          title={
                            img.isProfile
                              ? t('equipment.images.profile')
                              : t('equipment.images.setAsProfile')
                          }
                          className="absolute left-1 top-1 flex size-8 items-center justify-center rounded-full bg-white/80 backdrop-blur transition-colors hover:bg-white dark:bg-zinc-900/80 dark:hover:bg-zinc-900"
                        >
                          {img.isProfile ? (
                            <StarIconSolid className="size-5 text-amber-500" />
                          ) : (
                            <StarIconOutline className="size-5 text-zinc-500 hover:text-amber-500 dark:text-zinc-400" />
                          )}
                        </button>

                        <div className="absolute right-1 top-1">
                          <Dropdown>
                            <DropdownButton
                              plain
                              aria-label={t('common.moreOptions')}
                              className="rounded-full bg-white/80 backdrop-blur dark:bg-zinc-900/80"
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
                          <div className="border-t border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                            <span className="line-clamp-1">{img.caption}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          )}

          {activeTab === 'filters' && (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                {activeFilterSizes.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Text className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      {t('equipment.filters.quickAdd')}:
                    </Text>
                    {(showAllFilterSizes
                      ? activeFilterSizes
                      : activeFilterSizes.slice(0, FILTER_SIZE_CHIP_COLLAPSED)
                    ).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => openCreateFromSize(s)}
                        className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-700"
                      >
                        {formatFilterSize(s)}
                      </button>
                    ))}
                    {activeFilterSizes.length > FILTER_SIZE_CHIP_COLLAPSED && (
                      <button
                        type="button"
                        onClick={() => setShowAllFilterSizes((v) => !v)}
                        className="rounded-full px-2.5 py-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                      >
                        {showAllFilterSizes
                          ? t('equipment.filters.showFewer')
                          : t('equipment.filters.showAll', {
                              count: activeFilterSizes.length,
                            })}
                      </button>
                    )}
                  </div>
                ) : (
                  <span />
                )}
                <Button onClick={openCreateFilter}>
                  <PlusIcon className="size-4" />
                  {t('equipment.filters.addFilter')}
                </Button>
              </div>

              {filtersError && (
                <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
                  <Text className="text-sm text-red-800 dark:text-red-400">
                    {t('equipment.filters.errorLoading')}: {(filtersError as Error).message}
                  </Text>
                </div>
              )}

              {!filtersError && filtersLoading ? (
                <div className="rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
                  <Text className="text-zinc-500 dark:text-zinc-400">
                    {t('equipment.filters.loading')}
                  </Text>
                </div>
              ) : !filtersError && filters.length === 0 ? (
                <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                  <Text className="text-zinc-600 dark:text-zinc-400">
                    {t('equipment.filters.empty')}
                  </Text>
                </div>
              ) : (
                !filtersError && (
                  <Table dense className="[--gutter:theme(spacing.1)] text-sm">
                    <TableHead>
                      <TableRow>
                        <TableHeader>{t('equipment.filters.size')}</TableHeader>
                        <TableHeader>{t('equipment.filters.quantity')}</TableHeader>
                        <TableHeader>{t('equipment.filters.label')}</TableHeader>
                        <TableHeader></TableHeader>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filters.map((f) => (
                        <TableRow key={f.id}>
                          <TableCell className="font-mono">{formatFilterSize(f)}</TableCell>
                          <TableCell>{f.quantity}</TableCell>
                          <TableCell>{f.label || '—'}</TableCell>
                          <TableCell>
                            <div className="-mx-3 -my-1.5 sm:-mx-2.5">
                              <Dropdown>
                                <DropdownButton plain aria-label={t('common.moreOptions')}>
                                  <EllipsisVerticalIcon className="size-5" />
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
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              )}
            </div>
          )}

          {activeTab === 'service-history' && id && (
            <WorkOrdersList equipmentId={id} />
          )}

          {activeTab === 'components' && (
            <ComponentsTree
              rootId={id!}
              descendantsByParent={descendantsByParent}
              loading={descendantsLoading}
              error={descendantsError as Error | null}
            />
          )}
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
        images={images}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      <EquipmentFormDialog
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        equipment={equipment}
      />
    </AppLayout>
  );
}

interface ComponentsTreeProps {
  rootId: string;
  descendantsByParent: Map<string, EquipmentSummary[]>;
  loading: boolean;
  error: Error | null;
}

/**
 * Indented tree view of an equipment's descendants. Each node renders a
 * thumbnail, name (linking to its detail page), and type/category meta.
 * Children render at one indent level deeper than their parent.
 *
 * Recursion bottoms out when a parent has no children — the descendantsByParent
 * map only holds entries for parents that have descendants.
 */
function ComponentsTree({
  rootId,
  descendantsByParent,
  loading,
  error,
}: ComponentsTreeProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  if (loading) {
    return (
      <div className="rounded-lg border border-zinc-200 p-6 text-center dark:border-zinc-800">
        <Text className="text-zinc-500 dark:text-zinc-400">
          {t('common.actions.loading', { entities: getName('equipment_component', true) })}
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
        <Text className="text-sm text-red-800 dark:text-red-400">
          {t('common.actions.errorLoading', { entities: getName('equipment_component', true) })}: {error.message}
        </Text>
      </div>
    );
  }

  // First-level children: parentId === rootId. Backend may emit them with
  // parentId=null too if the rooted entity is the parent and the API doesn't
  // round-trip parentId for direct children. We try rootId first, fall back
  // to '' (the no-parent bucket) when nothing matches.
  const directChildren =
    descendantsByParent.get(rootId) ?? descendantsByParent.get('') ?? [];

  if (directChildren.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
        <Text className="text-zinc-600 dark:text-zinc-400">
          {t('common.actions.noEntitiesYet', { entities: getName('equipment_component', true) })}
        </Text>
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {directChildren.map((child) => (
        <ComponentsTreeNode
          key={child.id}
          node={child}
          depth={0}
          descendantsByParent={descendantsByParent}
        />
      ))}
    </ul>
  );
}

interface ComponentsTreeNodeProps {
  node: EquipmentSummary;
  depth: number;
  descendantsByParent: Map<string, EquipmentSummary[]>;
}

function ComponentsTreeNode({ node, depth, descendantsByParent }: ComponentsTreeNodeProps) {
  const children = descendantsByParent.get(node.id) ?? [];
  const typeCategory =
    node.equipmentTypeName && node.equipmentCategoryName
      ? `${node.equipmentTypeName} / ${node.equipmentCategoryName}`
      : node.equipmentTypeName || node.equipmentCategoryName || null;
  const makeModel =
    node.make && node.model ? `${node.make} ${node.model}` : node.make || node.model || null;

  return (
    <li>
      <div
        className="flex items-center gap-3 rounded-md py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        <EquipmentThumbnail
          url={node.profileImageUrl}
          name={node.name}
          sizeClass="size-9"
          fit="contain"
        />
        <div className="min-w-0 flex-1">
          <RouterLink
            to={`/equipment/${node.id}`}
            className="text-sm font-medium text-zinc-700 hover:text-blue-600 hover:underline dark:text-zinc-200 dark:hover:text-blue-400"
          >
            {node.name}
          </RouterLink>
          {(typeCategory || makeModel || node.serialNumber) && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {[typeCategory, makeModel, node.serialNumber].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
      </div>
      {children.length > 0 && (
        <ul className="mt-1 space-y-1">
          {children.map((child) => (
            <ComponentsTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              descendantsByParent={descendantsByParent}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Small uppercase section header used by the dense overview cards. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
      {children}
    </h3>
  );
}

/**
 * Compact 2-col label/value grid. Replaces Catalyst DescriptionList on
 * dense surfaces — DescriptionList's per-row borders + 12px padding each
 * side eat ~24px per row; this grid uses 4px gaps and no borders, taking
 * each row down to ~24px total height.
 */
function FieldGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl
      className={[
        'grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-zinc-950 dark:text-white',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </dl>
  );
}

interface FieldRowProps {
  label: string;
  children: React.ReactNode;
}

/** Single row in a FieldGrid. Consumer passes the value via children
 *  (typically an EditableField) so we don't have to expose every variant
 *  of EditableField as props. */
function FieldRow({ label, children }: FieldRowProps) {
  return (
    <>
      <dt className="self-center text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="min-w-0 self-center">{children}</dd>
    </>
  );
}
