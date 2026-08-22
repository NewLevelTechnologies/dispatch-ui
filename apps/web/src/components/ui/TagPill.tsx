// ─────────────────────────────────────────────────────────────────
// TagPill.tsx — a tenant tag rendered as a tinted-fill pill.
//
// Single source for tag chrome across the app: detail-page headers,
// the inline tag picker, and the (read-only) Customers / Locations list
// rows. Maps the tag's color enum to a `.pill` tone (see utils/tagColor)
// so the fill matches the status-badge intensity — no raw color values.
//
//   <TagPill color={tag.color} name={tag.name} />                       ← read-only
//   <TagPill color={tag.color} name={tag.name} onRemove={…} removeLabel={…} />  ← editable
//
// `removeOnHover` keeps the × invisible until the pill is hovered (or the
// button is keyboard-focused) — for dense bands like the detail-page
// header where a permanently visible × invites stray clicks. The button
// stays in flow so revealing it never shifts layout.
// ─────────────────────────────────────────────────────────────────
import clsx from 'clsx';
import { tagPillTone } from '../../utils/tagColor';

interface TagPillProps {
  /** The tag's color enum (NEUTRAL, INFO, ACCENT_1, …). Off-enum → neutral. */
  color: string | null | undefined;
  name: string;
  /** When provided, renders a × that calls this (editable contexts only). */
  onRemove?: () => void;
  /** Accessible label for the remove button — required when onRemove is set. */
  removeLabel?: string;
  /** Reveal the × only on hover/focus (dense contexts, e.g. detail headers). */
  removeOnHover?: boolean;
  /** Extra classes on the pill (e.g. a max-width cap for dense list rows). */
  className?: string;
}

export function TagPill({ color, name, onRemove, removeLabel, removeOnHover, className }: TagPillProps) {
  return (
    <span className={clsx('pill', tagPillTone(color), removeOnHover && 'group/tagpill', className)}>
      <span className="min-w-0 truncate">{name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={clsx(
            '-mr-1 ml-0.5 rounded-full px-0.5 leading-none opacity-60 hover:opacity-100',
            removeOnHover &&
              'opacity-0 transition-opacity group-hover/tagpill:opacity-60 group-hover/tagpill:hover:opacity-100 focus-visible:opacity-100'
          )}
        >
          ×
        </button>
      )}
    </span>
  );
}

export default TagPill;
