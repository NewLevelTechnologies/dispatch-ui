// Pure formatting helpers for the Customer detail variants. Kept out of
// shared.tsx so that file can export only components (react-refresh rule).

// Initials for the square org mark — first letters of the first two words.
// "Iverson Properties LLC" → "IP". Single-word names take their first two
// characters ("Baba" → "BA").
export function orgInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function formatDateShort(d?: string | Date | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// USD currency. `null`/`undefined` → "—" (not enriched). Decimal dollars on
// the wire (per LOC-1 `balance`), so 0 is a meaningful "known zero".
export function formatMoney(amount?: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
