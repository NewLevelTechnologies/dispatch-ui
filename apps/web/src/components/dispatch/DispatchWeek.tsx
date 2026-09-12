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
import type { Group } from '../../lib/boardGroups';
import { BoardGroups, TechCell } from './BoardRows';
import { DENSITY_METRICS, loadClassFor, type Density } from './spine';

export interface WeekProps {
  groups: Group<BoardWeekTech>[];
  /** The seven dates, from the server — never recomputed here, so a week
   *  containing a DST change still has exactly seven columns. */
  days: string[];
  density: Density;
  collapsed: string[];
  onToggleGroup: (key: string) => void;
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

  const pct =
    capacityStops != null && capacityStops > 0
      ? Math.min(100, (cell.stopCount / capacityStops) * 100)
      : null;

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
        <span className="font-mono text-[10.5px] font-semibold text-fg-strong">
          {cell.off ? '—' : String(cell.stopCount)}
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
      {!cell.off && pct != null && (
        <span className={`db-load ${loadClassFor(cell.stopCount, capacityStops)}`.trim()}>
          <i style={{ width: `${pct}%` }} />
        </span>
      )}
    </button>
  );
}

export default function DispatchWeek({
  groups,
  days,
  density,
  collapsed,
  onToggleGroup,
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
    const outAllWeek = tech.cells.every((cell) => cell.off);

    return (
      <div className="db-row" key={tech.id} style={{ height: rowH }}>
        <TechCell
          tech={tech}
          stops={stops}
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

      <BoardGroups
        groups={groups}
        collapsed={collapsed}
        onToggleGroup={onToggleGroup}
        renderRow={renderRow}
      />
    </div>
  );
}
