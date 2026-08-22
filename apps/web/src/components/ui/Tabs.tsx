// ─────────────────────────────────────────────────────────────────
// Tabs.tsx — underlined section tabs on detail pages.
//
// Two flavors:
//   <Tabs> — large, used on detail pages (Job, Customer, Invoice)
//   <ViewTabs> — list-page saved views, with counts and tone dots
//
// Both are controlled — pass `value` and `onChange`.
//
//   <Tabs value={tab} onChange={setTab} tabs={[
//     { id: 'overview', label: 'Overview' },
//     { id: 'items',    label: 'Work items', count: 2 },
//     { id: 'trips',    label: 'Trips',      count: 3 },
//   ]} />
//
//   <ViewTabs value={view} onChange={setView} tabs={[
//     { id: 'open',    label: 'Open',           count: 38 },
//     { id: 'urgent',  label: 'Urgent',         count: 4, tone: 'danger' },
//     { id: 'today',   label: 'Today',          count: 14, tone: 'info' },
//   ]} />
// ─────────────────────────────────────────────────────────────────
import clsx from 'clsx';

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'accent';

type Tab = { id: string; label: string; count?: number | string };
type ViewTab = Tab & { tone?: Tone };

export function Tabs({
  value, onChange, tabs, className,
}: {
  value: string;
  onChange: (id: string) => void;
  tabs: Tab[];
  className?: string;
}) {
  return (
    <div className={clsx('tab-row', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx('tab', value === t.id && 'active')}
        >
          {t.label}
          {t.count != null && (
            <span className="tag" style={{ marginLeft: 4 }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

const toneVar = (t?: Tone) => ({
  info:    'var(--info-500)',
  success: 'var(--success-500)',
  warning: 'var(--warning-500)',
  danger:  'var(--danger-500)',
  accent:  'var(--accent-500)',
}[t as Tone] ?? 'var(--fg-dim)');

export function ViewTabs({
  value, onChange, tabs, className,
}: {
  value: string;
  onChange: (id: string) => void;
  tabs: ViewTab[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={clsx('flex gap-1 border-b border-border overflow-x-auto', className)}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={clsx('view-tab', value === t.id && 'active')}
        >
          {t.tone && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: toneVar(t.tone) }}
            />
          )}
          {t.label}
          {t.count != null && <span className="view-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
