// Display helper for addresses that are stored uppercase in the database.
// Does NOT mutate stored data — call at render time only.
//
//   "2184 CHESHIRE BRIDGE RD NE"  → "2184 Cheshire Bridge Rd NE"
//   "ATLANTA"                     → "Atlanta"
//   "BABA'S KITCHEN PLAZA"        → "Baba's Kitchen Plaza"
//
// Directionals (N/S/E/W and 2-letter NE/NW/SE/SW) stay uppercase.
// Other 2-letter tokens are title-cased like everything else — passing in
// state codes ("GA") would lower-case them, so render state separately or
// don't pass it through this helper.

const DIRECTIONALS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);

export function titleCaseAddress(input: string | undefined | null): string {
  if (!input) return '';
  return input.split(/(\s+)/).map((part) => {
    if (/^\s+$/.test(part)) return part;
    if (DIRECTIONALS.has(part.toUpperCase())) return part.toUpperCase();
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('');
}
