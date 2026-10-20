import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { CheckIcon, MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/16/solid';
import { equipmentApi, type EquipmentSummary } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import EquipmentThumbnail from '../EquipmentThumbnail';
import { Tag } from '../ui/Pill';
import { localDate, shortDate } from './format';

interface Props {
  serviceLocationId?: string;
  /** Currently attached equipment — tagged "Current" with a check. */
  value: string | null;
  onPick: (equipmentId: string) => void;
  onCancel: () => void;
  onAddNew?: () => void;
  onNotNeeded?: () => void;
  /** Shown above the list on a change when the item already has findings/photos. */
  warning?: string | null;
  busy?: boolean;
}

/**
 * Narrow equipment picker for the 290px right column (the wide
 * WOEquipmentPicker crams there). Rows carry no pills so nothing clips; the
 * one wrapping meta line holds the warranty and last service.
 */
export default function WorkItemEquipmentPicker({
  serviceLocationId,
  value,
  onPick,
  onCancel,
  onAddNew,
  onNotNeeded,
  warning,
  busy = false,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['equipment', { serviceLocationId, forPicker: true }],
    queryFn: () => equipmentApi.list({ serviceLocationId }),
    enabled: !!serviceLocationId,
  });
  const all: EquipmentSummary[] = useMemo(() => data?.content ?? [], [data]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((e) =>
      [e.name, e.make, e.model, e.serialNumber].filter(Boolean).join(' ').toLowerCase().includes(needle),
    );
  }, [all, q]);

  const entity = getName('equipment');

  return (
    <section aria-label={value ? t('workOrders.workItems.changeEquipment', { entity }) : t('workOrders.workItems.attachEquipmentTitle', { entity })}>
      <div className="flex items-center gap-2 px-3 pb-2 pt-2.5">
        <span className="text-[12.5px] font-semibold text-fg-strong">
          {value
            ? t('workOrders.workItems.changeEquipment', { entity })
            : t('workOrders.workItems.attachEquipmentTitle', { entity })}
        </span>
        <span className="flex-1" />
        <button type="button" className="card-action is-muted" onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
      {warning && <div className="mx-3 mb-2 text-[11.5px] text-warning-fg">{warning}</div>}
      <div className="px-3 pb-2">
        <label className="wit-pksearch">
          <MagnifyingGlassIcon className="size-3.5" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
            placeholder={t('workOrders.workItems.equipmentSearchPlaceholder')}
            aria-label={t('workOrders.workItems.equipmentSearchPlaceholder')}
          />
        </label>
      </div>
      <div className="wit-group border-t border-border-soft">
        {t('workOrders.workItems.atThisLocation', { count: all.length })}
      </div>
      <div className={`wit-pklist ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        {isLoading && <div className="p-3 text-[12px] text-fg-muted">{t('common.loading')}</div>}
        {list.map((e) => {
          const on = e.id === value;
          const covered = e.warrantyExpiresAt ? new Date(`${e.warrantyExpiresAt.slice(0, 10)}T23:59:59`) >= new Date() : null;
          return (
            <button
              key={e.id}
              type="button"
              className={'wit-pkrow' + (on ? ' on' : '')}
              onClick={() => onPick(e.id)}
            >
              <EquipmentThumbnail
                url={e.profileImageUrl}
                name={e.name}
                category={e.equipmentCategoryName}
                type={e.equipmentTypeName}
                monogram
                sizeClass="size-8"
                className="rounded-[7px]"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="wit-ellipsis text-[12.5px] font-semibold text-fg-strong">{e.name}</span>
                  {on && <Tag word>{t('workOrders.workItems.current')}</Tag>}
                </span>
                {(e.make || e.model) && (
                  <span className="wit-ellipsis mt-px text-[11px] text-fg-muted">
                    {[e.make, e.model].filter(Boolean).join(' ')}
                  </span>
                )}
                <span className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-fg-muted">
                  {covered !== null && (
                    <span className="inline-flex items-center gap-[5px] whitespace-nowrap">
                      <span
                        className="wit-dot"
                        style={{ background: covered ? 'var(--success-500)' : 'var(--fg-muted)' }}
                      />
                      {covered
                        ? t('workOrders.workItems.warrantyUntil', { date: localDate(e.warrantyExpiresAt!) })
                        : t('workOrders.workItems.warrantyExpired')}
                    </span>
                  )}
                  <span className="whitespace-nowrap">
                    {e.lastServicedAt
                      ? t('workOrders.workItems.lastService', { date: shortDate(e.lastServicedAt) })
                      : t('workOrders.workItems.noPriorService')}
                  </span>
                </span>
              </span>
              {on && <CheckIcon className="size-3.5 self-center text-accent-600" aria-hidden />}
            </button>
          );
        })}
        {!isLoading && list.length === 0 && (
          <div className="p-3 text-[12px] text-fg-muted">
            {q.trim()
              ? t('workOrders.workItems.nothingMatches', { q: q.trim() })
              : t('workOrders.workItems.noEquipmentAtLocation', { entity })}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        {onAddNew ? (
          <button type="button" className="card-action" onClick={onAddNew}>
            <PlusIcon aria-hidden />
            {t('workOrders.workItems.addNewEquipment', { entity: entity.toLowerCase() })}
          </button>
        ) : (
          <span />
        )}
        {onNotNeeded && (
          <button type="button" className="card-action is-muted" onClick={onNotNeeded}>
            {t('workOrders.workItems.noEquipmentNeededAction', { entity: entity.toLowerCase() })}
          </button>
        )}
      </div>
    </section>
  );
}
