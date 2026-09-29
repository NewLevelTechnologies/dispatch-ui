// ─────────────────────────────────────────────────────────────────────
// Week — a GRANULARITY, not a spine (handoff §3.8).
//
// The week answers two questions the day board can't: WHICH DAY HAS ROOM,
// and MOVE THIS TO A FEW DAYS FROM NOW. Same rows, same filters, same
// drawers as the day board; only the lane changes.
//
// Cells are aggregates (`GET /scheduling/board/week`), because seven days of
// a 60-tech shop is ~2,000 dispatches and none would be legible at this
// scale. So a cell draws counts and flags, and clicking one opens a PEEK:
// that tech-day's stops, read on open. Stops in the peek drag onto other
// cells. The column header answers "which day has room" without scanning
// rows, and opens that day's board.
//
// A drop onto a cell carries a PERSON and a DAY — never a time. A moved
// visit keeps its window; a rail card opens the composer. The week never
// invents a window.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import {
  draggable,
  dropTargetForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type {
  BoardDispatch,
  BoardWeekCell,
  BoardWeekDayPending,
  BoardWeekTech,
  PendingRelease,
} from '../../api/setup';
import { Button } from '../catalyst/button';
import { useGlossary } from '../../contexts/GlossaryContext';
import { DISPATCH_PRESENTATION } from '../../lib/dispatchStatus';
import { isOutOfDate } from '../../lib/releaseState';
import { formatWindow, zonedHour } from '../../lib/boardTime';
import { isOutAllDay } from '../../lib/timeOff';
import { TechCell } from './BoardRows';
import { DENSITY_METRICS, loadClassFor, type Density } from './spine';

/** Which tech-day the peek is showing, and where to anchor it. */
export interface WeekPeek {
  techId: string;
  date: string;
  x: number;
  y: number;
}

export interface WeekProps {
  techs: BoardWeekTech[];
  regionLabel: (regionIds: string[]) => string | null;
  /** The seven dates, from the server — never recomputed here, so a week
   *  containing a DST change still has exactly seven columns. */
  days: string[];
  density: Density;
  capacityStops: number | null;
  /** Today in the TENANT's timezone, or null when the current week isn't on
   *  screen. Highlights the column a dispatcher is standing in. */
  today: string | null;
  /** Today in the tenant's zone, always — past days are read-only. */
  todayDate: string;
  timeZone: string;
  /** Go to one day's board — the column header, and the peek's footer. */
  onOpenDay: (date: string) => void;
  peek: WeekPeek | null;
  /** The peeked tech-day's stops; undefined while the read is in flight. */
  peekStops: BoardDispatch[] | undefined;
  onPeek: (peek: WeekPeek | null) => void;
  onOpenDispatch: (dispatch: BoardDispatch) => void;
  /** A peek stop dropped on a cell: another day, another tech, or both. */
  onDropDispatch: (dispatchId: string, fromDate: string, toTechId: string, toDate: string) => void;
  /** A rail card dropped on a cell: the composer, prefilled — no window. */
  onDropWorkOrder: (workOrderId: string, techId: string, date: string) => void;
  /** What each day's Release would send — the day board's number for that
   *  date. Release is per day; there is no week-wide release. */
  pendingByDay: BoardWeekDayPending[];
  onReleaseDay: (date: string, pending: PendingRelease) => void;
}

// Same convention as the shared formatters: only en-US ships today, and the
// app's i18n language is `en_US` — not a valid BCP 47 tag, so it must never
// reach Intl.
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

function utcDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Column header: "Mon 14". Parsed as UTC rather than handed to `new Date()`,
 *  because a bare YYYY-MM-DD is otherwise shifted a day for anyone west of
 *  Greenwich — which would label every column wrong. */
function dayLabel(date: string): string {
  return `${WEEKDAY.format(utcDate(date))} ${utcDate(date).getUTCDate()}`;
}

/** Sat/Sun. Tenants have no working-days setting yet; when they do, this is
 *  where it plugs in. Weekends are shaded, never refused. */
