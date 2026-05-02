import { useState } from 'react';
import { useParams, useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentApi,
  equipmentTypesApi,
  equipmentCategoriesApi,
  EquipmentStatus,
  type UpdateEquipmentRequest,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import AppLayout from '../components/AppLayout';
import TabNavigation from '../components/TabNavigation';
import EditableField from '../components/EditableField';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { Badge } from '../components/catalyst/badge';
import {
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
} from '../components/catalyst/description-list';
import { ArrowLeftIcon, PhotoIcon } from '@heroicons/react/24/outline';

type TabId = 'overview' | 'filters' | 'service-history' | 'components';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { key: routeKey } = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

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

  // Single-field PATCH used by every EditableField on the page. EditableField
  // stays in edit mode if this throws, so we propagate after surfacing via alert
  // — same pattern as WorkOrderDetailPage.
  const handleSaveField = async <K extends keyof UpdateEquipmentRequest>(
    field: K,
    next: UpdateEquipmentRequest[K]
  ) => {
    try {
      await equipmentApi.update(id!, { [field]: next } as UpdateEquipmentRequest);
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
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
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
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

  const tabs = [
    { id: 'overview', label: t('equipment.tabs.overview') },
    { id: 'filters', label: t('equipment.tabs.filters') },
    { id: 'service-history', label: t('equipment.tabs.serviceHistory') },
    { id: 'components', label: t('equipment.tabs.components') },
  ];

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

  return (
    <AppLayout>
      <div className="p-4">
        <div className="mb-2">
          <Button plain onClick={handleBack}>
            <ArrowLeftIcon className="size-4" />
            {t('common.actions.back')}
          </Button>
        </div>

        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-zinc-100 ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
            {equipment.profileImageUrl ? (
              <img
                src={equipment.profileImageUrl}
                alt={t('equipment.detail.profileImageAlt', { name: equipment.name })}
                className="size-full object-cover"
              />
            ) : (
              <PhotoIcon
                className="size-10 text-zinc-300 dark:text-zinc-700"
                aria-label={t('equipment.detail.noProfileImage')}
              />
            )}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Heading className="text-2xl">{equipment.name}</Heading>
              <Badge color={equipment.status === EquipmentStatus.ACTIVE ? 'lime' : 'zinc'}>
                {t(`equipment.status.${equipment.status.toLowerCase()}`)}
              </Badge>
            </div>
            <Text className="mt-1">
              {t('serviceLocations.detail.belongsTo')}{' '}
              <RouterLink
                to={`/service-locations/${equipment.serviceLocationId}`}
                className="font-medium hover:underline"
              >
                {getName('service_location')}
              </RouterLink>
            </Text>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4">
          <TabNavigation
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(tabId) => setActiveTab(tabId as TabId)}
          />
        </div>

        {/* Tab content */}
        <div className="mt-4">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Identification */}
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <Heading level={3} className="text-base">
                  {t('equipment.detail.identification')}
                </Heading>
                <DescriptionList className="mt-2">
                  <DescriptionTerm>{t('common.form.name')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.name}
                      onSave={(v) => handleSaveField('name', v)}
                      ariaLabel={t('common.form.name')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('common.form.status')}</DescriptionTerm>
                  <DescriptionDetails>
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
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.type')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      as="select"
                      value={equipment.equipmentTypeId ?? ''}
                      options={typeOptions}
                      onSave={(v) => handleSaveType(v)}
                      ariaLabel={t('equipment.form.type')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.category')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      as="select"
                      value={equipment.equipmentCategoryId ?? ''}
                      options={categoryOptions}
                      onSave={(v) => handleSaveField('equipmentCategoryId', v || null)}
                      disabled={!equipment.equipmentTypeId}
                      ariaLabel={t('equipment.form.category')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.make')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.make ?? ''}
                      onSave={(v) => handleSaveField('make', v || null)}
                      ariaLabel={t('equipment.form.make')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.model')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.model ?? ''}
                      onSave={(v) => handleSaveField('model', v || null)}
                      ariaLabel={t('equipment.form.model')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.serialNumber')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.serialNumber ?? ''}
                      onSave={(v) => handleSaveField('serialNumber', v || null)}
                      ariaLabel={t('equipment.form.serialNumber')}
                      className="font-mono"
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.assetTag')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.assetTag ?? ''}
                      onSave={(v) => handleSaveField('assetTag', v || null)}
                      ariaLabel={t('equipment.form.assetTag')}
                      className="font-mono"
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.locationOnSite')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.locationOnSite ?? ''}
                      onSave={(v) => handleSaveField('locationOnSite', v || null)}
                      ariaLabel={t('equipment.form.locationOnSite')}
                    />
                  </DescriptionDetails>
                </DescriptionList>
              </div>

              {/* Lifecycle */}
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <Heading level={3} className="text-base">
                  {t('equipment.detail.lifecycle')}
                </Heading>
                <DescriptionList className="mt-2">
                  <DescriptionTerm>{t('equipment.form.installDate')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.installDate ?? ''}
                      onSave={(v) => handleSaveField('installDate', v || null)}
                      ariaLabel={t('equipment.form.installDate')}
                      renderDisplay={(v) => (v ? formatDate(v) : '—')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.detail.lastServiced')}</DescriptionTerm>
                  <DescriptionDetails>
                    {equipment.lastServicedAt ? formatDate(equipment.lastServicedAt) : '—'}
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.warrantyExpiresAt')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.warrantyExpiresAt ?? ''}
                      onSave={(v) => handleSaveField('warrantyExpiresAt', v || null)}
                      ariaLabel={t('equipment.form.warrantyExpiresAt')}
                      renderDisplay={(v) => (v ? formatDate(v) : '—')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.form.warrantyDetails')}</DescriptionTerm>
                  <DescriptionDetails>
                    <EditableField
                      value={equipment.warrantyDetails ?? ''}
                      onSave={(v) => handleSaveField('warrantyDetails', v || null)}
                      ariaLabel={t('equipment.form.warrantyDetails')}
                    />
                  </DescriptionDetails>

                  <DescriptionTerm>{t('equipment.detail.created')}</DescriptionTerm>
                  <DescriptionDetails>{formatDate(equipment.createdAt)}</DescriptionDetails>
                </DescriptionList>
              </div>

              {/* Description (full-width) */}
              <div className="rounded-lg border border-zinc-200 p-3 lg:col-span-2 dark:border-zinc-800">
                <Heading level={3} className="text-base">
                  {t('common.form.description')}
                </Heading>
                <div className="mt-2">
                  <EditableField
                    as="textarea"
                    value={equipment.description ?? ''}
                    onSave={(v) => handleSaveField('description', v || null)}
                    ariaLabel={t('common.form.description')}
                    placeholder={t('equipment.detail.descriptionPlaceholder')}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'overview' && (
            <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
              <Text className="text-zinc-600 dark:text-zinc-400">
                {t('equipment.detail.tabComingSoon')}
              </Text>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
