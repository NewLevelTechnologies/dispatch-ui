import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PlusIcon } from '@heroicons/react/24/outline';
import { equipmentApi, type EquipmentSummary } from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import EquipmentThumbnail from './EquipmentThumbnail';
import { Pill } from './ui/Pill';
import { Button } from './catalyst/button';

function warrantyState(expiresAt?: string | null): 'covered' | 'expired' | null {
  if (!expiresAt) return null;
  return new Date(expiresAt) >= new Date() ? 'covered' : 'expired';
}

interface Props {
  /** Scopes the candidate list to this WO's service location. */
  serviceLocationId?: string;
  /** Currently-attached equipment id — highlighted in the list. */
  value?: string | null;
  /** Pass an id to attach; pass null (via the header Clear) to detach. */
  onPick: (equipmentId: string | null) => void;
  /** "Add new equipment on site" → opens the create dialog with the location locked. */
  onAddNew?: () => void;
  /** Back out of the picker — only shown when there's a state to return to. */
  onCancel?: () => void;
  /** "This item doesn't need equipment" → detach + mark not-needed. */
  onNotNeeded?: () => void;
  /** Attach in flight — dims + disables the rows. */
  busy?: boolean;
}

/**
 * Inline attach-equipment picker on a work-item card (mock §WOEquipmentPicker):
 * a dashed accent panel listing the service location's equipment. Picking a row
 * attaches it to the work item.
 *
 * The mock previews per-candidate service signals (prior visits, chronic ⟳,
 * photo counts) at pick time. Those are per-equipment derivations we don't have
 * cheaply in a list response (they'd be N history + image round-trips), so rows
 * surface identity — make/model · type · SN · warranty — rather than faking the
 * signals. Surfacing history at pick time is a backend ask.
 */
export default function WOEquipmentPicker({
  serviceLocationId,
  value,
  onPick,
  onAddNew,
  onCancel,
  onNotNeeded,
  busy = false,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', { serviceLocationId, forPicker: true }],
    queryFn: () => equipmentApi.list({ serviceLocationId }),
    enabled: !!serviceLocationId,
  });
  const candidates: EquipmentSummary[] = data?.content ?? [];

  return (
    <section
      aria-label={t('workOrders.workItems.attachEquipment')}
      className="overflow-hidden"
      style={{
        border: '1px dashed color-mix(in oklch, var(--accent-500) 40%, var(--border))',
        borderRadius: 'var(--r-sm)',
        background: 'color-mix(in oklch, var(--accent-500) 4%, var(--bg-elev))',
      }}
    >
      {/* Header — title + why-pick hint + optional Cancel. */}
      <div className="flex items-center gap-2 border-b border-border-soft px-[11px] py-2">
        <span className="text-[12.5px] font-semibold text-fg-strong">
          {t('workOrders.workItems.attachEquipment')}
        </span>
        <span className="text-[11px] text-fg-muted">{t('workOrders.workItems.attachHint')}</span>
        <span className="flex-1" />
        {value && (
          <Button plain size="xxs" className="!text-danger-600" onClick={() => onPick(null)}>
            {t('common.clear')}
          </Button>
        )}
        {onCancel && (
          <Button plain size="xxs" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
        )}
      </div>

      {/* Candidates — the location's equipment. */}
      {isLoading ? (
        <div className="px-[11px] py-2.5 text-[11.5px] text-fg-dim">
          {t('common.actions.loading', { entities: getName('equipment', true) })}
        </div>
      ) : candidates.length === 0 ? (
        <div className="px-[11px] py-2.5 text-[11.5px] text-fg-dim">
          {t('workOrders.workItems.pickerEmpty', { entities: getName('equipment', true) })}
        </div>
      ) : (
        candidates.map((e) => {
          const makeModel = [e.make, e.model].filter(Boolean).join(' ');
          const warranty = warrantyState(e.warrantyExpiresAt);
          const meta = [
            e.equipmentTypeName,
            e.serialNumber && `${t('workOrders.workItems.serialAbbrev')} ${e.serialNumber}`,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <button
              key={e.id}
              type="button"
              disabled={busy}
              onClick={() => onPick(e.id)}
              className="flex w-full items-start gap-[9px] border-b border-border-soft px-[11px] py-2 text-left transition-colors hover:bg-bg-elev-2 disabled:opacity-50"
              style={
                e.id === value
                  ? { background: 'color-mix(in oklch, var(--accent-500) 8%, transparent)' }
                  : undefined
              }
            >
              <EquipmentThumbnail
                url={e.profileImageUrl}
                name={e.name}
                category={e.equipmentCategoryName}
                type={e.equipmentTypeName}
                monogram
                sizeClass="size-[30px]"
                fit="contain"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-semibold text-fg-strong">{e.name}</span>
                  {makeModel && <span className="text-[11px] text-fg-muted">{makeModel}</span>}
                  <span className="flex-1" />
                  {warranty && (
                    <Pill tone={warranty === 'covered' ? 'success' : 'neutral'} dot>
                      {warranty === 'covered'
                        ? t('workOrders.detail.overview.warrantyCovered')
                        : t('workOrders.detail.overview.warrantyExpired')}
                    </Pill>
                  )}
                </div>
                {meta && <div className="mt-[3px] text-[10.5px] text-fg-dim">{meta}</div>}
              </div>
            </button>
          );
        })
      )}

      {/* Add new — the caller routes to the full-page equipment create with the
          location pre-scoped ("creating a record is a page"); see onAddNew. */}
      {onAddNew && (
        <button
          type="button"
          onClick={onAddNew}
          className="flex w-full items-center gap-1.5 px-[11px] py-2.5 text-[12px] leading-none !font-semibold text-fg-accent hover:underline"
        >
          <PlusIcon className="size-3.5" />
          {t('workOrders.workItems.addEquipmentOnSite', { entity: getName('equipment') })}
        </button>
      )}

      {/* Escape hatch — this work item never touches equipment. Detaches +
          marks not-needed (writable: equipmentNeeded on the PATCH). */}
      {onNotNeeded && (
        <button
          type="button"
          onClick={onNotNeeded}
          className="block w-full border-t border-border-soft px-[11px] py-2.5 text-center text-[12px] text-fg-muted hover:text-fg"
        >
          {t('workOrders.workItems.noEquipmentNeededSet', {
            entity: getName('work_item'),
            equipmentEntity: getName('equipment'),
          })}
        </button>
      )}
    </section>
  );
}
