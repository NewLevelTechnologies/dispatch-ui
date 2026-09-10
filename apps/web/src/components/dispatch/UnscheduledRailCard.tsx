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
// ─────────────────────────────────────────────────────────────────────
import { useTranslation } from '@dispatch/i18n';
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
  onOpen,
}: {
  workOrder: UnscheduledWorkOrder;
  regionName: string | null;
  divisionName: string | null;
  onOpen: (workOrder: UnscheduledWorkOrder) => void;
}) {
  const { t } = useTranslation();
  const age = formatAge(workOrder.createdAt);

  // Prefer the summary; fall back to the number so a card is never blank
  // while the work-order cache catches up.
  const title = workOrder.workOrderSummary || workOrder.workOrderNumber;

  const meta = [divisionName, regionName].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      className={`db-wo ${PRIORITY_CLASS[workOrder.priority] ?? ''}`.trim()}
      onClick={() => onOpen(workOrder)}
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10.5px] font-semibold text-fg-strong">
          {workOrder.workOrderNumber}
        </span>
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
    </button>
  );
}
