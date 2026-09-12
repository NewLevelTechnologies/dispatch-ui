// ─────────────────────────────────────────────────────────────────────
// The spine seam (handoff §3.2).
//
// A spine is a RENDERER, not a page: filters, grouping, date scope, density,
// selection, drag handlers and the drawer all live in DispatchBoardPage and
// arrive as one uniform prop bag. Adding the capacity spine later must mean
// a new renderer file plus one entry in a switch — nothing else. If it needs
// to touch filter or drawer code, the seam is wrong.
//
// The shared shapes live here rather than beside a renderer so no spine owns
// the contract, and so a component file exports only components.
// ─────────────────────────────────────────────────────────────────────
import type { BoardDispatch, BoardTech } from '../../api/setup';
import type { BoardAxis } from '../../lib/boardTime';

export type Density = 'comfortable' | 'compact' | 'dense';

/** Row height and tech-column width per density step (handoff §3.3). The
 *  tech cell drops its avatar at compact and its meta line at dense; the stop
 *  count and load bar stay at every step — they are the point of the column. */
export const DENSITY_METRICS: Record<Density, { rowH: number; techW: number }> = {
  comfortable: { rowH: 58, techW: 214 },
  compact: { rowH: 42, techW: 196 },
  dense: { rowH: 30, techW: 176 },
};

/** Auto density by row count, per the ladder. A user override persists over
 *  this. */
export function autoDensityFor(rowCount: number): Density {
  if (rowCount <= 12) return 'comfortable';
  if (rowCount <= 35) return 'compact';
  return 'dense';
}

/** One load ramp for every bar on the board, at either granularity: the day
 *  row's stop count and the week cell's both colour the same way, against the
 *  same server-supplied denominator. */
export function loadClassFor(stops: number, capacityStops: number | null): string {
  if (capacityStops == null) return '';
  if (stops > capacityStops) return 'over';
  if (stops >= capacityStops) return 'high';
  return '';
}

export interface BoardGroup {
  key: string;
  /** null for the single ungrouped bucket — a lone group header never
   *  renders, because one group means no grouping. */
  label: string | null;
  techs: BoardTech[];
  stops: number;
  held: number;
}

export interface SpineProps {
  groups: BoardGroup[];
  byTech: Record<string, BoardDispatch[]>;
  density: Density;
  collapsed: string[];
  onToggleGroup: (key: string) => void;
  onOpenDispatch: (dispatch: BoardDispatch) => void;
  /**
   * The work order behind a dispatch, as an href rather than a handler: a
   * dispatch is a visit and the work order is the job, so reaching it is a
   * first-class path from every place a dispatch appears — and dispatchers
   * keep the board loaded behind it with cmd-click and middle-click, which a
   * JS-only navigation silently removes. Carries the board's own date and
   * scope so smart-back returns to the board they were looking at.
   */
  workOrderHref: (workOrderId: string) => string;
  /** Right-click on a block, at viewport coordinates. The menu itself is the
   *  page's, so every spine gets it for free. */
  onContextDispatch: (dispatch: BoardDispatch, at: { x: number; y: number }) => void;
  axis: BoardAxis;
  /** Fractional hour of "now" in tenant time, or null when the board is not
   *  showing today — a now-line on Thursday's board is a lie. */
  nowHour: number | null;
  /** Denominator for the load bar: stops per day, not hours. Null when the
   *  server hasn't supplied one — the bar is then omitted rather than drawn
   *  against a guess. */
  capacityStops: number | null;
  timeZone: string;
  /**
   * A drag landed on `techId` in a window the spine already resolved and
   * accepted. The spine owns the GEOMETRY (where in the lane) and the RULE
   * (snap to a preset, refuse time off); the page owns what a drop DOES, so
   * a second spine inherits both without reimplementing either.
   *
   * `payload` is whatever the drag source attached — the page decodes it.
   */
  onDrop?: (
    techId: string,
    window: { startHour: number; endHour: number },
    payload: Record<string, unknown>,
  ) => void;
}
