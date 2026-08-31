import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { CameraIcon, ChevronRightIcon, PlusIcon } from '@heroicons/react/24/outline';
import { equipmentApi, equipmentImagesApi, equipmentNotesApi, type WorkItemEquipmentSummary } from '../api/setup';
import { workOrdersListQueryOptions } from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { showError, extractApiError } from '../lib/toast';
import EquipmentThumbnail from './EquipmentThumbnail';
import EquipmentImageUploadDialog from './EquipmentImageUploadDialog';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';
import InlineComposer from './InlineComposer';
import TimeAgo from './TimeAgo';
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
  const queryClient = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addingNote, setAddingNote] = useState(false);

  // Lazy image list (media row + lightbox). Cache key matches EquipmentDetailPage
  // so uploads elsewhere invalidate this surface in lockstep.
  const { data: images = [] } = useQuery({
    queryKey: ['equipment-images', equipment.id],
    queryFn: () => equipmentImagesApi.list(equipment.id),
  });
  // Equipment-scoped notes — ONE shared source with the drawer's Notes section:
  // both read this exact cache key and both invalidate it on write, so a save
  // from either surface re-renders the other. No local notes state here (this
  // block stays mounted while the drawer opens/closes, so a local copy would go
  // stale the moment the drawer wrote).
  const { data: notesData } = useQuery({
    queryKey: ['equipment-notes', equipment.id],
    queryFn: () => equipmentNotesApi.list(equipment.id),
  });
  const notes = Array.isArray(notesData) ? notesData : [];
  const createNoteMutation = useMutation({
    mutationFn: (body: string) => equipmentNotesApi.create(equipment.id, { body }),
    onSuccess: () => {
      // Invalidate the shared key (drawer + this block) + the record's embedded
      // recentNotes projection — same set the drawer's Notes section invalidates.
      queryClient.invalidateQueries({ queryKey: ['equipment-notes', equipment.id] });
      queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipment.id] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      setAddingNote(false);
    },
    onError: (err) => showError(t('equipment.notes.addNote'), extractApiError(err) ?? undefined),
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
  // Count + most-recent both derive from the one notes list — never a separate
  // count field (a second source of truth for the same fact drifts).
  const mostRecentNote = notes.length
    ? [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    : null;

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
              category={equipment.equipmentCategoryName}
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
            {/* Metadata line — SN · installed · age · N prior · last date.
                Prior-visit count rides here (it's context, not an alert), so no
                separate history band. Chronic repeat-repair, when present, gets
                its own alert row below (backend ask — omitted until it lands). */}
            {(equipment.serialNumber || installedText || priorVisits > 0) && (
              <div className="truncate text-[10.5px] text-fg-dim">
                {equipment.serialNumber && (
                  <span className="font-mono">{`${t('workOrders.workItems.serialAbbrev')} ${equipment.serialNumber}`}</span>
                )}
                {installedText && (
                  <span>{`${equipment.serialNumber ? ' · ' : ''}${t('workOrders.workItems.installedShort')} ${installedText}`}</span>
                )}
                {priorVisits > 0 && (
                  <span>
                    {`${equipment.serialNumber || installedText ? ' · ' : ''}${t('workOrders.workItems.priorCount', { count: priorVisits })}${lastServicedDate ? ` · ${t('workOrders.workItems.lastShort')} ${lastServicedDate}` : ''}`}
                  </span>
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
            <Button ghost size="xxs" onClick={onChange}>
              {t('workOrders.workItems.change')}
            </Button>
          )}
          <button
            type="button"
            onClick={openDrawer}
            className="card-action relative top-[0.5px] shrink-0 whitespace-nowrap"
          >
            {t('workOrders.workItems.openRecordArrow')}
          </button>
        </div>

        {/* Units — child equipment as compact pills (parent systems only).
            Hidden entirely at zero units (no "Units · 0" scaffolding): the
            equipment drawer's Units section always renders, so adding the first
            unit stays reachable there. Once units exist, the row shows here with
            its own "+ Add unit". */}
        {units.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border-soft px-3 py-2">
            <span className="label-tiny relative top-[0.5px]">
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
              <Button
                ghost
                size="xxs"
                onClick={() => onAddSubUnit({ id: equipment.id, name: equipment.name })}
              >
                <PlusIcon data-slot="icon" />
                {t('common.actions.add', { entity: getName('equipment_component') })}
              </Button>
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
                {'+' + (orderedImages.length - 4)}
              </button>
            )}
            {!hasImages && (
              <span className="text-[11.5px] text-fg-dim">{t('workOrders.workItems.noPhotosYet')}</span>
            )}
          </div>
          <span className="flex-1" />
          {notes.length > 0 && (
            // Count from the notes list (single source); opens the drawer's full
            // Notes list. !text- forces the size over the unlayered body-inherit
            // that otherwise bumps a bare <button> to 13px.
            <button
              type="button"
              onClick={openDrawer}
              className="whitespace-nowrap !text-[11px] text-fg-muted hover:text-fg-accent"
            >
              {notes.length === 1
                ? t('workOrders.workItems.noteCountOne', { count: notes.length })
                : t('workOrders.workItems.noteCount', { count: notes.length })}
            </button>
          )}
          {!readOnly && (
            <Button ghost size="xxs" onClick={() => setUploadOpen(true)}>
              <CameraIcon data-slot="icon" />
              {t('workOrders.workItems.capture')}
            </Button>
          )}
          {!readOnly && (
            <Button ghost size="xxs" onClick={() => setAddingNote(true)}>
              <PlusIcon data-slot="icon" />
              {t('workOrders.workItems.note')}
            </Button>
          )}
        </div>

        {/* Most-recent equipment note — one clamped line (truncate, NOT
            line-clamp: as a flex item it blockifies and the ellipsis never
            renders) so an inline "+ Note" write is immediately visible. The full
            list lives in the record drawer. */}
        {!addingNote && mostRecentNote && (
          <div className="flex items-baseline gap-2 px-3 pb-2">
            <span className="min-w-0 truncate text-[11.5px] text-fg">
              {/* Decorative note marker — inside the truncating span so it clips
                  with the body as one line. */}
              {/* eslint-disable-next-line i18next/no-literal-string */}
              <span className="text-fg-dim" aria-hidden>⚲ </span>
              {mostRecentNote.body}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[10.5px] text-fg-dim">
              {mostRecentNote.authorName ? `${mostRecentNote.authorName} · ` : ''}
              <TimeAgo iso={mostRecentNote.createdAt} />
            </span>
          </div>
        )}

        {/* Inline note composer — same InlineComposer as complaint/diagnosis.
            The scope hint above it is load-bearing: these notes follow the
            equipment across every work order, not this job. */}
        {addingNote && (
          <div className="px-3 pb-2.5">
            <p className="mb-1.5 text-[10.5px] leading-normal text-fg-dim">
              {t('workOrders.workItems.noteScopeHint')}
            </p>
            <InlineComposer
              rows={2}
              placeholder={t('workOrders.workItems.notePlaceholder')}
              ariaLabel={t('equipment.notes.addNote')}
              onCancel={() => setAddingNote(false)}
              onSave={async (body) => {
                await createNoteMutation.mutateAsync(body);
              }}
            />
          </div>
        )}
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
