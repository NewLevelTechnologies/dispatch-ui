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
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon } from '@heroicons/react/24/outline';
import type { BoardDispatch, BoardTech } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Avatar } from '../ui/Avatar';
import { statusClass } from '../../lib/dispatchStatus';
import { DENSITY_METRICS, type Density, type SpineProps } from './spine';
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

function TechCell({
  tech,
  stops,
  density,
  capacityStops,
  width,
}: {
  tech: BoardTech;
  stops: number;
  density: Density;
  capacityStops: number;
  width: number;
}) {
  const { t } = useTranslation();

  // Load is a STOP COUNT against a tenant default. No labor estimate exists
  // platform-wide, so an hours bar would have neither numerator nor
  // denominator. Dispatchers already think in stops.
  const pct = capacityStops > 0 ? Math.min(100, (stops / capacityStops) * 100) : 0;
  const loadClass = stops > capacityStops ? 'over' : stops >= capacityStops ? 'high' : '';

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
        {density !== 'dense' && tech.availability && (
          <span className="db-tech-meta">{tech.availability.label}</span>
        )}
      </div>
      {!tech.availability && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[10.5px] text-fg-muted">
            {`${stops}/${capacityStops}`}
          </span>
          <span className={`db-load ${loadClass}`.trim()}>
            <i style={{ width: `${pct}%` }} />
          </span>
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
}: {
  dispatch: BoardDispatch;
  window: Window;
  axis: SpineProps['axis'];
  density: Density;
  clash: boolean;
  half: 'upper' | 'lower' | null;
  onOpen: (dispatch: BoardDispatch) => void;
}) {
  const { t } = useTranslation();

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
    <button
      type="button"
      className={className}
      style={{ left: `${left}%`, width: `${width}%` }}
      onClick={() => onOpen(dispatch)}
      title={[title, dispatch.customerName, windowLabel].filter(Boolean).join(' · ')}
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
    </button>
  );
}

export default function DispatchTimeline({
  groups,
  byTech,
  density,
  collapsed,
  onToggleGroup,
  onOpenDispatch,
  axis,
  nowHour,
  capacityStops,
  timeZone,
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
    const isOff = Boolean(tech.availability);

    return (
      <div
        key={tech.id}
        className={['db-row', isOff ? 'off' : '', clashing.size > 0 ? 'clashrow' : '']
          .filter(Boolean)
          .join(' ')}
        style={{ height: rowH }}
      >
        <TechCell
          tech={tech}
          stops={placed.length}
          density={density}
          capacityStops={capacityStops}
          width={techW}
        />
        <div className="db-lane">
          <span className="db-lane-cells">
            {axis.hours.map((hour) => (
              <i key={hour} />
            ))}
          </span>

          {isOff && (
            <span className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] font-semibold text-fg-muted">
              {t('dispatchBoard.grid.offNotDroppable', { label: tech.availability?.label ?? '' })}
            </span>
          )}

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
                />
              </div>
            );
          })}

          {nowHour != null && nowHour >= axis.start && nowHour <= axis.end && (
            <span className="db-now" style={{ left: `${axisPct(nowHour, axis)}%` }} />
          )}
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
