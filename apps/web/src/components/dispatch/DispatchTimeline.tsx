// ─────────────────────────────────────────────────────────────────────
// Spine A — the clock timeline. A RENDERER, not a page.
//
// Filters, grouping, date scope, density, selection and the drawer all live
// in DispatchBoardPage and arrive here as one uniform prop bag. Adding the
// capacity spine later must mean a new file plus one switch entry and
// nothing else; if it needs to touch filter or drawer code, this seam is
// wrong (handoff §3.2).
//
// The load-bearing idea: A BLOCK IS THE ARRIVAL WINDOW, and the estimate is
// an inner fill. Our data has windows (a promise to the customer) and a
// nullable labor estimate, not exact start/end times — drawing a hard bar
// from 9:00 to 10:30 would assert precision we do not have. The gap between
// box and fill is visible slack. Do not "fix" this into a start–end bar.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { BoardDispatch, BoardTech } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Avatar } from '../ui/Avatar';
import { statusClass } from '../../lib/dispatchStatus';
import { DENSITY_METRICS, type Density, type SpineProps } from './spine';
import { hourAtPointer, resolveDrop } from '../../lib/boardDrop';
import {
  axisPct,
  findClashes,
  formatHour,
  formatWindow,
  zonedHour,
} from '../../lib/boardTime';

interface Window {
  start: number;
  end: number;
}

/** Window bounds in tenant-local fractional hours, or null when either end
 *  is unparseable — a block we cannot place is skipped rather than drawn at
 *  hour zero. */
