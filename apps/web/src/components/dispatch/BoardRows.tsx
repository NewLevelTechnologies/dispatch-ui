// ─────────────────────────────────────────────────────────────────────
// Row chrome shared by every board granularity: the sticky technician cell
// and the collapsible region groups.
//
// Extracted rather than copied because these carry rules, not just markup —
// the load bar counts STOPS against a server-supplied denominator, a
// multi-region tech renders once with a marker, and a lone group header never
// renders. A day grid and a week grid that disagreed about any of those would
// read as two different products.
// ─────────────────────────────────────────────────────────────────────
import { useTranslation } from '@dispatch/i18n';
import { ChevronRightIcon, EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '../catalyst/dropdown';
import IconButton from '../IconButton';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Avatar } from '../ui/Avatar';
import type { Group, GroupableTech } from '../../lib/boardGroups';
import { loadClassFor, type Density } from './spine';

/**
 * The technician column. Identity on the left, load on the right.
 *
 * Takes the identity it needs rather than a whole board row, so the week read
 * — which carries no dispatches at all — renders the same cell.
 */
export function TechCell({
  tech,
  stops,
  density,
  capacityStops,
  width,
  outAllDay,
  offLabel,
  onMarkTimeOff,
}: {
  tech: { name: string; regionIds: string[] };
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
        {density !== 'dense' && offLabel && <span className="db-tech-meta">{offLabel}</span>}
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

/**
 * The collapsible region groups, and the rows inside them.
 *
 * Collapsed groups still have to answer "is there anything in there I need to
 * deal with", so the header carries the stop and on-deck counts.
 */
export function BoardGroups<T extends GroupableTech>({
  groups,
  collapsed,
  onToggleGroup,
  renderRow,
}: {
  groups: Group<T>[];
  collapsed: string[];
  onToggleGroup: (key: string) => void;
  renderRow: (tech: T) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  return (
    <>
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
    </>
  );
}
