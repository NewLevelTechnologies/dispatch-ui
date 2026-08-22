// ─────────────────────────────────────────────────────────────────
// Timeline.tsx — vertical activity feed.
//
// Used on Job detail, Invoice detail, Customer detail to show who
// did what and when.
//
//   <Timeline items={[
//     { dot: 'info',    time: '11:24a', text: <><strong>Maria C.</strong> created job</> },
//     { dot: '',        time: '11:28a', text: <>Confirmation SMS sent</> },
//     { dot: 'success', time: '12:42p', text: <>Tech marked on site</> },
//     { dot: 'muted',   time: '—',      text: <span style={{opacity:.6}}>Awaiting completion</span> },
//   ]} />
//
// dot tone affects the ring color: '' uses accent; pass 'info' |
// 'success' | 'warning' | 'danger' | 'muted' to override.
// ─────────────────────────────────────────────────────────────────
import type { ReactNode } from 'react';
import clsx from 'clsx';

type DotTone = '' | 'info' | 'success' | 'warning' | 'danger' | 'muted';

export type TimelineEntry = {
  dot?: DotTone;
  time: ReactNode;
  text: ReactNode;
};

export function Timeline({
  items, className, maxHeight,
}: {
  items: TimelineEntry[];
  className?: string;
  maxHeight?: number | string;
}) {
  return (
    <div
      className={clsx('timeline', className)}
      style={maxHeight ? { maxHeight, overflow: 'auto' } : undefined}
    >
      {items.map((it, i) => (
        <div className="timeline-item" key={i}>
          <div className={clsx('timeline-dot', it.dot || '')} />
          <div className="timeline-time">{it.time}</div>
          <div className="timeline-text">{it.text}</div>
        </div>
      ))}
    </div>
  );
}
