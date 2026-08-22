// Filter dimensions render the same way everywhere — equipment Identification
// summary, Filters tab table, quick-add chips, the WO row's equipment block,
// and the Common Filter Sizes admin panel. Centralized here so format tweaks
// (spacing, glyphs) ripple consistently.
//
// The shape is structural so callers can pass an EquipmentFilter,
// TenantFilterSize, or an ad-hoc object with the three dimensions — none of
// the consumers need anything else from the record to render the size.

function formatInches(n: number): string {
  // JS Number.toString() drops trailing zeros: 20.00 → "20", 1.5 stays "1.5".
  return String(n);
}

export function formatFilterSize(s: {
  lengthIn: number;
  widthIn: number;
  thicknessIn: number;
}): string {
  return `${formatInches(s.lengthIn)}×${formatInches(s.widthIn)}×${formatInches(s.thicknessIn)}`;
}
