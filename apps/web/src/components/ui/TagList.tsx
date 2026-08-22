// ─────────────────────────────────────────────────────────────────
// TagList.tsx — read-only tag chips for a dense list-table cell. Shows up
// to two tags + a "+N" overflow pill; renders an em-dash when empty.
// Shared by the Customers and Payers list "Tags" columns.
//
// Color from tag.color IS surfaced via TagPill — the overflow pill stays
// neutral. Keep the visible cap small so rows stay scannable.
// ─────────────────────────────────────────────────────────────────
import type { TagSummary } from '../../api/setup';
import { TagPill } from './TagPill';
import { Pill } from './Pill';

export function TagList({ tags }: { tags?: TagSummary[] }) {
  if (!tags || tags.length === 0) return <span className="text-fg-dim">—</span>;
  const visible = tags.slice(0, 2);
  const overflow = tags.slice(2);
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((tag) => (
        <TagPill key={tag.id} color={tag.color} name={tag.name} className="max-w-[140px]" />
      ))}
      {overflow.length > 0 && (
        <span title={overflow.map((tag) => tag.name).join(', ')}>
          <Pill tone="neutral">{`+${overflow.length}`}</Pill>
        </span>
      )}
    </div>
  );
}

export default TagList;
