import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { equipmentApi, type WorkItemResponse } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { formatFilterSize } from '@dispatch/utils';
import EquipmentThumbnail from '../EquipmentThumbnail';
import { Pill } from '../ui/Pill';
import { Button } from '../catalyst/button';
import WorkItemEquipmentPicker from './WorkItemEquipmentPicker';
import { ageInYears, localDate } from './format';

interface Props {
  wi: WorkItemResponse;
  serviceLocationId?: string;
  readOnly: boolean;
  /** Item already has findings or photos — changing equipment warns first. */
  hasRecords: boolean;
  onAttach: (equipmentId: string) => Promise<void> | void;
  onSetEquipmentNeeded: (needed: boolean) => Promise<void> | void;
  onAddNew?: () => void;
  onOpenEquipment: (equipment: { id: string; name: string }) => void;
}

const isCovered = (isoDate?: string | null): boolean | null =>
  isoDate ? new Date(`${isoDate.slice(0, 10)}T23:59:59`) >= new Date() : null;

/** Right-column Equipment card: the attached unit's facts, or attach/none states. */
export default function WorkItemEquipmentCard({
  wi,
  serviceLocationId,
  readOnly,
  hasRecords,
  onAttach,
  onSetEquipmentNeeded,
  onAddNew,
  onOpenEquipment,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const attached = wi.equipment;
  const noneNeeded = !attached && wi.equipmentNeeded === false;
  const entity = getName('equipment');

  const run = async (fn: () => Promise<void> | void) => {
    setBusy(true);
    try {
      await fn();
      setPicking(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-label={entity}>
      <div className="card-head">
        <div className="card-title">{entity}</div>
        <span className="flex-1" />
        {attached && !picking && !readOnly && (
          <button type="button" className="card-action" onClick={() => setPicking(true)}>
            {t('workOrders.workItems.change')}
          </button>
        )}
      </div>

      {picking && !readOnly ? (
        <WorkItemEquipmentPicker
          serviceLocationId={serviceLocationId}
          value={attached?.id ?? null}
          busy={busy}
          warning={
            attached && hasRecords
              ? t('workOrders.workItems.changeEquipmentWarning', { name: attached.name })
              : null
          }
          onPick={(id) => {
            if (id === attached?.id) return setPicking(false);
            void run(() => onAttach(id));
          }}
          onCancel={() => setPicking(false)}
          onAddNew={onAddNew}
          onNotNeeded={() => void run(() => onSetEquipmentNeeded(false))}
        />
      ) : attached ? (
        <AttachedEquipment
          equipmentId={attached.id}
          fallbackName={attached.name}
          onOpen={() => onOpenEquipment({ id: attached.id, name: attached.name })}
        />
      ) : noneNeeded ? (
        <div className="card-body text-[12px] text-fg-muted">
          {t('workOrders.workItems.noEquipmentNeeded')}
          {!readOnly && (
            <>
              {' · '}
              <button
                type="button"
                className="card-action"
                onClick={() =>
                  void run(async () => {
                    await onSetEquipmentNeeded(true);
                  }).then(() => setPicking(true))
                }
              >
                {t('workOrders.workItems.attach')}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="card-body">
          <div className="wit-empty stack">
            <span>{t('workOrders.workItems.notAttachedHint', { entity: entity.toLowerCase() })}</span>
            {!readOnly && (
              <Button outline size="xxs" onClick={() => setPicking(true)}>
                {t('workOrders.workItems.attachEquipmentTitle', { entity })}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function AttachedEquipment({
  equipmentId,
  fallbackName,
  onOpen,
}: {
  equipmentId: string;
  fallbackName: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  // Same key as the equipment detail page, so an edit there refreshes here.
  const { data: eq } = useQuery({
    queryKey: ['equipment-detail', equipmentId],
    queryFn: () => equipmentApi.getById(equipmentId),
  });

  const name = eq?.name ?? fallbackName;
  const kind = [eq?.equipmentCategoryName, eq?.equipmentTypeName].filter(Boolean).join(' · ');
  const parts = isCovered(eq?.warrantyExpiresAt);
  const labor = isCovered(eq?.warrantyLaborExpiresAt);
  const age = eq?.installDate ? ageInYears(eq.installDate) : null;

  const terms = [
    eq?.warrantyExpiresAt &&
      t('workOrders.workItems.warrantyParts', { date: localDate(eq.warrantyExpiresAt) }),
    eq?.warrantyLaborExpiresAt &&
      t('workOrders.workItems.warrantyLabor', { date: localDate(eq.warrantyLaborExpiresAt) }),
    eq?.warrantyDetails,
  ].filter(Boolean);

  const facts: [string, string, boolean?][] = [];
  const model = [eq?.make, eq?.model].filter(Boolean).join(' ');
  if (model) facts.push([t('workOrders.workItems.facts.model'), model]);
  if (eq?.serialNumber) facts.push([t('workOrders.workItems.facts.serial'), eq.serialNumber, true]);
  if (eq?.installDate)
    facts.push([
      t('workOrders.workItems.facts.installed'),
      age !== null
        ? `${localDate(eq.installDate)} · ${t('workOrders.workItems.facts.age', { count: age })}`
        : localDate(eq.installDate),
    ]);
  if (eq?.assetTag) facts.push([t('workOrders.workItems.facts.assetTag'), eq.assetTag, true]);
  if (eq?.locationOnSite) facts.push([t('workOrders.workItems.facts.location'), eq.locationOnSite]);
  if (eq?.filters?.length)
    facts.push([
      t('workOrders.workItems.facts.filters'),
      eq.filters.map((f) => `${f.quantity > 1 ? `${f.quantity}× ` : ''}${formatFilterSize(f)}`).join(', '),
    ]);

  return (
    <div className="card-body flush">
      <div className="wit-eqsec">
        <button type="button" className="flex min-w-0 items-center gap-2.5 text-left" onClick={onOpen}>
          <EquipmentThumbnail
            url={eq?.profileImageUrl}
            name={name}
            category={eq?.equipmentCategoryName}
            type={eq?.equipmentTypeName}
            monogram
            sizeClass="size-11"
            className="rounded-lg"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-fg-strong">{name}</span>
            {kind && <span className="block text-[11px] text-fg-muted">{kind}</span>}
          </span>
        </button>
        {(parts !== null || labor !== null) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <Pill tone={parts || labor ? 'success' : 'neutral'} dot>
              {parts || labor ? t('workOrders.workItems.inWarranty') : t('workOrders.workItems.warrantyExpired')}
            </Pill>
            {terms.length > 0 && <span className="text-[11px] text-fg-muted">{terms.join(' · ')}</span>}
          </div>
        )}
        {facts.length > 0 && (
          <dl className="wit-facts">
            {facts.map(([k, v, mono]) => (
              <div key={k} className="contents">
                <dt>{k}</dt>
                <dd className={mono ? 'mono font-mono' : undefined}>{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="wit-eqsec">
        <button type="button" className="card-action" onClick={onOpen}>
          {t('workOrders.workItems.openEquipmentRecord', { entity: getName('equipment').toLowerCase() })}
        </button>
      </div>
    </div>
  );
}
