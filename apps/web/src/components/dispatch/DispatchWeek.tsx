// ─────────────────────────────────────────────────────────────────────
// Week — a GRANULARITY, not a spine.
//
// The day board renders dispatches; this renders aggregates, because seven
// days of a 60-tech shop is ~2,000 dispatches and none of them would be
// individually legible at this scale. So the server returns one cell per tech
// per day (`GET /scheduling/board/week`) and the grid draws counts and flags.
//
// The question the week answers is "which day should I be looking at" — so a
// cell is a target, not a container: clicking one takes the dispatcher to that
// day's board, where the work actually is. There is deliberately no drag here;
// a drop would have to invent a technician's window out of a count.
// ─────────────────────────────────────────────────────────────────────
import { useTranslation } from '@dispatch/i18n';
import type { BoardWeekCell, BoardWeekTech } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { TechCell } from './BoardRows';
import { DENSITY_METRICS, loadClassFor, type Density } from './spine';

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
  /** Go to one day's board. The week's job is to route you to the right day. */
  onOpenDay: (date: string) => void;
}

// Same convention as the shared formatters: only en-US ships today, and the
// app's i18n language is `en_US` — not a valid BCP 47 tag, so it must never
// reach Intl.
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

/** Column header: "Mon 14". Parsed as UTC rather than handed to `new Date()`,
 *  because a bare YYYY-MM-DD is otherwise shifted a day for anyone west of
 *  Greenwich — which would label every column wrong. */
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  return `${WEEKDAY.format(utc)} ${d}`;
}

function WeekCell({
  cell,
  capacityStops,
  isToday,
  onOpen,
  label,
}: {
  cell: BoardWeekCell;
  capacityStops: number | null;
  isToday: boolean;
  onOpen: () => void;
  label: string;
}) {
  const { t } = useTranslation();

  // Identical arithmetic to the tech cell's bar (BoardRows), and deliberately
  // so: the bar read ACROSS seven days and the bar read DOWN one column are
  // about the same technician, and a week that draws a lighter day than the
  // day board does is worse than either being wrong alone — it makes the
  // dispatcher distrust both. Denominating by `max(capacity, committed)` also
  // keeps an over-committed day inside the track without a clamp that would
  // silently hide the overage.
  const committed = Math.max(cell.stopCount, cell.committedCount);
  const elsewhere = committed - cell.stopCount;
  const scale =
    capacityStops != null && capacityStops > 0 ? 100 / Math.max(capacityStops, committed) : null;
  const inScopePct = scale == null ? null : cell.stopCount * scale;
  const elsewherePct = scale == null ? null : elsewhere * scale;

  return (
    <button
      type="button"
      className={`db-wcell${isToday ? ' today' : ''}${cell.off ? ' off' : ''}`}
      onClick={onOpen}
      aria-label={label}
    >
      <span className="flex items-center gap-1">
        {/* A tech who is out has no count to report — an explicit dash, not a
            zero, which would read as "available and empty". */}
        {/* "3 of 5" only where they differ. The in-scope figure stays first
            because the week has to respond to the filter — that is why anyone
            filters — but a day that is fuller than the filter shows must say
            so, or a dispatcher picks the day that looks lightest and is not. */}
        <span
          className="font-mono text-[10.5px] font-semibold text-fg-strong"
          // Only where the two differ, same as the tech cell: on an unfiltered
          // board every cell would otherwise carry a tooltip restating itself.
          title={
            !cell.off && elsewhere > 0
              ? t('dispatchBoard.grid.committedBreakdown', {
                  inScope: cell.stopCount,
                  elsewhere,
                })
              : undefined
          }
        >
          {cell.off
            ? '—'
            : cell.committedCount > cell.stopCount
              ? t('dispatchBoard.grid.cellOfCommitted', {
                  inScope: cell.stopCount,
                  committed: cell.committedCount,
                })
              : String(cell.stopCount)}
        </span>
        <span className="grow" />
        {cell.hasUnreleased && (
          <span className="db-wheld" title={t('dispatchBoard.chips.unreleased')} />
        )}
        {cell.hasUrgent && (
          <span className="text-[10.5px] text-danger-500" title={t('dispatchBoard.chips.urgent')}>
            {'▲'}
          </span>
        )}
      </span>
      {!cell.off && inScopePct != null && (
        // The load class comes off COMMITTED, not in-scope work: a tech whose
        // day is full in another region is not having a light day, and the
        // week is the surface a dispatcher scans to choose one.
        <span className={`db-load ${loadClassFor(committed, capacityStops)}`.trim()}>
          <i style={{ width: `${inScopePct}%` }} />
          {elsewherePct! > 0 && <u style={{ width: `${elsewherePct}%` }} />}
        </span>
      )}
    </button>
  );
}

export default function DispatchWeek({
  techs,
  regionLabel,
  days,
  density,
  capacityStops,
  today,
  onOpenDay,
}: WeekProps) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { rowH, techW } = DENSITY_METRICS[density];

  const renderRow = (tech: BoardWeekTech) => {
    // The week's own total, so the tech column reads as the week's load
    // rather than borrowing a day's.
    const stops = tech.cells.reduce((n, cell) => n + cell.stopCount, 0);
    const committed = tech.cells.reduce((n, cell) => n + cell.committedCount, 0);
    const outAllWeek = tech.cells.every((cell) => cell.off);

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
              capacityStops={capacityStops}
              isToday={cell.date === today}
              onOpen={() => onOpenDay(cell.date)}
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

  return (
    <div className="db-grid">
      <div className="db-head">
        <div className="db-techcol" style={{ width: techW }}>
          {getName('technician')}
        </div>
        <div className="db-week-lane">
          {days.map((date) => (
            <div className={`db-whead${date === today ? ' today' : ''}`} key={date}>
              {dayLabel(date)}
            </div>
          ))}
        </div>
      </div>

      {techs.map(renderRow)}
    </div>
  );
}
