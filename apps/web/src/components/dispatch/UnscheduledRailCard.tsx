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
import { titleCaseAddress } from '@dispatch/utils';
import { formatAge } from '../../lib/boardTime';
import { formatMiles, type NearestStop } from '../../lib/nearestStop';

/** Priority drives the card's left rail, and ONLY when it means something:
 *  URGENT and HIGH get a tone, NORMAL and LOW get nothing. A coloured bar on
 *  every card flattens the one distinction that has to be instant.
 *
 *  The enum is LOW | NORMAL | HIGH | URGENT and there is no EMERGENCY — a
 *  tenant that calls its top tier "emergency" says so with a tag, which the
 *  card does not render here. */
const PRIORITY_CLASS: Record<string, string> = {
  URGENT: 'urgent',
  HIGH: 'high',
};

export default function UnscheduledRailCard({
  workOrder,
  regionName,
  divisionName,
  nearest,
  workOrderHref,
  onOpen,
  hovered,
  onHover,
}: {
  workOrder: UnscheduledWorkOrder;
  /** Already guarded by the caller: null unless board scope is "all regions".
   *  Printing one region on all eleven cards is noise. */
  regionName: string | null;
  divisionName: string | null;
  /** Who is already going near this site today. Absent when nothing is
   *  booked nearby, or when the location never geocoded. */
  nearest?: NearestStop;
  workOrderHref: (workOrderId: string) => string;
  onOpen: (workOrder: UnscheduledWorkOrder) => void;
  /** This job is being pointed at — possibly at its pin on the map rather
   *  than at this card. The highlight is symmetric because the page owns one
   *  hover id for both surfaces. */
  hovered?: boolean;
  onHover?: (workOrderId: string | null) => void;
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

  // The STREET, now that the board has a map.
  //
  // This reverses an earlier call here that the city was enough. That was
  // right when the rail was the only place unscheduled work appeared: an
  // address routes only for someone holding a mental map of the metro. The
  // map changed the premise — proximity reasoning is now visual, the card's
  // pin is one hover away, and the street is what tells two jobs apart.
  //
  // It also reclaims the slot. "Atlanta · Georgia" is city plus REGION name
  // (not state), and for a single-metro tenant both are constants — the
  // densest element on the board spending a line to say nothing.
  //
  // Falls back to the old line rather than promoting zip: zip distinguishes
  // streets across a metro, which is a tooltip's job, not a 262px card's.
  const street = titleCaseAddress(workOrder.serviceLocationStreet);
  const place =
    street ||
    [
      titleCaseAddress(workOrder.serviceLocationCity),
      // Region is dropped when it repeats the city, which tenant region names
      // frequently do (Phoenix, Tucson): saying one word twice burns the slot
      // this change exists to reclaim.
      regionName && regionName.toUpperCase() !== (workOrder.serviceLocationCity ?? '').toUpperCase()
        ? regionName
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

  const meta = [divisionName, place].filter(Boolean).join(' · ');

  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      className={`db-wo ${PRIORITY_CLASS[workOrder.priority] ?? ''}${dragging ? ' dragging' : ''}${
        hovered ? ' hot' : ''
      }`.trim()}
      // Answers "this job has been sitting 95 days — is it anywhere near
      // anyone I already have out there?" without a click-through: pointing
      // at the card grows its pin on the map.
      onMouseEnter={() => onHover?.(workOrder.workOrderId)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(workOrder.workOrderId)}
      onBlur={() => onHover?.(null)}
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

      {/* The context block. Separated from the identity above by SPACE, never
          a rule: an internal divider reads at the same weight as the card
          separator and turns the rail into continuous stripes with no
          findable card edge. */}
      {(meta || workOrder.itemCount > 1) && (
        <div className="mt-2 flex items-center gap-1.5">
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

      {/* The routing signal: who is ALREADY going to be near this today. A
          fact for comparison, never a recommendation — it names one stop and
          ranks nothing, because auto-assign is out of scope and this must not
          imply it. */}
      {nearest && (
        <div className="db-wo-near">
          <span className="db-near-icon">{'◉'}</span>
          <span className="db-near-who grow">
            {t('dispatchBoard.rail.nearest')}
            {' · '}
            <b>{nearest.techName}</b>
          </span>
          {/* The distance never truncates; the label absorbs all the width
              pressure. Otherwise a longer first name wraps and that one card
              grows taller than its siblings. */}
          <span className="font-mono">
            {t('dispatchBoard.rail.nearestDistance', {
              miles: formatMiles(nearest.miles),
              at: nearest.at,
            })}
          </span>
        </div>
      )}
    </div>
  );
}
