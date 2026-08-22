/* eslint-disable i18next/no-literal-string */
// ─────────────────────────────────────────────────────────────────
// AppShell.tsx — dark sidebar + topbar + content area.
//
// The sidebar uses sidebar-* tokens that intentionally stay dark in
// both light and dark themes. That's the visual signature of this
// system (Linear, Vercel, ServiceTitan all do this).
//
// NOTE: this is a pattern reference — placeholder NAV groups, brand
// chip, search affordance and "⌘K" hint are baked in for visual
// fidelity to the handoff. When the project's real AppLayout migrates
// to this shell, pass nav data through props and i18n the strings.
//
//   <AppShell active="Jobs">
//     <PageHead title="..." />
//     ...content...
//   </AppShell>
// ─────────────────────────────────────────────────────────────────
import { Fragment, type ReactNode } from 'react';
import { ThemeToggle } from '../ThemeProvider';

type NavItem = { name: string; href?: string; badge?: string | number };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  { label: 'Operations', items: [
    { name: 'Overview' },
    { name: 'Dispatch', badge: 14 },
    { name: 'Schedule' },
    { name: 'Jobs', badge: 38 },
    { name: 'Map' },
  ]},
  { label: 'Records', items: [
    { name: 'Customers' },
    { name: 'Invoices', badge: 7 },
    { name: 'Estimates' },
    { name: 'Inventory' },
  ]},
  { label: 'Insights', items: [
    { name: 'Reports' },
    { name: 'Settings' },
  ]},
];

export function AppShell({
  active, breadcrumbs, children,
}: {
  active: string;
  breadcrumbs?: string[];
  children: ReactNode;
}) {
  return (
    <div className="flex h-screen w-full bg-bg-sunken text-fg font-sans text-[13px]">
      <Sidebar active={active} />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar breadcrumbs={breadcrumbs} />
        <div className="flex-1 overflow-auto px-5 py-5">{children}</div>
      </main>
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  return (
    <aside className="w-[220px] shrink-0 bg-sidebar-bg text-sidebar-fg flex flex-col border-r border-sidebar-border">
      {/* Brand */}
      <div className="px-4 py-3.5 flex items-center gap-2.5 border-b border-sidebar-border">
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-accent-500 to-accent-700 grid place-items-center text-white text-[13px] font-bold shadow-sm">
          CF
        </div>
        <div className="flex flex-col leading-tight">
          <div className="text-white font-semibold text-[14px] tracking-tight">Coolfront</div>
          <div className="text-sidebar-fg-dim font-mono text-[10.5px] uppercase tracking-wider">Ops · West</div>
        </div>
      </div>

      {NAV.map((g) => (
        <div key={g.label} className="px-2.5 pt-3.5 pb-1">
          <div className="text-sidebar-fg-dim text-[10px] font-semibold uppercase tracking-wider px-2 pb-1.5">
            {g.label}
          </div>
          {g.items.map((it) => {
            const isActive = it.name === active;
            return (
              <div key={it.name}
                className={`relative flex items-center gap-2.5 px-2.5 py-1.5 rounded-sm text-[12.5px] font-medium cursor-pointer ${
                  isActive ? 'bg-sidebar-bg-2 text-white' : 'hover:bg-sidebar-bg-2'
                }`}>
                {isActive && (
                  <span className="absolute -left-2.5 top-1.5 bottom-1.5 w-[2.5px] rounded bg-accent-500" />
                )}
                <span className="flex-1">{it.name}</span>
                {it.badge != null && (
                  <span className={`font-mono text-[10px] px-1.5 rounded ${
                    isActive ? 'bg-accent-500 text-white' : 'bg-sidebar-bg-2 text-sidebar-fg-dim'
                  }`}>
                    {it.badge}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </aside>
  );
}

function Topbar({ breadcrumbs }: { breadcrumbs?: string[] }) {
  return (
    <div className="h-[52px] shrink-0 bg-bg border-b border-border flex items-center px-4 gap-3.5">
      {breadcrumbs && (
        <div className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
          {breadcrumbs.map((c, i) => (
            <Fragment key={i}>
              <span className={i === breadcrumbs.length - 1 ? 'text-fg-strong font-semibold' : ''}>
                {c}
              </span>
              {i < breadcrumbs.length - 1 && <span className="text-fg-dim opacity-60">/</span>}
            </Fragment>
          ))}
        </div>
      )}
      <div className="flex-1 max-w-[380px] mx-auto bg-bg-sunken border border-border rounded-md h-[30px] px-2.5 flex items-center gap-2 text-fg-muted text-[12.5px]">
        <span>Search…</span>
        <span className="ml-auto font-mono text-[10px] bg-bg border border-border px-1.5 py-px rounded">⌘K</span>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
      </div>
    </div>
  );
}
