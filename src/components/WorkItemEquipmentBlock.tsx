import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CameraIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import { equipmentApi, equipmentImagesApi, type WorkItemEquipmentSummary } from '../api';
import { workOrdersListQueryOptions } from '../api/workOrdersListQuery';
import { useGlossary } from '../contexts/GlossaryContext';
import EquipmentThumbnail from './EquipmentThumbnail';
import EquipmentImageUploadDialog from './EquipmentImageUploadDialog';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';
import { Pill } from './ui/Pill';
import { Button } from './catalyst/button';

function warrantyState(expiresAt?: string | null): 'covered' | 'expired' | null {
  if (!expiresAt) return null;
  return new Date(expiresAt) >= new Date() ? 'covered' : 'expired';
}

function fmtMonthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function fmtMonthDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ageYears(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const yrs = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return yrs >= 1 ? `${yrs} yr` : null;
}

interface Props {
  equipment: WorkItemEquipmentSummary;
  readOnly: boolean;
  /** Peek the equipment RECORD in the quickview drawer (thumb + identity + Open record). */
  onOpenEquipment?: (equipment: { id: string; name: string }) => void;
  /** Re-pick / swap the attached equipment (opens the work-item edit flow). */
  onChange?: () => void;
  /** Peek a sub-unit's record in the drawer. */
  onSelectSubUnit?: (subUnit: { id: string; name: string }) => void;
  /** Add a sub-unit under this equipment (opens the create form with the parent locked). */
  onAddSubUnit?: (parent: { id: string; name: string }) => void;
}

/**
 * The single elevated equipment sub-record on a work-item card (mock §3
 * `WorkItemEquipment`): a calm, read-focused surface — not the inline-edit grid.
 * Detailed field editing lives in the equipment drawer / full page.
 *
 * Rows, top → bottom:
 *   - Identity: thumb + make/model + serial + warranty + Change + Open record →.
 *     The thumb AND the identity text peek the equipment drawer.
 *   - History signal: prior-visit count (derived from service history). The
 *     chronic-repair (⟳ part ×N) flag is a backend ask, so it's omitted here
 *     rather than faked.
 *   - Units: child equipment as compact pills (parent systems only).
 *   - Media: photos on file + capture.
 */
