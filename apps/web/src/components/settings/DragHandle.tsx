type Props = {
  ariaLabel?: string;
};

export function DragHandle({ ariaLabel = 'Drag to reorder' }: Props) {
  return (
    <span
      aria-label={ariaLabel}
      role="img"
      className="inline-flex h-6 w-4 cursor-grab items-center justify-center text-fg-dim hover:text-fg-muted active:cursor-grabbing"
    >
      <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
        <circle cx="2" cy="2" r="1.2" />
        <circle cx="8" cy="2" r="1.2" />
        <circle cx="2" cy="7" r="1.2" />
        <circle cx="8" cy="7" r="1.2" />
        <circle cx="2" cy="12" r="1.2" />
        <circle cx="8" cy="12" r="1.2" />
      </svg>
    </span>
  );
}
