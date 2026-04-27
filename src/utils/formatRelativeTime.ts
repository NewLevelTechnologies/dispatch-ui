/**
 * Returns a short, human-readable "time ago" string for an ISO timestamp.
 * Examples: "just now", "14m ago", "3h ago", "2d ago", "Apr 26, 2026".
 *
 * For dates older than ~1 week we fall through to an absolute date so the value
 * stays glanceable without becoming misleading ("47 days ago" carries no
 * useful information for a CSR scanning a header).
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));

  if (diffSec < 30) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
