// ─────────────────────────────────────────────────────────────────────
// Row folding for the board, shared by every granularity.
//
// There is no grouping here any more, and that is the point. Region was the
// board's only axis and it is gone: it is set-valued, so a tech covering two
// regions had no honest single group, and the "primary" the grouping keyed
// off turned out to be whichever checkbox an admin happened to tick first —
// nothing ever set it deliberately.
//
// The decisive argument was not about data, though. 60 technicians in four
// bands is still 60 rows plus four headers, so grouping never addressed the
// row-count problem it was introduced for. Narrowing the scope does.
//
// Generic over the row shape because the day read and the week read return
// different ones.
// ─────────────────────────────────────────────────────────────────────

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
