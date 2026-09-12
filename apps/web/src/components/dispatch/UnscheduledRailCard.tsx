// ─────────────────────────────────────────────────────────────────────
// One rail card = one WORK ORDER, not one work item. A three-item order may
// need two visits, and which items a visit covers is the composer's
// decision — so the card carries the item COUNT and nothing more.
//
// The rail is also the board's only path into the composer: clicking a card
// opens DispatchFormDrawer for that work order. That is why there is no
// standalone "Schedule dispatch" button — the rail is already a better work
// order picker than a modal search would be, being scoped, sorted by
// priority then age, and on screen.
//
// The work-order NUMBER is a link out to the job itself. Scheduling it and
// reading it are different intents, so they get different targets: the card
// body composes, the number navigates.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { UnscheduledWorkOrder } from '../../api/setup';
import { Pill } from '../ui/Pill';
import { formatAge } from '../../lib/boardTime';

/** Priority drives the card's left rail. The enum is LOW | NORMAL | HIGH |
 *  URGENT and there is no EMERGENCY — a tenant that calls its top tier
 *  "emergency" says so with a tag, which the card does not render here. */
const PRIORITY_CLASS: Record<string, string> = {
  URGENT: 'urgent',
  HIGH: 'high',
};

export default function UnscheduledRailCard({
  workOrder,
  regionName,
  divisionName,
  workOrderHref,
  onOpen,
}: {
  workOrder: UnscheduledWorkOrder;
  regionName: string | null;
  divisionName: string | null;
  workOrderHref: (workOrderId: string) => string;
  onOpen: (workOrder: UnscheduledWorkOrder) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const age = formatAge(workOrder.createdAt);

  // `boardDrag` is what lanes gate on, so a stray drag from elsewhere on the
  // page can never land on the grid.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({ boardDrag: true, workOrderId: workOrder.workOrderId }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [workOrder.workOrderId]);

  // Prefer the summary; fall back to the number so a card is never blank
  // while the work-order cache catches up.
  const title = workOrder.workOrderSummary || workOrder.workOrderNumber;

  const meta = [divisionName, regionName].filter(Boolean).join(' · ');

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={`db-wo ${PRIORITY_CLASS[workOrder.priority] ?? ''}${dragging ? ' dragging' : ''}`.trim()}
      onClick={() => onOpen(workOrder)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onOpen(workOrder);
      }}
    >
      <div className="flex items-center gap-1.5">
        {/* stopPropagation, so the number opens the job while the card around
            it still opens the composer. */}
        <a
          className="db-wolink font-mono"
          href={workOrderHref(workOrder.workOrderId)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          title={t('dispatchBoard.rail.openWorkOrder', { number: workOrder.workOrderNumber })}
        >
          {workOrder.workOrderNumber}
        </a>
        {workOrder.priority === 'URGENT' && (
          <Pill tone="danger" dot>
            {t('dispatchBoard.rail.urgent')}
          </Pill>
        )}
        {workOrder.recurring && (
          <span
            title={t('dispatchBoard.rail.recurring')}
            className="text-[11px] text-violet-500"
          >
            {'⟳'}
          </span>
        )}
        <span className="grow" />
        {/* Age is the rail's tiebreak after priority, so it earns a slot. */}
        {age && <span className="font-mono text-[10.5px] text-fg-muted">{age}</span>}
      </div>

      <div className="db-wo-title">{title}</div>
      {workOrder.customerName && <div className="db-wo-sub">{workOrder.customerName}</div>}

      {(meta || workOrder.itemCount > 1) && (
        <div className="mt-1 flex items-center gap-1.5">
          {meta && <span className="text-[10.5px] text-fg-muted">{meta}</span>}
          <span className="grow" />
          {/* Only worth saying when it implies more than one visit might be
              needed — "1 item" is noise on every card. */}
          {workOrder.itemCount > 1 && (
            <span className="font-mono text-[10.5px] text-fg-muted">
              {t('dispatchBoard.rail.itemCount', { count: workOrder.itemCount })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
