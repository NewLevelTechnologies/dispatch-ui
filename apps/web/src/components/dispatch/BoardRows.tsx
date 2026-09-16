// ─────────────────────────────────────────────────────────────────────
// The sticky technician cell, shared by every board granularity.
//
// Extracted rather than copied because it carries rules, not just markup: the
// load bar counts STOPS against a server-supplied denominator, and coverage is
// named rather than counted. A day grid and a week grid that disagreed about
// either would read as two different products.
// ─────────────────────────────────────────────────────────────────────
import { useTranslation } from '@dispatch/i18n';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../catalyst/dropdown';
import IconButton from '../IconButton';
import { Avatar } from '../ui/Avatar';
import { loadClassFor, type Density } from './spine';

/**
 * The technician column. Identity on the left, load on the right.
 *
 * Takes the identity it needs rather than a whole board row, so the week read
 * — which carries no dispatches at all — renders the same cell.
 */
export function TechCell({
  tech,
  regionLabel,
  stops,
  density,
  capacityStops,
  width,
  outAllDay,
  offLabel,
  onMarkTimeOff,
}: {
  tech: { name: string; regionIds: string[] };
  /** The regions this tech covers, by NAME, already joined — or null when the
   *  fact is a constant (a single-region tenant) and would print the same word
   *  on every row. Replaces the old `+N` badge, which said how MANY regions
   *  without saying which, and so never changed a decision. */
  regionLabel: string | null;
  stops: number;
  density: Density;
  capacityStops: number | null;
  width: number;
  /** Row verbs. Omitted where they have no meaning — the week grid spans seven
   *  days, so "off" there would have no date to attach to. */
  onMarkTimeOff?: () => void;
  /** Hides the load entirely: a tech who is out has no load to report, and a
   *  0/6 bar would read as "available and empty". */
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
  const loadClass = loadClassFor(stops, capacityStops);


  return (
    <div className="db-techcol" style={{ width }}>
      {density === 'comfortable' && <Avatar name={tech.name} size="sm" />}
      <div className="min-w-0 flex-1">
        <span className="db-tech-name">{tech.name}</span>
        {/* Coverage by name, not a count. "+2" said how many regions without
            saying which, so it could never be acted on; "Phoenix · East Valley"
            is the same cost in pixels and is the actual fact. The absence
            shows through here too: a tech NOT covering the scope you narrowed
            to is visible at a glance. */}
        {density !== 'dense' && (offLabel || regionLabel) && (
          <span className="db-tech-meta">{[offLabel, regionLabel].filter(Boolean).join(' · ')}</span>
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

      {/* Overlaid on the right edge rather than given a slot of its own: the
          technician cell is 176px at dense, and a permanent column would cost
          that width on every row at every density. Revealed on hover AND on
          focus, so the keyboard reaches it. */}
      {onMarkTimeOff && (
        <Dropdown>
          <DropdownButton
            as={IconButton}
            className="db-rowmenu"
            aria-label={t('common.moreOptions')}
          >
            <EllipsisHorizontalIcon className="size-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            <DropdownItem onClick={onMarkTimeOff}>
              <DropdownLabel>{t('dispatchBoard.timeOff.action')}</DropdownLabel>
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      )}
    </div>
  );
}
