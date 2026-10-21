import { useRef, type KeyboardEvent } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { PlusIcon } from '@heroicons/react/16/solid';
import type { WorkItemResponse, WorkItemStatus } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { workItemLabel } from '@dispatch/utils';
import { progressRailColor } from '../../lib/workItemProgress';
import { isFinished } from '../../lib/workItemSteps';
import { Button } from '../catalyst/button';

interface Props {
  items: WorkItemResponse[];
  statuses: WorkItemStatus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  tripsByWorkItem?: Map<string, number[]>;
  onAdd?: () => void;
}

/**
 * The job's items as a short list: open first, then a "Done · N" group.
 * Rows are buttons — Enter/click selects; ↑/↓ walk the list while it has focus.
 */
export default function WorkItemRail({ items, statuses, selectedId, onSelect, tripsByWorkItem, onAdd }: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const listRef = useRef<HTMLDivElement>(null);
  const open = items.filter((w) => !isFinished(w));
  const done = items.filter(isFinished);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[data-wi-row]') ?? []);
    const at = rows.indexOf(document.activeElement as HTMLButtonElement);
    if (at === -1) return;
    e.preventDefault();
    const next = rows[Math.max(0, Math.min(rows.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))];
    next?.focus();
  };

  const row = (wi: WorkItemResponse) => (
    <RailRow
      key={wi.id}
      wi={wi}
      statusName={statuses.find((s) => s.id === wi.statusId)?.name}
      on={wi.id === selectedId}
      trips={tripsByWorkItem?.get(wi.id) ?? []}
      onClick={() => onSelect(wi.id)}
    />
  );

  return (
    <aside className="card wit-rail" aria-label={getName('work_item', true)}>
      <div className="card-head">
        <div className="card-title whitespace-nowrap">{getName('work_item', true)}</div>
        <span className="card-sub min-w-0 truncate">
          {t('workOrders.workItems.openTotalCount', { open: open.length, total: items.length })}
        </span>
        <span className="flex-1" />
        {/* The 280px rail can't fit "Add Work Item" beside the title and count;
            the card title already names the entity, so the button just says Add. */}
        {onAdd && (
          <Button
            outline
            size="xxs"
            className="shrink-0"
            onClick={onAdd}
            aria-label={t('common.actions.add', { entity: getName('work_item') })}
          >
            <PlusIcon data-slot="icon" />
            {t('common.add')}
          </Button>
        )}
      </div>
      <div ref={listRef} className="card-body flush" onKeyDown={onKeyDown}>
        {open.map(row)}
        {done.length > 0 && (
          <div className="wit-group">{t('workOrders.workItems.doneGroup', { count: done.length })}</div>
        )}
        {done.map(row)}
      </div>
    </aside>
  );
}

function RailRow({
  wi,
  statusName,
  on,
  trips,
  onClick,
}: {
  wi: WorkItemResponse;
  statusName?: string;
  on: boolean;
  trips: number[];
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const { getName, getAbbrev } = useGlossary();
  const blocked = wi.statusCategory === 'BLOCKED';
  const finished = isFinished(wi);
  const equipmentText = wi.equipment
    ? wi.equipment.name
    : wi.equipmentNeeded === false
      ? t('workOrders.workItems.noEquipmentShort', { entity: getName('equipment') })
      : t('workOrders.workItems.equipmentNotAttached', { entity: getName('equipment') });
  const tripText =
    trips.length > 0
      ? `${getName('dispatch')} ${trips.join(', ')}`
      : t('workOrders.detail.notScheduled');

  return (
    <button
      type="button"
      data-wi-row
      data-work-item-id={wi.id}
      aria-current={on ? 'true' : undefined}
      className={'wit-row' + (on ? ' on' : '')}
      onClick={onClick}
    >
      <span className="flex items-center gap-1.5">
        <span className="wit-dot" style={{ background: progressRailColor(wi.statusCategory) }} />
        <span className={`text-[11px] font-semibold ${blocked ? 'text-warning-fg' : 'text-fg-muted'}`}>
          {statusName ?? t(`workOrders.progress.${progressKey(wi.statusCategory)}`)}
        </span>
        <span className="flex-1" />
        {wi.sequence != null && (
          <span className="font-mono text-[10.5px] text-fg-muted">
            {workItemLabel(getAbbrev('work_item'), wi.sequence)}
          </span>
        )}
      </span>
      <span
        className={`wit-clamp text-[12.5px]/[1.4] font-semibold ${finished ? 'text-fg-muted' : 'text-fg-strong'}`}
      >
        {wi.description}
      </span>
      <span className="wit-ellipsis text-[11px] text-fg-muted">{`${equipmentText} · ${tripText}`}</span>
    </button>
  );
}

const PROGRESS_KEYS = {
  NOT_STARTED: 'notStarted',
  AWAITING_SCHEDULE: 'awaitingSchedule',
  IN_PROGRESS: 'inProgress',
  BLOCKED: 'blocked',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;
const progressKey = (c: WorkItemResponse['statusCategory']) => PROGRESS_KEYS[c];
