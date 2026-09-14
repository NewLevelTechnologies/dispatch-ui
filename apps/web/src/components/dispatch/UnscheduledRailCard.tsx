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
import { formatSiteAddress } from '@dispatch/utils';
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
  regionAbbreviation,
  divisionName,
  nearest,
  workOrderHref,
  onOpen,
  hovered,
  onHover,
}: {
  workOrder: UnscheduledWorkOrder;
  /** The region's ABBREVIATION, not its name: on the identity row it competes
   *  with the identifier and the age for a fixed width, and the full name buys
   *  nothing there. Already guarded by the caller — null unless board scope is
   *  "all regions", since printing one region on all eleven cards of a
   *  narrowed board is noise. */
  regionAbbreviation: string | null;
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

  // The site's own name when it has one, the customer's otherwise — the rule
  // `ServiceLocationSearchResponse` states and `ServiceLocationPicker`
  // implements. This is what the board routes TO: `Kroger Co.` on eleven cards
  // is eleven different stores, while `Store #4412` is the one the truck is
  // going to. Most residential sites have no name, so the customer is the
  // right fallback rather than a placeholder.
  const siteLabel = workOrder.serviceLocationName || workOrder.customerName;

  // The COMPLETE address, on every card, always.
  //
  // Two earlier versions of this line were wrong in the same way. It printed
  // the city alone, then the street alone with a city fallback — both made the
  // card's shape depend on its content, and scanning a queue depends on the
  // same datum sitting in the same place on every card. It is also the datum a
  // dispatcher reads aloud, verifies against what a customer just said, and
  // reasons about proximity with; a partial address is one they have to open
  // the work order to trust.
  //
  // It wraps rather than truncates — half an address is not an address.
  const address = formatSiteAddress(
    {
      street: workOrder.serviceLocationStreet,
      city: workOrder.serviceLocationCity,
      state: workOrder.serviceLocationState,
      zip: workOrder.serviceLocationZip,
    },
    { separator: ' · ' },
  );

  // Scope metadata, not part of the address — a different kind of fact, not a
  // shorter version of the same one. Each element self-hides independently and
  // on many tenants the whole row is absent, which is the point: the address
  // line cost the card a line, and the rail's budget is about five visible
  // cards. Never rendered as an empty spacer to keep heights uniform — reach
  // down the queue is worth more than uniformity, and these conditions are
  // tenant- and scope-level anyway, so the cards stay uniform regardless.
  //
  // No `region !== city` guard: it used to sit on the address line where the
  // duplication was possible. On the meta row beside division it cannot occur,
  // and a content-dependent guard on a card's shape costs more in scanning
  // than it saves in words.
  // Division, region and item count are RECORD metadata — the same class of
  // fact as the identifier and the age they now sit between — so they ride the
  // identity row rather than a row of their own. That row ran half empty while
  // a dedicated one cost a full line plus its 12px separator, roughly 27px per
  // card, to print one or two short words.
  //
  // The order is a TRUNCATION PRIORITY, not a reading order: the group is the
  // row's only elastic element and clips from the end, so region goes last
  // because it is the one fact recoverable from the card — the address line
  // directly below already says "Phoenix, AZ". Division and item count appear
  // nowhere else, so they survive the clip.
  //
  // "×2" rather than "2 items": five characters cheaper on the row where width
  // is scarcest, which decides whether it survives on an urgent multi-item card.
  const facets = [
    divisionName,
    workOrder.itemCount > 1 ? t('dispatchBoard.rail.itemsShort', { count: workOrder.itemCount }) : null,
    regionAbbreviation,
  ]
    .filter(Boolean)
    .join(' · ');

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
            // Info, not violet: violet is the board's "live" tone (en route
            // / on site), and an agreement glyph is not a live state.
            className="text-[11px] text-info-500"
          >
            {'⟳'}
          </span>
        )}
        <span className="grow" />
        {facets && <span className="db-wo-facets">{facets}</span>}
        {/* Age is the rail's tiebreak after priority, so it earns a slot. */}
        {age && <span className="db-wo-age font-mono">{age}</span>}
      </div>

      <div className="db-wo-title">{title}</div>
      {siteLabel && <div className="db-wo-sub">{siteLabel}</div>}
      {address && <div className="db-wo-addr">{address}</div>}

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
