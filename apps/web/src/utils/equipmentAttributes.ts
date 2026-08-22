import type { EquipmentCategoryField } from '../api/setup';

// Equipment spec values (a category's custom fields) ↔ the `attributes` JSON
// string. State/values are held as strings (booleans as 'true'/''); coerced by
// data type on save. Shared by the equipment form + detail Specs surfaces.

export function parseAttributes(json: string | null | undefined): Record<string, string> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = typeof v === 'boolean' ? (v ? 'true' : '') : String(v);
    }
    return out;
  } catch {
    return {};
  }
}

// Only the given category's fields are serialized — values for keys outside it
// drop (the category-change behavior). Empty optionals are omitted; booleans
// always carry their state; NUMBER/CURRENCY store a plain decimal.
export function buildAttributes(
  fields: EquipmentCategoryField[],
  values: Record<string, string>
): string {
  const attrs: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = values[f.fieldKey];
    if (f.dataType === 'BOOLEAN') {
      attrs[f.fieldKey] = raw === 'true';
      continue;
    }
    if (raw == null || raw.trim() === '') continue;
    if (f.dataType === 'NUMBER' || f.dataType === 'CURRENCY') {
      const n = Number(raw);
      if (Number.isFinite(n)) attrs[f.fieldKey] = n;
    } else {
      attrs[f.fieldKey] = raw;
    }
  }
  return JSON.stringify(attrs);
}

// Snap an OCR-read free-text value onto one of a SELECT field's options,
// tolerating case / punctuation / whitespace ("R410A" → "R-410A") and trailing
// noise the OCR picks up ("R410A TXV INSTALLED" → "R-410A"). Returns the matching
// option, or null when nothing fits (caller keeps the raw read for later).
export function matchOption(raw: string, options: string[] | null | undefined): string | null {
  if (!raw || !options || options.length === 0) return null;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(raw);
  if (!target) return null;
  const exact = options.find((o) => norm(o) === target);
  if (exact) return exact;
  // OCR often appends noise — accept an option the read contains (or vice-versa);
  // prefer the longest such option so "R-410A" beats a stray short match.
  const partial = options
    .filter((o) => {
      const n = norm(o);
      return n.length > 1 && (target.includes(n) || n.includes(target));
    })
    .sort((a, b) => norm(b).length - norm(a).length)[0];
  return partial ?? null;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

// Read-mode display for a stored spec value (the string form from parseAttributes).
export function formatSpecValue(field: EquipmentCategoryField, raw: string | undefined): string {
  if (field.dataType === 'BOOLEAN') return raw === 'true' ? 'Yes' : 'No';
  if (raw == null || raw.trim() === '') return '—';
  switch (field.dataType) {
    case 'CURRENCY': {
      const n = Number(raw);
      return Number.isFinite(n) ? usd.format(n) : raw;
    }
    case 'DATE': {
      const d = new Date(raw);
      return Number.isNaN(d.getTime())
        ? raw
        : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    default:
      return raw;
  }
}
