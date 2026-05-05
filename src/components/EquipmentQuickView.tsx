import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  equipmentApi,
  EquipmentStatus,
  type Equipment,
  type EquipmentSummary,
  type UpdateEquipmentRequest,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import EditableField from './EditableField';
import EquipmentThumbnail from './EquipmentThumbnail';
import { Badge } from './catalyst/badge';
import { Button } from './catalyst/button';
import { Text } from './catalyst/text';
import {
  ArrowTopRightOnSquareIcon,
  ChevronRightIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';

interface EquipmentQuickViewProps {
  equipmentId: string;
  /** Click handler for sub-unit chips. Pushes the chosen sub-unit onto the
   *  drawer stack so the user can drill into nested components without
   *  losing the chain. */
  onSelectSubUnit: (subUnit: { id: string; name: string }) => void;
  /** Click handler for the "+ Add" affordance on the sub-units row. Parent
   *  opens EquipmentFormDialog with lockedParent set to this equipment. */
  onAddSubUnit: (parent: { id: string; name: string }) => void;
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
  onAddSubUnit,
}: EquipmentQuickViewProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();

  // Shares the ['equipment-detail', id] cache key with EquipmentDetailPage,
  // so navigating between the drawer and the full page is instant.
  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: () => equipmentApi.getById(equipmentId),
  });

  // Direct children for the sub-unit chip row. Once backend projects
  // descendants on the Equipment response (getById), this query goes away
  // and we read straight from `equipment.descendants`. Until then we make
  // the round-trip ourselves; both queries fire in parallel.
  const { data: descendants = [] } = useQuery({
    queryKey: ['equipment-descendants', equipmentId],
    queryFn: () => equipmentApi.getDescendants(equipmentId),
  });
  // The descendants endpoint returns the full tree (children + grandchildren
  // + …). For the chip row we want direct children only.
  const directChildren = descendants.filter((d) => d.parentId === equipmentId);

  const invalidateEquipmentRelatedCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['equipment-descendants'] });
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

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Hero: 64px thumbnail + name + status pill + type/category subline. */}
      <div className="flex items-start gap-4">
        <EquipmentThumbnail
          url={equipment.profileImageUrl}
          name={equipment.name}
          sizeClass="size-16"
          fit="contain"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <EditableField
              value={equipment.name}
              onSave={(v) => saveField('name', v)}
              ariaLabel={t('common.form.name')}
              className="text-lg font-semibold"
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

      {/* Sub-units chip row. Always renders (even when empty) so the "+ Add"
          affordance is discoverable — sub-unit creation happens ~100% in
          this WO context per CSR workflow. */}
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
          <button
            type="button"
            onClick={() => onAddSubUnit({ id: equipment.id, name: equipment.name })}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs text-blue-600 ring-1 ring-inset ring-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:ring-blue-900 dark:hover:bg-blue-950/30"
          >
            <PlusIcon className="size-3.5" />
            {t('common.actions.add', { entity: getName('equipment_component') })}
          </button>
        </div>
      </Section>

      {/* Footer: explicit escape to the dedicated detail route for tabs and
          deeper editing surfaces (Photos, Filters, Service History,
          Components). */}
      <div className="flex justify-end pt-2">
        <Button plain href={`/equipment/${equipment.id}`}>
          <ArrowTopRightOnSquareIcon className="size-4" />
          {t('workOrders.workItems.openPage')}
        </Button>
      </div>
    </div>
  );
}

interface SubUnitChipProps {
  subUnit: EquipmentSummary;
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
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
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