function windowOf(dispatch: BoardDispatch, timeZone: string): Window | null {
  const start = zonedHour(dispatch.arrivalWindowStart, timeZone);
  const end = zonedHour(dispatch.arrivalWindowEnd, timeZone);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

/** Absence spans as axis coordinates. An all-day span covers the whole axis,
 *  which reproduces the old whole-row look without special-casing it. */
function offSpans(
  tech: BoardTech,
  timeZone: string,
  axis: SpineProps['axis'],
): { start: number; end: number; label: string; allDay: boolean }[] {
  return (tech.timeOff ?? []).map((span) => {
    if (span.allDay) {
      return { start: axis.start, end: axis.end, label: span.label, allDay: true };
    }
    const start = zonedHour(span.startsAt, timeZone);
    const end = zonedHour(span.endsAt, timeZone);
    // An unplaceable span is treated as all-day rather than dropped: a row
    // exists, so the tech is off, and rendering them available is the one
    // error this board cannot afford to make permissively.
    if (start === null || end === null || end <= start) {
      return { start: axis.start, end: axis.end, label: span.label, allDay: true };
    }
    return {
      start: Math.max(axis.start, start),
      end: Math.min(axis.end, end),
      label: span.label,
      allDay: false,
    };
  });
}

/** True only when the tech is out for the WHOLE axis — that is what earns the
 *  hatched row and the suppressed load bar. A partial absence leaves the row
 *  a working row. */
function isOutAllDay(spans: { start: number; end: number; allDay: boolean }[], axis: SpineProps['axis']): boolean {
  return spans.some((s) => s.allDay || (s.start <= axis.start && s.end >= axis.end));
}

function TechCell({
  tech,
  stops,
  density,
  capacityStops,
  width,
  outAllDay,
  offLabel,
}: {
  tech: BoardTech;
  stops: number;
  density: Density;
  capacityStops: number | null;
  width: number;
  outAllDay: boolean;
  offLabel: string | null;
}) {
  const { t } = useTranslation();

  // Load is a STOP COUNT, never hours — no labor estimate exists platform-wide
  // to be a numerator. The denominator comes from the server; without it there
  // is no bar, only the count. A bar against a guessed capacity is decoration,
  // the same way a fill against a guessed duration would be.
  const pct =
    capacityStops != null && capacityStops > 0
      ? Math.min(100, (stops / capacityStops) * 100)
      : null;
  const loadClass =
    capacityStops != null && stops > capacityStops
      ? 'over'
      : capacityStops != null && stops >= capacityStops
        ? 'high'
        : '';

  // A tech covering more than one region still renders in exactly ONE row
  // (their primary group); the marker says the others exist. Rendering them
  // twice would let a double-book hide in plain sight.
  const extraRegions = Math.max(0, tech.regionIds.length - 1);

  return (
    <div className="db-techcol" style={{ width }}>
      {density === 'comfortable' && <Avatar name={tech.name} size="sm" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="db-tech-name">{tech.name}</span>
          {extraRegions > 0 && (
            <span
              className="shrink-0 text-[10.5px] font-bold text-fg-muted"
              title={t('dispatchBoard.grid.coversMoreRegions', { count: extraRegions })}
            >
              {`+${extraRegions}`}
            </span>
          )}
        </div>
        {density !== 'dense' && offLabel && (
          <span className="db-tech-meta">{offLabel}</span>
        )}
      </div>
      {!outAllDay && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[10.5px] text-fg-muted">
            {capacityStops != null ? `${stops}/${capacityStops}` : String(stops)}
          </span>
          {pct != null && (
            <span className={`db-load ${loadClass}`.trim()}>
              <i style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Block({
  dispatch,
  window,
  axis,
  density,
  clash,
  half,
  onOpen,
  workOrderHref,
  onContext,
}: {
  dispatch: BoardDispatch;
  window: Window;
  axis: SpineProps['axis'];
  density: Density;
  clash: boolean;
  half: 'upper' | 'lower' | null;
  onOpen: (dispatch: BoardDispatch) => void;
  workOrderHref: SpineProps['workOrderHref'];
  onContext: SpineProps['onContextDispatch'];
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const ref = useRef<HTMLAnchorElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        boardDrag: true,
        dispatchId: dispatch.id,
        // Duration rides along so a deliberately-widened window keeps its
        // length when it moves rows — only the start snaps.
        durationHours: window.end - window.start,
      }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [dispatch.id, window.start, window.end]);

  const left = axisPct(window.start, axis);
  const width = axisPct(window.end, axis) - left;

  // The estimate is minutes; the window is hours. Only drawn when present —
  // no estimate means an outline, which is the honest rendering of "we
  // promised a window, we don't know how long the work takes".
  const estHours = dispatch.estimatedDuration != null ? dispatch.estimatedDuration / 60 : null;
  const fillPct =
    estHours != null ? Math.min(100, (estHours / (window.end - window.start)) * 100) : null;

  const released = dispatch.releasedAt != null;
  const urgent = dispatch.priority === 'URGENT';

  const className = [
    'db-block',
    statusClass(dispatch.status),
    released ? '' : 'held',
    urgent ? 'urgent' : '',
    clash ? 'clash' : '',
    clash && half ? half : '',
  ]
    .filter(Boolean)
    .join(' ');

  const windowLabel = formatWindow(window.start, window.end);
  const title = dispatch.workOrderSummary ?? dispatch.workOrderNumber ?? '';

  return (
    // The block IS a link to its work order, so cmd-click and middle-click get
    // native new-tab behaviour — that is how a dispatcher reads a job without
    // losing the board. A plain click is intercepted for the drawer, which is
    // also what Enter does on a focused block. Dragging is unaffected: the
    // drag source attaches its own payload.
    <a
      ref={ref}
      href={workOrderHref(dispatch.workOrderId)}
      className={dragging ? `${className} dragging` : className}
      style={{ left: `${left}%`, width: `${width}%` }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        onOpen(dispatch);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // Shift-F10 and the menu key fire this too, with no pointer behind it
        // — anchor to the block itself rather than the top-left of the screen.
        const rect = e.currentTarget.getBoundingClientRect();
        const keyboard = e.clientX === 0 && e.clientY === 0;
        onContext(dispatch, {
          x: keyboard ? rect.left : e.clientX,
          y: keyboard ? rect.bottom : e.clientY,
        });
      }}
      title={[
        [title, dispatch.customerName, windowLabel].filter(Boolean).join(' · '),
        t('dispatchBoard.grid.blockHint', { entity: getName('work_order') }),
      ].join('\n')}
    >
      {fillPct != null && <span className="db-fill" style={{ width: `${fillPct}%` }} />}
      <span className="db-block-t">
        {dispatch.status === 'NO_SHOW' && <span className="text-danger-500">{'⊘ '}</span>}
        {urgent && dispatch.status !== 'NO_SHOW' && (
          <span className="text-danger-500">{'▲ '}</span>
        )}
        {dispatch.recurring && <span className="text-violet-500">{'⟳ '}</span>}
        {title}
      </span>
      {density === 'comfortable' && dispatch.customerName && (
        <span className="db-block-s">{dispatch.customerName}</span>
      )}
      {density !== 'dense' && (
        <span className="db-block-m">
          {[dispatch.workOrderNumber, windowLabel].filter(Boolean).join(' · ')}
          {estHours != null
            ? ` · ${t('dispatchBoard.grid.estimate', { hours: estHours.toFixed(1) })}`
            : ` · ${t('dispatchBoard.grid.noEstimate')}`}
        </span>
      )}
    </a>
  );
}

/**
 * One tech's lane, and the board's only drop target.
 *
 * Holds the geometry (x within the lane → an hour on the axis) and the drop
 * RULE (snap to a preset, refuse a window overlapping time off) so both are
 * written once and any future spine inherits them. What a drop DOES is the
 * page's business — the resolved window goes back up.
 */
function Lane({
  techId,
  spans,
  axis,
  onDrop,
  children,
}: {
  techId: string;
  spans: { start: number; end: number; allDay: boolean }[];
  axis: SpineProps['axis'];
  onDrop: SpineProps['onDrop'];
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);

  // Latest values for the drop handler without re-registering the target on
  // every render — re-registering mid-drag drops the gesture. Written in an
  // effect rather than during render, which React 19 forbids.
  const latest = useRef({ spans, axis, onDrop, techId });
  useEffect(() => {
    latest.current = { spans, axis, onDrop, techId };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => Boolean(latest.current.onDrop) && source.data?.boardDrag === true,
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source, location }) => {
        setOver(false);
        const cur = latest.current;
        const rect = el.getBoundingClientRect();
        const hour = hourAtPointer(
          location.current.input.clientX,
          { left: rect.left, width: rect.width },
          cur.axis,
        );
        const resolved = resolveDrop(hour, cur.spans, cur.axis);
        // A refusal is silent here: `canDrop` already withheld the affordance,
        // and a toast explaining a drop the lane visibly declined would be
        // scolding someone for something they could already see.
        if (!resolved.ok) return;
        cur.onDrop?.(cur.techId, resolved.window, source.data);
      },
    });
  }, []);

  return (
    <div ref={ref} className={`db-lane${over ? ' over' : ''}`}>
      {children}
    </div>
  );
}

export default function DispatchTimeline({
  groups,
  byTech,
  density,
  collapsed,
  onToggleGroup,
  onOpenDispatch,
  workOrderHref,
  onContextDispatch,
  axis,
  nowHour,
  capacityStops,
  timeZone,
  onDrop,
}: SpineProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { rowH, techW } = DENSITY_METRICS[density];

  const renderRow = (tech: BoardTech) => {
    const stops = (byTech[tech.id] ?? []).slice();

    // Placeable blocks only, ordered by window start. An unplaceable window
    // is dropped from the lane rather than drawn at the axis origin.
    const placed = stops
      .map((dispatch) => ({ dispatch, window: windowOf(dispatch, timeZone) }))
      .filter((entry): entry is { dispatch: BoardDispatch; window: Window } => entry.window !== null)
      .sort((a, b) => a.window.start - b.window.start);

    const clashing = findClashes(
      placed.map((entry) => ({
        id: entry.dispatch.id,
        start: entry.window.start,
        end: entry.window.end,
      }))
    );

    // Alternate halves across the clashing set so two blocks that overlap
    // can never claim the same pixels.
    let clashSeen = 0;

    // Absences are lane overlays, not a row state: a tech out 8–12 is still
    // bookable at 2. Only an all-day absence hatches the whole row.
    const spans = offSpans(tech, timeZone, axis);
    const outAllDay = isOutAllDay(spans, axis);

    return (
      <div
        key={tech.id}
        className={['db-row', outAllDay ? 'off' : '', clashing.size > 0 ? 'clashrow' : '']
          .filter(Boolean)
          .join(' ')}
        style={{ height: rowH }}
      >
        <TechCell
          tech={tech}
          stops={tech.stopCount}
          density={density}
          capacityStops={capacityStops}
          width={techW}
          outAllDay={outAllDay}
          // All-day only: the row is hatched and has no load bar, so the
          // meta slot is free to carry the reason. A partial absence is a
          // working row — its label belongs in the lane, on the span.
          offLabel={outAllDay ? (spans[0]?.label ?? null) : null}
        />
        <Lane
          techId={tech.id}
          spans={spans}
          axis={axis}
          onDrop={onDrop}
        >
          <span className="db-lane-cells">
            {axis.hours.map((hour) => (
              <i key={hour} />
            ))}
          </span>

          {/* One overlay per absence. Each rejects drops over its own slice;
              the rest of the lane stays a normal drop target. */}
          {spans.map((span, i) => {
            const left = axisPct(span.start, axis);
            const width = axisPct(span.end, axis) - left;
            return (
              <span
                key={`${span.start}-${span.end}-${i}`}
                className={`db-off${span.allDay ? ' allday' : ''}`}
                style={{ left: `${left}%`, width: `${width}%` }}
                title={span.label}
              >
                <span className="db-off-label">
                  {span.allDay
                    ? t('dispatchBoard.grid.offNotDroppable', { label: span.label })
                    : span.label}
                </span>
              </span>
            );
          })}

          {placed.map((entry, index) => {
            const prev = placed[index - 1];
            const drive = entry.dispatch.driveMinFromPrev;
            // Spans prev.windowEnd → this.windowStart. Suppressed when the
            // gap is too narrow to letter, and absent on the first stop.
            const gap = prev ? entry.window.start - prev.window.end : 0;
            const showDrive = prev != null && drive != null && gap > 0.05;

            const clash = clashing.has(entry.dispatch.id);
            const half = clash ? (clashSeen++ % 2 === 0 ? 'upper' : 'lower') : null;

            return (
              <div key={entry.dispatch.id} className="contents">
                {showDrive && (
                  <span
                    className={`db-drive${drive > 30 ? ' long' : ''}`}
                    style={{
                      left: `${axisPct(prev.window.end, axis)}%`,
                      width: `${axisPct(entry.window.start, axis) - axisPct(prev.window.end, axis)}%`,
                      top: rowH / 2,
                    }}
                  >
                    {rowH > 34 && (
                      <span>{t('dispatchBoard.grid.driveMinutes', { minutes: drive })}</span>
                    )}
                  </span>
                )}
                <Block
                  dispatch={entry.dispatch}
                  window={entry.window}
                  axis={axis}
                  density={density}
                  clash={clash}
                  half={half}
                  onOpen={onOpenDispatch}
                  workOrderHref={workOrderHref}
                  onContext={onContextDispatch}
                />
              </div>
            );
          })}

          {nowHour != null && nowHour >= axis.start && nowHour <= axis.end && (
            <span className="db-now" style={{ left: `${axisPct(nowHour, axis)}%` }} />
          )}
        </Lane>
      </div>
    );
  };

  return (
    <div className="db-grid">
      <div className="db-head">
        <div className="db-techcol" style={{ width: techW }}>
          {getName('technician')}
        </div>
        <div className="db-hours">
          {axis.hours.map((hour) => (
            <div className="db-hour" key={hour}>
              {formatHour(hour)}
            </div>
          ))}
        </div>
      </div>

      {groups.map((group) => {
        const isCollapsed = collapsed.includes(group.key);
        return (
          <div className="db-group" key={group.key}>
            {/* No lone group header: one group means no grouping, which is
                precisely the chrome the self-hide rules suppress. */}
            {group.label != null && (
              <button
                type="button"
                className="db-group-head"
                aria-expanded={!isCollapsed}
                onClick={() => onToggleGroup(group.key)}
              >
                <ChevronRightIcon
                  className={`size-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                />
                {group.label}
                <span className="font-mono font-semibold text-fg-muted">
                  {String(group.techs.length)}
                </span>
                {isCollapsed && (
                  <span className="font-medium normal-case tracking-normal text-fg-muted">
                    {t('dispatchBoard.grid.groupSummary', {
                      stops: group.stops,
                      entity: getName('dispatch', true).toLowerCase(),
                    })}
                    {group.held > 0
                      ? t('dispatchBoard.grid.groupHeld', { count: group.held })
                      : ''}
                  </span>
                )}
              </button>
            )}
            {!isCollapsed && group.techs.map(renderRow)}
          </div>
        );
      })}
    </div>
  );
}
