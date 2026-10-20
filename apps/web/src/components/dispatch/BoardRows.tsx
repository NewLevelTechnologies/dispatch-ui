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
  committedCount,
  density,
  capacityStops,
  width,
  outAllDay,
  offLabel,
  onMarkTimeOff,
  onClearTimeOff,
  profileHref,
}: {
  tech: { name: string; regionIds: string[] };
  /** The regions this tech covers, by NAME, already joined — or null when the
   *  fact is a constant (a single-region tenant) and would print the same word
   *  on every row. Replaces the old `+N` badge, which said how MANY regions
   *  without saying which, and so never changed a decision. */
  regionLabel: string | null;
  stops: number;
  /** Total committed, in scope or not. Never below `stops`. */
  committedCount: number;
  density: Density;
  capacityStops: number | null;
  width: number;
  /** Row verbs. Omitted where they have no meaning — the week grid spans seven
   *  days, so "off" there would have no date to attach to. */
  onMarkTimeOff?: () => void;
  /** Offered whenever the row has an absence on this day. */
  onClearTimeOff?: () => void;
  profileHref?: string;
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
  // The figure and the bar report COMMITTED work, not in-scope work. A
  // technician whose entire day sits in another region has a full day; saying
  // 0/6 because none of it is in the current scope is the one lie this column
  // cannot afford, because nobody reads 36 lanes to find out who is free.
  const committed = Math.max(stops, committedCount);
  const elsewhere = committed - stops;
  const scale =
    capacityStops != null && capacityStops > 0 ? 100 / Math.max(capacityStops, committed) : null;
  const inScopePct = scale == null ? null : stops * scale;
  const elsewherePct = scale == null ? null : elsewhere * scale;
  const loadClass = loadClassFor(committed, capacityStops);


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
          <span className="db-tech-meta">{offLabel ?? regionLabel}</span>
        )}
      </div>
      {!outAllDay && (
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className="font-mono text-[10.5px] text-fg-muted"
            // Only when the two differ — on an unfiltered board every row
            // would otherwise carry a tooltip restating its own number.
            title={
              elsewhere > 0
                ? t('dispatchBoard.grid.committedBreakdown', {
                    inScope: stops,
                    elsewhere,
                  })
                : undefined
            }
          >
            {capacityStops != null ? `${committed}/${capacityStops}` : String(committed)}
          </span>
          {inScopePct != null && (
            <span className={`db-load ${loadClass}`.trim()}>
              <i style={{ width: `${inScopePct}%` }} />
              {elsewherePct! > 0 && <u style={{ width: `${elsewherePct}%` }} />}
            </span>
          )}
        </div>
      )}

      {/* Overlaid on the right edge rather than given a slot of its own: the
          technician cell is 176px at dense, and a permanent column would cost
          that width on every row at every density. Revealed on hover AND on
          focus, so the keyboard reaches it. */}
      {(onMarkTimeOff || onClearTimeOff || profileHref) && (
        <Dropdown>
          <DropdownButton
            as={IconButton}
            className="db-rowmenu"
            aria-label={t('dispatchBoard.timeOff.rowMenu', { name: tech.name })}
          >
            <EllipsisHorizontalIcon className="size-4" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            {/* Out 9–11 and leaving at 3 is two spans, so a partly-off row
                can still take another. Only an all-day absence leaves nothing
                to mark. */}
            {onMarkTimeOff && !outAllDay && (
              <DropdownItem onClick={onMarkTimeOff}>
                <DropdownLabel>{t('dispatchBoard.timeOff.action')}</DropdownLabel>
              </DropdownItem>
            )}
            {onClearTimeOff && (
              <DropdownItem onClick={onClearTimeOff}>
                <DropdownLabel>{t('dispatchBoard.timeOff.clearAction')}</DropdownLabel>
              </DropdownItem>
            )}
            {profileHref && (
              <DropdownItem href={profileHref}>
                <DropdownLabel>{t('dispatchBoard.timeOff.openProfile')}</DropdownLabel>
              </DropdownItem>
            )}
          </DropdownMenu>
        </Dropdown>
      )}
    </div>
  );
}