export default function WorkItemEquipmentBlock({
  equipment,
  readOnly,
  onOpenEquipment,
  onChange,
  onSelectSubUnit,
  onAddSubUnit,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  // Lazy image list (media row + lightbox). Cache key matches EquipmentDetailPage
  // so uploads elsewhere invalidate this surface in lockstep.
  const { data: images = [] } = useQuery({
    queryKey: ['equipment-images', equipment.id],
    queryFn: () => equipmentImagesApi.list(equipment.id),
  });
  // Prior-visit count — derived from the cross-job service history (WOs touching
  // this unit), minus the current one. Same source the drawer + detail page use.
  const { data: history } = useQuery(
    workOrdersListQueryOptions({ equipmentId: equipment.id, pageSize: 1 })
  );
  // Full record (shared cache key with the drawer) for install date / age and
  // last-serviced — fields the work-item equipment summary omits.
  const { data: full } = useQuery({
    queryKey: ['equipment-detail', equipment.id, { includeDescendants: true }],
    queryFn: () => equipmentApi.getById(equipment.id, { includeDescendants: true }),
  });

  const orderedImages = [...images].sort((a, b) => {
    if (a.isProfile && !b.isProfile) return -1;
    if (!a.isProfile && b.isProfile) return 1;
    return a.sortOrder - b.sortOrder;
  });
  const hasImages = orderedImages.length > 0;
  const priorVisits = Math.max(0, (history?.totalElements ?? 0) - 1);
  const makeModel = [equipment.make, equipment.model].filter(Boolean).join(' ');
  const warranty = warrantyState(equipment.warrantyExpiresAt);
  const units = equipment.descendants ?? [];
  const unitTotal = equipment.descendantCount ?? units.length;
  const openDrawer = () => onOpenEquipment?.({ id: equipment.id, name: equipment.name });
  const installedText = full?.installDate
    ? [fmtMonthYear(full.installDate), ageYears(full.installDate)].filter(Boolean).join(' · ')
    : null;
  const lastServicedDate = full?.lastServicedAt ? fmtMonthDay(full.lastServicedAt) : null;

  return (
    <section aria-label={getName('equipment')}>
      <div className="overflow-hidden rounded-lg border border-border">
        {/* Identity — thumb + make/model + serial + warranty + Change + Open record.
            Thumb AND identity text peek the equipment drawer. */}
        <div className="flex items-center gap-2.5 border-b border-border-soft bg-bg-elev-2 px-3 py-2.5">
          <button
            type="button"
            onClick={openDrawer}
            aria-label={t('workOrders.workItems.openRecord')}
            className="shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <EquipmentThumbnail
              url={equipment.profileImageUrl}
              name={equipment.name}
              type={equipment.equipmentTypeName}
              monogram
              sizeClass="size-7"
              fit="contain"
            />
          </button>
          <button type="button" onClick={openDrawer} className="min-w-0 flex-1 text-left">
            <div className="truncate text-[12px] font-semibold text-fg-strong">
              {makeModel || equipment.name}
            </div>
            {(equipment.serialNumber || installedText) && (
              <div className="truncate text-[10.5px] text-fg-dim">
                {equipment.serialNumber && (
                  <span className="font-mono">{`${t('workOrders.workItems.serialAbbrev')} ${equipment.serialNumber}`}</span>
                )}
                {installedText && (
                  <span>{`${equipment.serialNumber ? ' · ' : ''}${t('workOrders.workItems.installedShort')} ${installedText}`}</span>
                )}
              </div>
            )}
          </button>
          {warranty && (
            <Pill tone={warranty === 'covered' ? 'success' : 'neutral'} dot>
              {warranty === 'covered'
                ? t('workOrders.detail.overview.warrantyCovered')
                : t('workOrders.detail.overview.warrantyExpired')}
            </Pill>
          )}
          {!readOnly && onChange && (
            <Button plain size="xxs" onClick={onChange}>
              {t('workOrders.workItems.change')}
            </Button>
          )}
          <button
            type="button"
            onClick={openDrawer}
            className="shrink-0 whitespace-nowrap text-[11.5px] !font-semibold text-fg-accent hover:underline"
          >
            {t('workOrders.workItems.openRecordArrow')}
          </button>
        </div>

        {/* History signal — prior-visit count (chronic ⟳ flag is a backend ask). */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-3 py-1.5">
          <span className="text-[11.5px] text-fg-muted">
            {priorVisits > 0
              ? `${t('workOrders.workItems.priorVisits', { count: priorVisits })}${lastServicedDate ? ` · ${t('workOrders.workItems.lastShort')} ${lastServicedDate}` : ''}`
              : t('workOrders.workItems.noPriorService')}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={openDrawer}
            className="text-[11.5px] !font-semibold text-fg-accent hover:underline"
          >
            {t('workOrders.workItems.historyArrow')}
          </button>
        </div>

        {/* Units — child equipment as compact pills (parent systems only). */}
        {(units.length > 0 || (!readOnly && onAddSubUnit)) && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">
              {`${getName('equipment_component', true)} · ${unitTotal}`}
            </span>
            {units.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onSelectSubUnit?.({ id: u.id, name: u.name })}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev py-0.5 pl-1 pr-2 text-[12px] font-medium text-fg-strong hover:text-fg-accent"
              >
                <EquipmentThumbnail
                  url={u.profileImageUrl}
                  name={u.name}
                  monogram
                  sizeClass="size-[18px]"
                  fit="cover"
                />
                <span>{u.name}</span>
                <ChevronRightIcon className="size-3 text-fg-dim" aria-hidden />
              </button>
            ))}
            {!readOnly && onAddSubUnit && (
              <button
                type="button"
                onClick={() => onAddSubUnit({ id: equipment.id, name: equipment.name })}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] leading-none !font-semibold text-fg-accent hover:underline"
              >
                <PlusIcon className="size-3" />
                {t('common.actions.add', { entity: getName('equipment_component') })}
              </button>
            )}
          </div>
        )}

        {/* Media — photos on file (34px tiles) + on-site capture. */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {orderedImages.slice(0, 4).map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="block size-[34px] overflow-hidden rounded bg-bg-elev-2 ring-1 ring-border hover:ring-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title={img.caption ?? t('equipment.images.openFullSize')}
              >
                <img
                  src={img.thumbnailUrl ?? img.url}
                  alt={img.caption ?? ''}
                  className="size-full object-contain"
                  loading="lazy"
                />
              </button>
            ))}
            {orderedImages.length > 4 && (
              <button
                type="button"
                onClick={() => setLightboxIndex(4)}
                className="flex size-[34px] items-center justify-center rounded text-[10.5px] font-semibold text-fg-muted ring-1 ring-border hover:text-fg-accent"
              >
                +{orderedImages.length - 4}
              </button>
            )}
            {!hasImages && (
              <span className="text-[11.5px] text-fg-dim">{t('workOrders.workItems.noPhotosYet')}</span>
            )}
          </div>
          <span className="flex-1" />
          {!readOnly && (
            <Button plain size="xxs" onClick={() => setUploadOpen(true)}>
              <CameraIcon data-slot="icon" />
              {t('workOrders.workItems.capture')}
            </Button>
          )}
        </div>
      </div>

      <EquipmentPhotoLightbox
        equipmentId={equipment.id}
        images={orderedImages}
        startIndex={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        readOnly={readOnly}
      />
      <EquipmentImageUploadDialog
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        equipmentId={equipment.id}
        defaultSetProfile={!hasImages}
      />
    </section>
  );
}