function isWeekend(date: string): boolean {
  const day = utcDate(date).getUTCDay();
  return day === 0 || day === 6;
}

/** "Dentist 9a–11a", in the tenant's zone. */
function partLabel(span: { startsAt: string; endsAt: string; label: string }, timeZone: string): string {
  const start = zonedHour(span.startsAt, timeZone);
  const end = zonedHour(span.endsAt, timeZone);
  return start != null && end != null ? `${span.label} ${formatWindow(start, end)}` : span.label;
}

/** Committed work on a cell — in scope plus committed elsewhere. The load a
 *  dispatcher must see, never the in-scope count alone. */
function committedOf(cell: BoardWeekCell): number {
  return Math.max(cell.stopCount, cell.committedCount);
}

function WeekCell({
  cell,
  techId,
  capacityStops,
  timeZone,
  isToday,
  isPast,
  label,
  onClick,
  onDropDispatch,
  onDropWorkOrder,
}: {
  cell: BoardWeekCell;
  techId: string;
  capacityStops: number | null;
  timeZone: string;
  isToday: boolean;
  isPast: boolean;
  label: string;
  onClick: (anchor: { x: number; y: number }) => void;
  onDropDispatch: WeekProps['onDropDispatch'];
  onDropWorkOrder: WeekProps['onDropWorkOrder'];
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLButtonElement>(null);
  const [over, setOver] = useState(false);

  // Past days are history and an all-day absence is not yours to book, so
  // neither offers a drop at all — no affordance, not a refusal toast. A
  // part-day absence leaves the cell droppable: the page refuses only a
  // window that lands in it.
  const outAllDay = isOutAllDay(cell);
  const partDay = outAllDay ? [] : cell.timeOff;
  const droppable = !isPast && !outAllDay;

  const latest = useRef({ droppable, techId, date: cell.date, onDropDispatch, onDropWorkOrder });
  useEffect(() => {
    latest.current = { droppable, techId, date: cell.date, onDropDispatch, onDropWorkOrder };
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return dropTargetForElements({
      element: el,
      canDrop: ({ source }) => {
        const cur = latest.current;
        if (!cur.droppable || source.data?.boardDrag !== true) return false;
        // Its own cell is not a target: nothing would change.
        return !(source.data.fromTechId === cur.techId && source.data.fromDate === cur.date);
      },
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: ({ source }) => {
        setOver(false);
        const cur = latest.current;
        const { dispatchId, workOrderId, fromDate } = source.data as {
          dispatchId?: string;
          workOrderId?: string;
          fromDate?: string;
        };
        if (dispatchId && fromDate) cur.onDropDispatch(dispatchId, fromDate, cur.techId, cur.date);
        else if (workOrderId) cur.onDropWorkOrder(workOrderId, cur.techId, cur.date);
      },
    });
  }, []);

  // Identical arithmetic to the tech cell's bar (BoardRows): the bar read
  // ACROSS seven days and the bar read DOWN one column are about the same
  // technician, and a week that draws a lighter day than the day board does
  // makes the dispatcher distrust both.
  const committed = committedOf(cell);
  const elsewhere = committed - cell.stopCount;
  const scale =
    capacityStops != null && capacityStops > 0 ? 100 / Math.max(capacityStops, committed) : null;
  const inScopePct = scale == null ? null : cell.stopCount * scale;
  const elsewherePct = scale == null ? null : elsewhere * scale;

  // The target day, before committing — the reason the week is the right
  // surface for "a few days from now". Over capacity is allowed (dispatchers
  // overbook knowingly); it is shown, never blocked.
  const after = committed + 1;
  const overCap = capacityStops != null && after > capacityStops;

  return (
    <button
      ref={ref}
      type="button"
      className={[
        'db-wcell',
        isToday ? 'today' : '',
        isPast ? 'past' : '',
        isWeekend(cell.date) ? 'weekend' : '',
        outAllDay ? 'off' : '',
        over ? 'over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onClick({ x: rect.left, y: rect.bottom + 4 });
      }}
      aria-label={label}
      title={
        outAllDay
          ? cell.timeOff.map((span) => span.label).join(' · ')
          : isPast
            ? t('dispatchBoard.week.pastTitle')
            : undefined
      }
    >
      <span className="flex items-center gap-1">
        {over ? (
          <span className={`db-wprev${overCap ? ' over' : ''}`}>
            {capacityStops != null
              ? t(overCap ? 'dispatchBoard.week.previewOver' : 'dispatchBoard.week.preview', {
                  from: committed,
                  to: after,
                  cap: capacityStops,
                })
              : `${committed} → ${after}`}
          </span>
        ) : (
          <>
            {/* A tech who is out has no count to report — a dash, not a zero,
                which would read as "available and empty". "3 of 5" where work
                is committed elsewhere, so a full day never reads as light. */}
            <span
              className="font-mono text-[10.5px] font-semibold text-fg-strong"
              title={
                !outAllDay && elsewhere > 0
                  ? t('dispatchBoard.grid.committedBreakdown', {
                      inScope: cell.stopCount,
                      elsewhere,
                    })
                  : undefined
              }
            >
              {outAllDay
                ? '—'
                : cell.committedCount > cell.stopCount
                  ? t('dispatchBoard.grid.cellOfCommitted', {
                      inScope: cell.stopCount,
                      committed: cell.committedCount,
                    })
                  : String(cell.stopCount)}
            </span>
            <span className="grow" />
            {/* Out for part of the day: the day's own "not yours to book"
                hatch, small, naming the hours — the cell still takes work. */}
            {partDay.length > 0 && (
              <span
                className="db-woffpart"
                title={partDay.map((span) => partLabel(span, timeZone)).join(' · ')}
                aria-label={partDay.map((span) => partLabel(span, timeZone)).join(' · ')}
              />
            )}
            {/* The block's hollow idiom at 7px: something here is new or
                changed and not yet sent — the same "not sent" at both zooms. */}
            {cell.hasUnreleased && (
              <span className="db-wheld" title={t('dispatchBoard.week.pendingTitle')} />
            )}
            {cell.hasUrgent && (
              <span className="text-[10.5px] text-danger-500" title={t('dispatchBoard.chips.urgent')}>
                {'▲'}
              </span>
            )}
          </>
        )}
      </span>
      {!outAllDay && inScopePct != null && (
        <span className={`db-load ${loadClassFor(committed, capacityStops)}`.trim()}>
          <i style={{ width: `${inScopePct}%` }} />
          {elsewherePct! > 0 && <u style={{ width: `${elsewherePct}%` }} />}
        </span>
      )}
    </button>
  );
}

/** One stop in the peek. Draggable onto other cells unless it is history. */
function PeekRow({
  dispatch,
  date,
  readOnly,
  timeZone,
  onOpen,
}: {
  dispatch: BoardDispatch;
  date: string;
  readOnly: boolean;
  timeZone: string;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  // Only SCHEDULED work moves (§3.6): en route or on site is happening now,
  // and everything else is history.
  const movable = !readOnly && dispatch.status === 'SCHEDULED';

  useEffect(() => {
    const el = ref.current;
    if (!el || !movable) return;
    return draggable({
      element: el,
      getInitialData: () => ({
        boardDrag: true,
        dispatchId: dispatch.id,
        fromDate: date,
        fromTechId: dispatch.assignedUserId,
      }),
    });
  }, [dispatch.id, dispatch.assignedUserId, date, movable]);

  const start = zonedHour(dispatch.arrivalWindowStart, timeZone);
  const end = zonedHour(dispatch.arrivalWindowEnd, timeZone);
  const hollow = isOutOfDate(dispatch);

  return (
    <button
      ref={ref}
      type="button"
      className={`db-wpeek-row${hollow ? ' held' : ''}${movable ? ' movable' : ''}`}
      onClick={onOpen}
    >
      <span
        className="db-wpeek-dot"
        style={
          hollow
            ? { borderColor: DISPATCH_PRESENTATION[dispatch.status].accent }
            : { background: DISPATCH_PRESENTATION[dispatch.status].accent }
        }
      />
      <span className="shrink-0 font-mono text-[10.5px] text-fg-muted">
        {start != null && end != null ? formatWindow(start, end) : ''}
      </span>
      <span className="db-wpeek-t">
        {dispatch.priority === 'URGENT' && <span className="text-danger-500">{'▲ '}</span>}
        {dispatch.workOrderSummary ?? dispatch.workOrderNumber ?? ''}
      </span>
    </button>
  );
}

function Peek({
  peek,
  techName,
  stops,
  readOnly,
  timeZone,
  onClose,
  onOpenDispatch,
  onOpenDay,
}: {
  peek: WeekPeek;
  techName: string;
  stops: BoardDispatch[] | undefined;
  readOnly: boolean;
  timeZone: string;
  onClose: () => void;
  onOpenDispatch: (dispatch: BoardDispatch) => void;
  onOpenDay: (date: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // Esc or a click elsewhere closes it. A window listener rather than a
  // scrim: a scrim would sit on top of the cells and swallow the very drops
  // the peek exists to start.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="db-wpeek"
      role="dialog"
      aria-label={`${techName} · ${dayLabel(peek.date)}`}
      style={{
        left: Math.max(8, Math.min(peek.x, window.innerWidth - 296)),
        top: Math.max(8, Math.min(peek.y, window.innerHeight - 260)),
      }}
    >
      <div className="db-wpeek-head">
        <span className="grow">{`${techName.split(' ')[0] || techName} · ${dayLabel(peek.date)}`}</span>
        {stops && <span className="font-mono text-fg-muted">{stops.length}</span>}
      </div>
      <div className="db-wpeek-list">
        {stops == null ? (
          <div className="db-wpeek-empty">{t('dispatchBoard.week.peekLoading')}</div>
        ) : stops.length === 0 ? (
          <div className="db-wpeek-empty">{t('dispatchBoard.week.peekEmpty')}</div>
        ) : (
          stops.map((dispatch) => (
            <PeekRow
              key={dispatch.id}
              dispatch={dispatch}
              date={peek.date}
              readOnly={readOnly}
              timeZone={timeZone}
              onOpen={() => onOpenDispatch(dispatch)}
            />
          ))
        )}
      </div>
      <div className="db-wpeek-foot">
        <span className="text-[10.5px] text-fg-muted">
          {readOnly ? t('dispatchBoard.week.pastTitle') : t('dispatchBoard.week.peekHint')}
        </span>
        <button type="button" className="db-wpeek-open" onClick={() => onOpenDay(peek.date)}>
          {t('dispatchBoard.week.openDay')}
        </button>
      </div>
    </div>
  );
}

export default function DispatchWeek({
  techs,
  regionLabel,
  days,
  density,
  capacityStops,
  today,
  todayDate,
  timeZone,
  onOpenDay,
  peek,
  peekStops,
  onPeek,
  onOpenDispatch,
  onDropDispatch,
  onDropWorkOrder,
  pendingByDay,
  onReleaseDay,
}: WeekProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { rowH, techW } = DENSITY_METRICS[density];

  // "Which day has room" is a COLUMN question, so the header answers it:
  // committed work across the showing techs against the capacity of those
  // working that day. Someone who is off adds no capacity and no load.
  const totals = days.map((date) => {
    let used = 0;
    let working = 0;
    for (const tech of techs) {
      const cell = tech.cells.find((c) => c.date === date);
      // Out all day adds no capacity and no load. Part of the day still
      // counts in full: capacity is stops, not hours (§0b).
      if (!cell || isOutAllDay(cell)) continue;
      working += 1;
      used += committedOf(cell);
    }
    return { used, cap: capacityStops != null ? working * capacityStops : null };
  });

  // Past columns never release: nothing handed over now reaches that day.
  const pendingOn = (date: string) =>
    date < todayDate ? null : (pendingByDay.find((p) => p.date === date)?.pendingRelease ?? null);
  const anyPending = days.some((date) => (pendingOn(date)?.total ?? 0) > 0);

  const renderRow = (tech: BoardWeekTech) => {
    // The week's own total, so the tech column reads as the week's load
    // rather than borrowing a day's.
    const stops = tech.cells.reduce((n, cell) => n + cell.stopCount, 0);
    const committed = tech.cells.reduce((n, cell) => n + cell.committedCount, 0);
    const outAllWeek = tech.cells.every((cell) => isOutAllDay(cell));

    return (
      <div className="db-row" key={tech.id} style={{ height: rowH }}>
        <TechCell
          tech={tech}
          regionLabel={regionLabel(tech.regionIds)}
          stops={stops}
          committedCount={committed}
          density={density}
          // The denominator is per DAY, so a week total against it would say
          // every working tech is catastrophically over capacity.
          capacityStops={null}
          width={techW}
          outAllDay={outAllWeek}
          offLabel={null}
        />
        <div className="db-week-lane">
          {tech.cells.map((cell) => (
            <WeekCell
              key={cell.date}
              cell={cell}
              techId={tech.id}
              capacityStops={capacityStops}
              timeZone={timeZone}
              isToday={cell.date === today}
              isPast={cell.date < todayDate}
              onClick={(anchor) => {
                // A peek of nothing is noise; an empty day is answered by the
                // count already on the cell.
                if (committedOf(cell) === 0 && cell.stopCount === 0) return;
                onPeek({ techId: tech.id, date: cell.date, ...anchor });
              }}
              onDropDispatch={onDropDispatch}
              onDropWorkOrder={onDropWorkOrder}
              label={t('dispatchBoard.week.cellLabel', {
                name: tech.name,
                day: dayLabel(cell.date),
                count: cell.stopCount,
                entity: getName('dispatch', true).toLowerCase(),
              })}
            />
          ))}
        </div>
      </div>
    );
  };

  const peekTech = peek ? techs.find((tech) => tech.id === peek.techId) : undefined;

  return (
    <div className="db-grid">
      <div className="db-head stack">
        <div className="db-head-row">
          <div className="db-techcol" style={{ width: techW }}>
            {getName('technician')}
          </div>
          <div className="db-week-lane">
            {days.map((date, i) => {
              const { used, cap } = totals[i];
              const ratio = cap ? used / cap : 0;
              const tone = ratio > 1 ? ' danger' : ratio >= 0.85 ? ' warning' : '';
              return (
                <button
                  type="button"
                  className={`db-whead${date === today ? ' today' : ''}${date < todayDate ? ' past' : ''}`}
                  key={date}
                  onClick={() => onOpenDay(date)}
                  title={t('dispatchBoard.week.openDayTitle', { day: dayLabel(date) })}
                >
                  <span>{dayLabel(date)}</span>
                  <span className={`db-wtotal font-mono${tone}`}>
                    {cap != null ? `${used}/${cap}` : String(used)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The count lives on the COLUMN: a per-cell count at 60 rows is
            noise, and the cell's hollow dot already says which techs. The
            row self-hides when no day in view has anything waiting. */}
        {anyPending && (
          <div className="db-head-row db-wrel-row">
            <div className="db-techcol" style={{ width: techW }}>
              {t('dispatchBoard.week.notSent')}
            </div>
            <div className="db-week-lane">
              {days.map((date) => {
                const pending = pendingOn(date);
                return (
                  <div className="db-wrel-cell" key={date}>
                    {pending && pending.total > 0 && (
                      <Button
                        outline
                        size="xxs"
                        onClick={() => onReleaseDay(date, pending)}
                        title={t('dispatchBoard.week.releaseDayTitle', {
                          day: dayLabel(date),
                          count: pending.total,
                        })}
                      >
                        {t('dispatchBoard.release.action', { count: pending.total })}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {techs.map(renderRow)}

      {peek && peekTech && (
        <Peek
          peek={peek}
          techName={peekTech.name}
          stops={peekStops}
          readOnly={peek.date < todayDate}
          timeZone={timeZone}
          onClose={() => onPeek(null)}
          onOpenDispatch={onOpenDispatch}
          onOpenDay={onOpenDay}
        />
      )}
    </div>
  );
}
