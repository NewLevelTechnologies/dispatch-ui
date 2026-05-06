import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentApi,
  EquipmentStatus,
  type Equipment,
  type EquipmentImage,
  type UpdateEquipmentRequest,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import EditableField from './EditableField';
import EquipmentImageUploadDialog from './EquipmentImageUploadDialog';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';
import EquipmentPhotosSection from './EquipmentPhotosSection';
import EquipmentThumbnail from './EquipmentThumbnail';
import { Badge } from './catalyst/badge';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import { ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';

interface EquipmentQuickViewProps {
  equipmentId: string;
  /** Click handler for sub-unit chips. Pushes the chosen sub-unit onto the
   *  drawer stack so the user can drill into nested components without
   *  losing the chain. */
  onSelectSubUnit: (subUnit: { id: string; name: string }) => void;
}

/**
 * Inline-edit equipment detail surface rendered inside the slide-over
 * drawer. Mirrors the structure of EquipmentDetailPage but trimmed for the
 * "peek at a sub-unit without leaving the WO" workflow:
 *
 *   - 64px hero thumbnail + name + status pill + type/category subline
 *   - Identification block (inline-edit)
 *   - Lifecycle block (inline-edit)
 *   - Sub-units chip row with thumbnails + "+ Add unit" affordance
 *   - "Open full page" link to the dedicated route for tabs (Photos, Filters,
 *     Service History, Components) and any field not in the visible grid.
 *
 * Saves go through equipmentApi.update with full triple-key cache
 * invalidation so the WO row's primary equipment block, list views, and
 * embedded WorkItemEquipmentSummary all refresh in lockstep.
 */
export default function EquipmentQuickView({
  equipmentId,
  onSelectSubUnit,
}: EquipmentQuickViewProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);

  // The drawer needs descendants on the response so the sub-unit chip row
  // can render. That's an opt-in projection — default getById callers
  // (e.g. EquipmentDetailPage) get the lean shape. Cache key carries the
  // option so the two flavors don't collide; prefix-based invalidation
  // (`['equipment-detail', id]`) still hits both entries in lockstep.
  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ['equipment-detail', equipmentId, { includeDescendants: true }],
    queryFn: () => equipmentApi.getById(equipmentId, { includeDescendants: true }),
  });
  const directChildren = equipment?.descendants ?? [];

  const invalidateEquipmentRelatedCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
  };

  const updateMutation = useMutation({
    mutationFn: (data: UpdateEquipmentRequest) => equipmentApi.update(equipmentId, data),
    onSuccess: invalidateEquipmentRelatedCaches,
  });

  const saveField = async <K extends keyof UpdateEquipmentRequest>(
    field: K,
    value: UpdateEquipmentRequest[K]
  ) => {
    try {
      await updateMutation.mutateAsync({ [field]: value } as UpdateEquipmentRequest);
    } catch (err) {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('equipment') }));
      throw err;
    }
  };

  if (isLoading || !equipment) {
    return (
      <div className="p-6 text-center">
        <Text className="text-zinc-500 dark:text-zinc-400">
          {t('common.actions.loadingEntity', { entity: getName('equipment') })}
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 p-3 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
          <Text className="text-sm text-red-800 dark:text-red-400">
            {t('common.actions.errorLoadingEntity', { entity: getName('equipment') })}
          </Text>
        </div>
      </div>
    );
  }

  const typeCategory = [equipment.equipmentTypeName, equipment.equipmentCategoryName]
    .filter(Boolean)
    .join(' · ');

  // Sort defensively: profile-first then sortOrder. The same lightbox
  // serves the hero thumbnail click and the photos thumbnails below.
  const orderedImages: EquipmentImage[] = (equipment.images ?? [])
    .slice()
    .sort((a, b) => {
      if (a.isProfile && !b.isProfile) return -1;
      if (!a.isProfile && b.isProfile) return 1;
      return a.sortOrder - b.sortOrder;
    });
  const hasImages = orderedImages.length > 0;
  const heroClickable = hasImages && !!equipment.profileImageUrl;

  const heroThumbnail = (
    <EquipmentThumbnail
      url={equipment.profileImageUrl}
      name={equipment.name}
      sizeClass="size-16"
      fit="contain"
    />
  );

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Hero: 64px thumbnail + name + status pill + type/category subline.
          Hero becomes click-to-lightbox when the equipment has images. */}
      <div className="flex items-start gap-4">
        {heroClickable ? (
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            aria-label={t('equipment.images.openFullSize')}
            className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {heroThumbnail}
          </button>
        ) : (
          heroThumbnail
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EditableField
              value={equipment.name}
              onSave={(v) => saveField('name', v)}
              ariaLabel={t('common.form.name')}
              className="text-lg font-semibold text-zinc-950 dark:text-white"
            />
            <Badge color={equipment.status === EquipmentStatus.ACTIVE ? 'lime' : 'amber'}>
              {t(`equipment.status.${equipment.status.toLowerCase()}`)}
            </Badge>
          </div>
          {typeCategory && (
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {typeCategory}
            </div>
          )}
        </div>
        {/* + Photo lives at the top-right of the hero row — drawer doesn't
            have an "actions row" like the WO row's equipment block, so the
            hero cluster is the natural home for the manage-side affordance. */}
        <Button plain onClick={() => setIsImageUploadOpen(true)}>
          <PlusIcon className="size-4" />
          {t('equipment.images.addPhoto')}
        </Button>
      </div>

      {/* Identification */}
      <Section label={t('equipment.detail.identification')}>
        <FieldGrid>
          <Field
            label={t('equipment.form.make')}
            value={equipment.make ?? ''}
            onSave={(v) => saveField('make', v || null)}
          />
          <Field
            label={t('equipment.form.model')}
            value={equipment.model ?? ''}
            onSave={(v) => saveField('model', v || null)}
          />
          <Field
            label={t('equipment.form.serialNumber')}
            value={equipment.serialNumber ?? ''}
            onSave={(v) => saveField('serialNumber', v || null)}
            mono
          />
          <Field
            label={t('equipment.form.assetTag')}
            value={equipment.assetTag ?? ''}
            onSave={(v) => saveField('assetTag', v || null)}
            mono
          />
          <Field
            label={t('equipment.form.locationOnSite')}
            value={equipment.locationOnSite ?? ''}
            onSave={(v) => saveField('locationOnSite', v || null)}
          />
        </FieldGrid>
      </Section>

      {/* Lifecycle */}
      <Section label={t('equipment.detail.lifecycle')}>
        <FieldGrid>
          <Field
            label={t('equipment.form.installDate')}
            value={equipment.installDate ?? ''}
            onSave={(v) => saveField('installDate', v || null)}
          />
          <Field
            label={t('equipment.detail.lastServiced')}
            value={equipment.lastServicedAt ? formatDate(equipment.lastServicedAt) : '—'}
            readOnly
          />
          <Field
            label={t('equipment.form.warrantyExpiresAt')}
            value={equipment.warrantyExpiresAt ?? ''}
            onSave={(v) => saveField('warrantyExpiresAt', v || null)}
          />
          <Field
            label={t('equipment.form.warrantyDetails')}
            value={equipment.warrantyDetails ?? ''}
            onSave={(v) => saveField('warrantyDetails', v || null)}
          />
        </FieldGrid>
      </Section>

      {/* Sub-units chip row. The drawer is opened from a sub-unit chip in
          the WO row, so the equipment displayed here is itself a sub-unit
          (depth 1 from the WO's primary equipment). The product rule
          restricts the hierarchy to 2 levels deep, so we don't render the
          "+ Add unit" affordance here — adding from the drawer would create
          depth-2 records. The row hides entirely when there are no
          existing sub-units to display (avoids an orphaned "(0):" label).
          Existing sub-units, if any (e.g. legacy data), still render so
          the user can navigate into them via drawer-over-drawer. */}
      {directChildren.length > 0 && (
        <Section
          label={t('workOrders.workItems.subUnits', {
            entities: getName('equipment_component', true),
            count: directChildren.length,
          })}
        >
          <div className="flex flex-wrap items-center gap-2">
            {directChildren.map((sub) => (
              <SubUnitChip
                key={sub.id}
                subUnit={sub}
                onSelect={() => onSelectSubUnit({ id: sub.id, name: sub.name })}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Photos section. Drawer's equipment fetch already embeds images[];
          pass them through so we don't refetch the same URL list. */}
      <EquipmentPhotosSection
        images={orderedImages}
        onSelectImage={(i) => setLightboxIndex(i)}
      />

      <EquipmentPhotoLightbox
        images={orderedImages}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />

      <EquipmentImageUploadDialog
        isOpen={isImageUploadOpen}
        onClose={() => setIsImageUploadOpen(false)}
        equipmentId={equipment.id}
        defaultSetProfile={!hasImages}
      />
    </div>
  );
}

interface SubUnitChipProps {
  subUnit: { id: string; name: string; profileImageUrl?: string | null };
  onSelect: () => void;
}

function SubUnitChip({ subUnit, onSelect }: SubUnitChipProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 py-0.5 pl-1 pr-2.5 text-xs text-zinc-700 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-200 hover:text-blue-600 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-blue-400"
    >
      <EquipmentThumbnail
        url={subUnit.profileImageUrl}
        name={subUnit.name}
        sizeClass="size-5"
        fit="cover"
      />
      <span>{subUnit.name}</span>
      <ChevronRightIcon className="size-3" aria-hidden />
    </button>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

function Section({ label, children }: SectionProps) {
  return (
    <section>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm text-zinc-950 dark:text-white">
      {children}
    </dl>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onSave?: (next: string) => Promise<void>;
  readOnly?: boolean;
  mono?: boolean;
}

function Field({ label, value, onSave, readOnly, mono }: FieldProps) {
  const className = mono ? 'font-mono' : undefined;
  return (
    <>
      <dt className="self-center text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="self-center">
        {readOnly || !onSave ? (
          <span className={className}>{value || '—'}</span>
        ) : (
          <EditableField
            value={value}
            onSave={onSave}
            ariaLabel={label}
            className={className}
          />
        )}
      </dd>
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Re-export Equipment type for convenience.
export type { Equipment };
