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
  axis: BoardAxis;
  /** Fractional hour of "now" in tenant time, or null when the board is not
   *  showing today — a now-line on Thursday's board is a lie. */
  nowHour: number | null;
  /** Denominator for the load bar: stops per day, not hours. */
  capacityStops: number;
  timeZone: string;
}
