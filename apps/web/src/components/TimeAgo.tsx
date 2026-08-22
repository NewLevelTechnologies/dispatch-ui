import { formatExactTimestamp, formatTimestamp } from '@dispatch/utils';

// Renders a hybrid relative/absolute timestamp (see lib/formatTimestamp) with
// the exact date+time always on hover via the title attribute. Use this
// wherever a single timestamp renders so the precise value is one hover away
// without cluttering the line. Returns null for empty/invalid input.
export function TimeAgo({
  iso,
  withTime,
  className,
}: {
  iso: string | null | undefined;
  withTime?: boolean;
  className?: string;
}) {
  const text = formatTimestamp(iso, { withTime });
  if (!text) return null;
  return (
    <span className={className} title={formatExactTimestamp(iso)}>
      {text}
    </span>
  );
}

export default TimeAgo;
