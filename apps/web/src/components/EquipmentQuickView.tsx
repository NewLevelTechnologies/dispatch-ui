import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import {
  equipmentApi,
  equipmentCategoriesApi,
  equipmentFiltersApi,
  equipmentNotesApi,
  equipmentTypesApi,
  EquipmentStatus,
  type Equipment,
  type EquipmentImage,
  type EquipmentNote,
} from '../api/setup';
import { workOrdersListQueryOptions } from '../api/setup';
import { formatFilterSize } from '@dispatch/utils';
import { equipmentCreateUrl } from '../lib/equipmentCreate';
import { useGlossary } from '../contexts/GlossaryContext';
import ConfirmDialog from './ConfirmDialog';
import EquipmentImageUploadDialog from './EquipmentImageUploadDialog';
import EquipmentPhotoLightbox from './EquipmentPhotoLightbox';
import EquipmentThumbnail from './EquipmentThumbnail';
import { Button } from './catalyst/button';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Textarea } from './catalyst/textarea';
import { Text } from './catalyst/text';
import { Pill } from './ui/Pill';
import { CheckIcon, ChevronRightIcon, PencilIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

const DASH = '—';

interface Draft {
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  assetTag: string;
  locationOnSite: string;
  equipmentTypeId: string;
  equipmentCategoryId: string;
}

interface EquipmentQuickViewProps {
  equipmentId: string;
  /** Click handler for sub-unit chips — pushes the sub-unit onto the drawer stack. */
  onSelectSubUnit: (subUnit: { id: string; name: string }) => void;
}

/**
 * The canonical equipment RECORD peek (mock `screen-wo-equipment-drawer`),
 * rendered inside the slide-over. Read mode shows identity · scope reminder ·
 * Identification · Lifecycle · Units · Photos · Notes · Service history.
 * "Edit" opens an in-drawer form for identity + Identification (name, taxonomy,
 * make/model/serial/asset tag/location); specs, warranty, dates and filters are
 * deferred to the full page. Editing the record edits it everywhere.
 */
export default function EquipmentQuickView({ equipmentId, onSelectSubUnit }: EquipmentQuickViewProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const editing = draft !== null;

  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ['equipment-detail', equipmentId, { includeDescendants: true }],
    queryFn: () => equipmentApi.getById(equipmentId, { includeDescendants: true }),
  });
  const directChildren = equipment?.descendants ?? [];
  const { data: serviceHistoryData } = useQuery(workOrdersListQueryOptions({ equipmentId }));
  const { data: filters = [] } = useQuery({
    queryKey: ['equipment-filters', equipmentId],
    queryFn: () => equipmentFiltersApi.getAll(equipmentId),
  });
  // Taxonomy for the edit form's Type → Category cascade (fetched only in edit mode).
  const { data: types = [] } = useQuery({
    queryKey: ['equipment-types'],
    queryFn: () => equipmentTypesApi.getAll(),
    enabled: editing,
  });
  const { data: categoryOptions = [] } = useQuery({
    queryKey: ['equipment-categories', draft?.equipmentTypeId],
    queryFn: () => equipmentCategoriesApi.getAll(draft?.equipmentTypeId || undefined),
    enabled: editing && Boolean(draft?.equipmentTypeId),
  });

  const invalidateEquipmentRelatedCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['equipment-detail', equipmentId] });
    queryClient.invalidateQueries({ queryKey: ['equipment'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders'] });
    queryClient.invalidateQueries({ queryKey: ['work-orders-list'] });
  };

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      equipmentApi.update(equipmentId, {
        name: d.name,
        make: d.make || null,
        model: d.model || null,
        serialNumber: d.serialNumber || null,
        assetTag: d.assetTag || null,
        locationOnSite: d.locationOnSite || null,
        equipmentTypeId: d.equipmentTypeId || null,
        equipmentCategoryId: d.equipmentCategoryId || null,
      }),
    onSuccess: () => {
      invalidateEquipmentRelatedCaches();
      setDraft(null);
    },
    onError: (err) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('common.form.errorUpdate', { entity: getName('equipment') }));
    },
  });

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

  const startEdit = () =>
    setDraft({
      name: equipment.name ?? '',
      make: equipment.make ?? '',
      model: equipment.model ?? '',
      serialNumber: equipment.serialNumber ?? '',
      assetTag: equipment.assetTag ?? '',
      locationOnSite: equipment.locationOnSite ?? '',
      equipmentTypeId: equipment.equipmentTypeId ?? '',
      equipmentCategoryId: equipment.equipmentCategoryId ?? '',
    });
  const patch = (next: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...next } : d));

  // Subtitle + read grid use the app's convention: Type is the broad parent
  // ("HVAC"), Category the specific child ("Rooftop Unit"). (The mock's
  // Category/Type labels are the inverse of the app's — we keep the app's so
  // the drawer stays consistent with the list, detail page and edit form.)
  const typeCategory = [equipment.equipmentTypeName, equipment.equipmentCategoryName]
    .filter(Boolean)
    .join(' · ');
  const warranty = warrantyState(equipment.warrantyExpiresAt);
  const warrantyLabel =
    warranty === 'covered'
      ? t('workOrders.detail.overview.warrantyCovered')
      : warranty === 'expired'
        ? t('workOrders.detail.overview.warrantyExpired')
        : DASH;
  const filtersLabel = filters
    .map((f) => (f.quantity > 1 ? `${formatFilterSize(f)} ×${f.quantity}` : formatFilterSize(f)))
    .join(' · ');
  const installedLabel = equipment.installDate
    ? [fmtMonthYear(equipment.installDate), ageYears(equipment.installDate)].filter(Boolean).join(' · ')
    : DASH;
  const lastServicedLabel = equipment.lastServicedAt
    ? `${fmtMonthDay(equipment.lastServicedAt)} · ${t('equipment.detail.autoDerived')}`
    : DASH;

  const orderedImages: EquipmentImage[] = (equipment.images ?? [])
    .slice()
    .sort((a, b) => {
      if (a.isProfile && !b.isProfile) return -1;
      if (!a.isProfile && b.isProfile) return 1;
      return a.sortOrder - b.sortOrder;
    });
  const hasImages = orderedImages.length > 0;
  const historyContent = serviceHistoryData?.content ?? [];
  const historyTotal = serviceHistoryData?.totalElements ?? historyContent.length;

  return (
    <div className="flex flex-col">
      {/* Identity band — 64px thumb + name (input when editing) + status/warranty. */}
      <div className="flex items-start gap-3.5 border-b border-border-soft px-4 py-3.5">
        {hasImages && equipment.profileImageUrl && !editing ? (
          <button
            type="button"
            onClick={() => setLightboxIndex(0)}
            aria-label={t('equipment.images.openFullSize')}
            className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <EquipmentThumbnail url={equipment.profileImageUrl} name={equipment.name} category={equipment.equipmentCategoryName} type={equipment.equipmentTypeName} monogram sizeClass="size-16" fit="contain" />
          </button>
        ) : (
          <EquipmentThumbnail url={equipment.profileImageUrl} name={equipment.name} category={equipment.equipmentCategoryName} type={equipment.equipmentTypeName} monogram sizeClass="size-16" fit="contain" />
        )}
        <div className="min-w-0 flex-1">
          {editing && draft ? (
            <Input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              aria-label={t('common.form.name')}
              className="font-bold"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight text-fg-strong">{equipment.name}</span>
              <Pill tone={equipment.status === EquipmentStatus.ACTIVE ? 'success' : 'neutral'} dot>
                {t(`equipment.status.${equipment.status.toLowerCase()}`)}
              </Pill>
            </div>
          )}
          {typeCategory && (
            <div className={`text-[12px] text-fg-muted ${editing ? 'mt-1' : 'mt-0.5'}`}>{typeCategory}</div>
          )}
          {warranty && !editing && (
            <div className="mt-1.5">
              <Pill tone={warranty === 'covered' ? 'success' : 'neutral'} dot>{warrantyLabel}</Pill>
            </div>
          )}
        </div>
      </div>

      {/* Scope reminder — swaps to the "applies everywhere" warning in edit mode. */}
      <div className="border-b border-border-soft bg-bg-elev-2 px-4 py-2 text-[11px] leading-snug text-fg-muted">
        {editing ? t('equipment.detail.editScopeReminder') : t('equipment.detail.scopeReminder')}
      </div>

      {/* Identification — read grid, or an edit form. */}
      <DSection
        label={t('equipment.detail.identification')}
        action={
          !editing && (
            <SectionAction icon={<PencilIcon className="size-[10px]" />} label={t('common.edit')} onClick={startEdit} />
          )
        }
      >
        {editing && draft ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex gap-2.5">
              <EField label={t('equipment.detail.type')}>
                <Select
                  size="xs"
                  value={draft.equipmentTypeId}
                  onChange={(e) => patch({ equipmentTypeId: e.target.value, equipmentCategoryId: '' })}
                  aria-label={t('equipment.detail.type')}
                >
                  <option value="">{DASH}</option>
                  {types.map((ty) => (
                    <option key={ty.id} value={ty.id}>{ty.name}</option>
                  ))}
                </Select>
              </EField>
              <EField label={t('equipment.detail.category')}>
                <Select
                  size="xs"
                  value={draft.equipmentCategoryId}
                  onChange={(e) => patch({ equipmentCategoryId: e.target.value })}
                  disabled={!draft.equipmentTypeId}
                  aria-label={t('equipment.detail.category')}
                >
                  <option value="">{DASH}</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </EField>
            </div>
            <div className="flex gap-2.5">
              <EField label={t('equipment.detail.make')}>
                <Input size="xs" value={draft.make} onChange={(e) => patch({ make: e.target.value })} aria-label={t('equipment.detail.make')} />
              </EField>
              <EField label={t('equipment.detail.model')}>
                <Input size="xs" value={draft.model} onChange={(e) => patch({ model: e.target.value })} aria-label={t('equipment.detail.model')} />
              </EField>
            </div>
            <div className="flex gap-2.5">
              <EField label={t('equipment.detail.serial')}>
                <Input size="xs" value={draft.serialNumber} onChange={(e) => patch({ serialNumber: e.target.value })} aria-label={t('equipment.detail.serial')} className="font-mono" />
              </EField>
              <EField label={t('equipment.detail.assetTag')}>
                <Input size="xs" value={draft.assetTag} onChange={(e) => patch({ assetTag: e.target.value })} aria-label={t('equipment.detail.assetTag')} className="font-mono" />
              </EField>
            </div>
            <EField label={t('equipment.detail.locationOnSite')}>
              <Input size="xs" value={draft.locationOnSite} onChange={(e) => patch({ locationOnSite: e.target.value })} aria-label={t('equipment.detail.locationOnSite')} />
            </EField>
            {/* Filters are structured (dimensioned) — managed on the full page. */}
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-fg-muted">{t('equipment.tabs.filters')}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {filters.length > 0 ? (
                  filters.map((f) => (
                    <span key={f.id} className="rounded bg-bg-active px-2 py-0.5 font-mono text-[11px] text-fg-strong">
                      {f.quantity > 1 ? `${formatFilterSize(f)} ×${f.quantity}` : formatFilterSize(f)}
                    </span>
                  ))
                ) : (
                  <span className="text-[12px] text-fg-dim">{t('equipment.detail.filtersNone')}</span>
                )}
                <RouterLink to={`/equipment/${equipment.id}`} className="text-[11.5px] font-semibold text-fg-accent hover:underline">
                  {t('equipment.detail.editOnFullPage')}
                </RouterLink>
              </div>
            </div>
          </div>
        ) : (
          <DGrid>
            <DRow label={t('equipment.detail.type')} value={equipment.equipmentTypeName || DASH} />
            <DRow label={t('equipment.detail.category')} value={equipment.equipmentCategoryName || DASH} />
            <DRow label={t('equipment.detail.make')} value={equipment.make || DASH} />
            <DRow label={t('equipment.detail.model')} value={equipment.model || DASH} />
            <DRow label={t('equipment.detail.serial')} value={equipment.serialNumber || DASH} mono />
            <DRow label={t('equipment.detail.assetTag')} value={equipment.assetTag || DASH} mono />
            <DRow label={t('equipment.detail.locationOnSite')} value={equipment.locationOnSite || DASH} />
            <DRow label={t('equipment.tabs.filters')} value={filtersLabel || DASH} mono />
          </DGrid>
        )}
      </DSection>

      {/* Lifecycle — always read-only (structured/derived); edit on the full page. */}
      <DSection label={t('equipment.detail.lifecycle')}>
        <DGrid>
          <DRow label={t('equipment.detail.installed')} value={installedLabel} />
          <DRow label={t('equipment.detail.lastServiced')} value={lastServicedLabel} />
          <DRow label={t('equipment.detail.warranty')} value={warrantyLabel} />
          {equipment.warrantyDetails && <DRow value={equipment.warrantyDetails} muted />}
        </DGrid>
        {editing && (
          <RouterLink
            to={`/equipment/${equipment.id}`}
            className="mt-2 inline-block text-[11.5px] font-semibold text-fg-accent hover:underline"
          >
            {t('equipment.detail.editLifecycleFullPage')}
          </RouterLink>
        )}
      </DSection>

      {/* Units — a parent system's child equipment. The work-item card hides its
          units row at zero to save space, so for a top-level system the drawer
          always renders this section (empty state "No units…" + "+ Add unit") as
          the guaranteed home for adding the first unit on site. When the drawer
          is showing a SUB-unit (has a parent), Units only renders if descendants
          exist and there's no "+ Add unit" — adding there would create a
          depth-2 record, which the units model (parent systems only) disallows. */}
      {(directChildren.length > 0 || !equipment.parentId) && (
        <DSection
          label={`${getName('equipment_component', true)}${directChildren.length ? ` · ${directChildren.length}` : ''}`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {directChildren.map((sub) => (
              <button
                key={sub.id}
                type="button"
                onClick={() => onSelectSubUnit({ id: sub.id, name: sub.name })}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-elev py-0.5 pl-1 pr-2 text-[12px] font-medium text-fg-strong hover:text-fg-accent"
              >
                <EquipmentThumbnail url={sub.profileImageUrl} name={sub.name} monogram sizeClass="size-[18px]" fit="cover" />
                <span>{sub.name}</span>
                <ChevronRightIcon className="size-3 text-fg-dim" aria-hidden />
              </button>
            ))}
            {directChildren.length === 0 && (
              <span className="text-[12px] text-fg-dim">
                {t('equipment.detail.noUnits', { entities: getName('equipment_component', true) })}
              </span>
            )}
            {!equipment.parentId && (
              <Button
                ghost
                size="xxs"
                onClick={() =>
                  navigate(
                    equipmentCreateUrl({
                      returnTo: routerLocation.pathname + routerLocation.search,
                      locationId: equipment.serviceLocationId,
                      parent: equipment.id,
                    })
                  )
                }
              >
                <PlusIcon data-slot="icon" />
                {t('common.actions.add', { entity: getName('equipment_component') })}
              </Button>
            )}
          </div>
        </DSection>
      )}

      {/* Photos */}
      <DSection
        label={`${t('equipment.detail.photos')} · ${orderedImages.length}`}
        action={
          <SectionAction
            icon={<PlusIcon className="size-3" />}
            label={t('equipment.images.addPhoto')}
            onClick={() => setIsImageUploadOpen(true)}
          />
        }
      >
        {hasImages ? (
          <div className="flex flex-wrap items-center gap-2">
            {orderedImages.slice(0, 4).map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightboxIndex(i)}
                className="relative size-[60px] overflow-hidden rounded-lg bg-bg-elev-2 ring-1 ring-border hover:ring-blue-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                title={img.caption ?? t('equipment.images.openFullSize')}
              >
                <img src={img.thumbnailUrl ?? img.url} alt={img.caption ?? ''} className="size-full object-contain" loading="lazy" />
                {img.isNameplate && (
                  <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-center text-[8px] font-bold uppercase tracking-wide text-white">
                    {t('equipment.images.nameplateBadge')}
                  </span>
                )}
              </button>
            ))}
            {orderedImages.length > 4 && (
              <button
                type="button"
                onClick={() => setLightboxIndex(4)}
                className="grid size-[60px] place-items-center rounded-lg text-[12px] font-semibold text-fg-muted ring-1 ring-border hover:text-fg-accent"
              >
                {/* Single text node: in a grid container `+{n}` renders two
                    children that each take a grid row, stacking "+" over the digit. */}
                {'+' + (orderedImages.length - 4)}
              </button>
            )}
          </div>
        ) : (
          <Text size="sm" tone="muted">{t('equipment.images.empty')}</Text>
        )}
      </DSection>

      {/* Notes — equipment-scoped, inline add. */}
      <NotesBlock
        equipmentId={equipmentId}
        recentNotes={equipment.recentNotes ?? []}
        noteCount={equipment.noteCount ?? 0}
        onChanged={invalidateEquipmentRelatedCaches}
      />

      {/* Service history — prior work orders that touched this unit (cross-job). */}
      {historyContent.length > 0 && (
        <DSection label={`${t('equipment.tabs.serviceHistory')} · ${historyTotal}`} last>
          <div className="flex flex-col">
            {historyContent.slice(0, 6).map((wo, i) => {
              const dateIso = wo.scheduledDate ?? wo.completedDate ?? wo.createdAt;
              const woNumber = wo.workOrderNumber ?? `#${wo.id.slice(0, 8)}`;
              const summary =
                (wo as { summary?: string | null }).summary?.trim() ||
                wo.workItems?.[0]?.description ||
                DASH;
              const tech = wo.assignedUsers?.[0]?.name ?? null;
              return (
                <RouterLink
                  key={wo.id}
                  to={`/work-orders/${wo.id}`}
                  className="flex items-baseline gap-2.5 py-2 hover:bg-bg-elev-2"
                  style={{ borderTop: i > 0 ? '1px solid var(--border-soft)' : 'none' }}
                >
                  <span className="shrink-0 whitespace-nowrap font-mono text-[11px] font-semibold text-fg-accent">{woNumber}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] text-fg-strong">{summary}</div>
                    <div className="text-[10.5px] text-fg-dim">
                      {dateIso ? fmtFullDate(dateIso) : ''}
                      {tech ? ` · ${tech}` : ''}
                    </div>
                  </div>
                </RouterLink>
              );
            })}
          </div>
        </DSection>
      )}

      {/* Sticky edit footer — appears only in edit mode. */}
      {editing && draft && (
        <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-border bg-bg-elev px-4 py-2.5">
          <span className="text-[11px] text-fg-dim">{t('equipment.detail.editScopeHint')}</span>
          <span className="flex-1" />
          <Button plain size="xs" onClick={() => setDraft(null)} disabled={saveMutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button color="accent" size="xs" onClick={() => saveMutation.mutate(draft)} disabled={saveMutation.isPending}>
            <CheckIcon data-slot="icon" />
            {saveMutation.isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      )}

      <EquipmentPhotoLightbox
        equipmentId={equipment.id}
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

// ── Notes — inline add + read (body · author · date). Edit/delete of an
// existing note live on the full equipment page (drawer keeps the peek calm).
function NotesBlock({
  equipmentId,
  recentNotes,
  noteCount,
  onChanged,
}: {
  equipmentId: string;
  recentNotes: EquipmentNote[];
  noteCount: number;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (body: string) => equipmentNotesApi.create(equipmentId, { body }),
    onSuccess: () => {
      onChanged();
      setDraft('');
      setComposing(false);
    },
    onError: (err) => {
      const msg =
        err instanceof Error && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      alert(msg || t('equipment.notes.errorCreate'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) =>
      equipmentNotesApi.update(equipmentId, noteId, { body }),
    onSuccess: onChanged,
    onError: () => alert(t('equipment.notes.errorUpdate')),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) => equipmentNotesApi.delete(equipmentId, noteId),
    onSuccess: onChanged,
    onError: () => alert(t('equipment.notes.errorDelete')),
  });

  return (
    <>
      <DSection
      label={`${t('equipment.notes.heading')} · ${noteCount}`}
      action={
        !composing && (
          <SectionAction
            icon={<PlusIcon className="size-3" />}
            label={t('equipment.notes.addNote')}
            onClick={() => setComposing(true)}
          />
        )
      }
    >
      {composing && (
        <div className="mb-2 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder={t('equipment.notes.composerPlaceholder')}
            aria-label={t('equipment.notes.composerLabel')}
          />
          <div className="flex items-center justify-end gap-2">
            <Button plain size="xs" onClick={() => { setComposing(false); setDraft(''); }} disabled={createMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button color="accent" size="xs" onClick={() => draft.trim() && createMutation.mutate(draft.trim())} disabled={!draft.trim() || createMutation.isPending}>
              {createMutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </div>
      )}
      {recentNotes.length === 0 && !composing ? (
        <Text size="sm" tone="muted">{t('equipment.notes.none')}</Text>
      ) : (
        <div className="flex flex-col">
          {recentNotes.map((note, i) => (
            <DrawerNoteRow
              key={note.id}
              note={note}
              first={i === 0}
              onSave={(body) => updateMutation.mutateAsync({ noteId: note.id, body })}
              onDelete={() => setDeletingNoteId(note.id)}
              pending={
                (updateMutation.isPending && updateMutation.variables?.noteId === note.id) ||
                (deleteMutation.isPending && deleteMutation.variables === note.id)
              }
            />
          ))}
        </div>
      )}
      </DSection>
      <ConfirmDialog
        isOpen={deletingNoteId !== null}
        onClose={() => setDeletingNoteId(null)}
        onConfirm={() => {
          if (deletingNoteId) deleteMutation.mutate(deletingNoteId);
        }}
        title={t('equipment.notes.deleteConfirm')}
        message={t('equipment.notes.deleteMessage')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        isDestructive
        isPending={deleteMutation.isPending}
      />
    </>
  );
}

// A single equipment note — click the body to edit inline (⌘/Ctrl+Enter or blur
// saves, Esc reverts); trash deletes with a confirm. Hover reveals the actions.
function DrawerNoteRow({
  note,
  first,
  onSave,
  onDelete,
  pending,
}: {
  note: EquipmentNote;
  first: boolean;
  onSave: (body: string) => Promise<unknown>;
  onDelete: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const start = () => {
    setDraft(note.body);
    setEditing(true);
  };
  const commit = async () => {
    const next = draft.trim();
    if (!next || next === note.body) {
      setEditing(false);
      setDraft(note.body);
      return;
    }
    try {
      await onSave(next);
      setEditing(false);
    } catch {
      // Stay in edit mode — the parent surfaced the error.
    }
  };
  const cancel = () => {
    setDraft(note.body);
    setEditing(false);
  };

  const borderTop = first ? 'none' : '1px solid var(--border-soft)';

  if (editing) {
    return (
      <div className="py-2" style={{ borderTop }}>
        <Textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          rows={2}
          disabled={pending}
          aria-label={t('equipment.notes.composerLabel')}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button plain size="xs" onClick={cancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button color="accent" size="xs" onClick={() => void commit()} disabled={!draft.trim() || pending}>
            {pending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group py-2" style={{ borderTop }}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={start}
          className="min-w-0 flex-1 whitespace-pre-wrap text-left text-[12.5px] leading-normal text-fg hover:text-fg-strong"
          title={t('equipment.notes.editHover')}
        >
          {note.body}
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={start}
            disabled={pending}
            aria-label={t('common.edit')}
            className="rounded p-1 text-fg-muted hover:text-fg-strong disabled:opacity-50"
          >
            <PencilIcon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            aria-label={t('common.delete')}
            className="rounded p-1 text-fg-muted hover:text-rose-600 disabled:opacity-50 dark:hover:text-rose-400"
          >
            <TrashIcon className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-0.5 text-[10.5px] text-fg-dim">
        {note.authorName ?? t('equipment.notes.systemAuthor')} · {fmtFullDate(note.createdAt)}
      </div>
    </div>
  );
}

// Section-level actions (Edit / + Add photo / + Add note) — accent, 11.5px/600,
// the only colored element in the section-header row. `!font-semibold` beats
// Preflight's `button { font: inherit }` weight reset; the icon inherits accent.
function SectionAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[11.5px] leading-none !font-semibold text-fg-accent hover:underline"
    >
      {icon}
      {label}
    </button>
  );
}

function EField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-fg-muted">{label}</span>
      {children}
    </label>
  );
}

interface DSectionProps {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}

function DSection({ label, action, children, last }: DSectionProps) {
  return (
    <div className={`px-4 py-3 ${last ? '' : 'border-b border-border-soft'}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-fg-muted">{label}</span>
        <span className="flex-1" />
        {action}
      </div>
      {children}
    </div>
  );
}

function DGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">{children}</dl>;
}

function DRow({ label, value, mono, muted }: { label?: string; value: string; mono?: boolean; muted?: boolean }) {
  return (
    <>
      <dt className="self-center whitespace-nowrap text-[11.5px] text-fg-muted">{label}</dt>
      <dd className={`self-center text-right text-[12.5px] ${muted ? 'text-fg-muted' : 'text-fg-strong'} ${mono ? 'font-mono' : ''}`}>
        {value}
      </dd>
    </>
  );
}

function warrantyState(expiresAt?: string | null): 'covered' | 'expired' | null {
  if (!expiresAt) return null;
  return new Date(expiresAt) >= new Date() ? 'covered' : 'expired';
}

function fmtMonthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function fmtMonthDay(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtFullDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? DASH
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function ageYears(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const yrs = Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
  return yrs >= 1 ? `${yrs} yr` : null;
}

// Re-export Equipment type for convenience.
export type { Equipment };
