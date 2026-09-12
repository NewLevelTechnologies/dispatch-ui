// ─────────────────────────────────────────────────────────────────────
// Row grouping for the board, shared by every granularity.
//
// The rules are load-bearing and easy to get subtly wrong, so they live in
// one place rather than once per renderer:
//
//   - Grouping keys off the PRIMARY region, because that is what produces a
//     row group. A tech who covers three regions renders exactly ONCE — in
//     their primary — or a double-book could hide in plain sight by being
//     visible in two places.
//   - Filter visibility keys off COVERAGE instead, which is a different set
//     and is allowed to disagree: eight Phoenix techs, one of whom also
//     covers East Valley, is a two-region tenant for filtering and a
//     one-region tenant for grouping.
//   - A tech whose primary region is missing from the registry still gets a
//     row. Never drop a person off the board.
//
// Generic over the row shape because the day read and the week read return
// different ones, and the day board's group summary counts dispatches while
// the week's counts aggregated stops.
// ─────────────────────────────────────────────────────────────────────

/** The identity every board read shares, whatever else rides along. */
export interface GroupableTech {
  id: string;
  name: string;
  regionIds: string[];
  primaryRegionId: string | null;
}

export interface Group<T> {
  key: string;
  /** null for the single ungrouped bucket — a lone group header never
   *  renders, because one group means no grouping. */
  label: string | null;
  techs: T[];
  stops: number;
  held: number;
}

export function buildGroups<T extends GroupableTech>(
  techs: T[],
  {
    grouped,
    regions,
    summarize,
    orphanLabel,
  }: {
    grouped: boolean;
    /** The tenant's own region ordering — group order follows it. */
    regions: { id: string; name: string }[];
    summarize: (list: T[]) => { stops: number; held: number };
    orphanLabel: string;
  },
): Group<T>[] {
  if (!grouped) {
    return [{ key: '__all', label: null, techs, ...summarize(techs) }];
  }

  const built = regions.map((region) => {
    const list = techs.filter((tech) => tech.primaryRegionId === region.id);
    return { key: region.id, label: region.name, techs: list, ...summarize(list) };
  });

  // Orphaned against the REGISTRY, not against the other techs: a primary
  // region id the tenant no longer lists would otherwise match no group and
  // be caught by no orphan test, and the tech would simply vanish.
  const known = new Set(regions.map((region) => region.id));
  const orphans = techs.filter(
    (tech) => !tech.primaryRegionId || !known.has(tech.primaryRegionId),
  );
  if (orphans.length > 0) {
    built.push({
      key: '__unassigned',
      label: orphanLabel,
      techs: orphans,
      ...summarize(orphans),
    });
  }

  return built.filter((group) => group.techs.length > 0);
}

/**
 * The hide-unscheduled-technicians fold, at either granularity.
 *
 * The fold is for AVAILABLE technicians with nothing booked. Anyone with an
 * absence is never folded: they already have a distinct rendered state, and
 * hiding them would conceal the operational fact that someone is out — which
 * is exactly what a dispatcher opened the board to see.
 *
 * `foldable` is reported even when the toggle is off, because it is what
 * decides whether the toggle is offered at all.
 */
export function foldEmptyRows<T>(
  techs: T[],
  hideEmpty: boolean,
  stopsOf: (tech: T) => number,
  absentOf: (tech: T) => boolean,
): { shown: T[]; foldable: number } {
  const foldable = techs.filter((tech) => !absentOf(tech) && stopsOf(tech) === 0).length;
  const shown = hideEmpty
    ? techs.filter((tech) => absentOf(tech) || stopsOf(tech) > 0)
    : techs;
  return { shown, foldable };
}
