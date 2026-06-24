import { useMemo, useState } from 'react';
import * as Headless from '@headlessui/react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bars3Icon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useCurrentUser, useHasAnyCapability } from '../../hooks/useCurrentUser';
import AppLayout from '../../components/AppLayout';
import { Button } from '../../components/catalyst/button';
import { SoonBadge } from '../../components/settings/SoonBadge';

interface NavItem {
  label: string;
  to: string;
  soon?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

// Rail body (header + nav) shared between the inline desktop `<aside>` and the
// mobile off-canvas drawer. Renders no landmark of its own so the inline
// `<aside>` stays the single `complementary` element. `onNavigate` fires when a
// link is tapped so the drawer can auto-close after the route changes.
interface RailContentProps {
  primaryRole?: string;
  query: string;
  setQuery: (value: string) => void;
  filteredSections: NavSection[];
  onNavigate?: () => void;
}

function RailContent({
  primaryRole,
  query,
  setQuery,
  filteredSections,
  onNavigate,
}: RailContentProps) {
  const { t } = useTranslation();
  return (
    <>
      <div className="border-b border-border-soft px-5 pt-5 pb-3">
        <div className="text-[15px] font-semibold tracking-tight text-fg-strong">
          {t('entities.settings')}
        </div>
        {primaryRole && (
          <div className="mt-0.5 text-[11.5px] text-fg-muted">{primaryRole}</div>
        )}
        <div className="relative mt-3">
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-fg-dim"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('settings.searchPlaceholder')}
            className="block h-7 w-full rounded-md border border-border bg-bg-elev pl-7 pr-2 text-[12px] text-fg placeholder:text-fg-dim focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500/30"
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {filteredSections.map((section) => (
          <div key={section.label}>
            <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-fg-muted">
              {section.label}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      [
                        'group relative flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12.5px] transition-colors',
                        isActive
                          ? 'bg-bg-active font-semibold text-fg-strong'
                          : 'text-fg hover:bg-bg-hover hover:text-fg-strong',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-r-sm bg-accent-500"
                          />
                        )}
                        <span className="truncate">{item.label}</span>
                        {item.soon && <SoonBadge />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {filteredSections.length === 0 && (
          <div className="px-2 py-1 text-[12px] text-fg-muted">
            {t('common.actions.noMatchSearch', {
              entities: t('entities.settings').toLowerCase(),
            })}
          </div>
        )}
      </nav>
    </>
  );
}

export default function SettingsLayout() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canViewUsers = useHasAnyCapability('VIEW_USERS');
  const { data: currentUser } = useCurrentUser();
  const [query, setQuery] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const sections: NavSection[] = useMemo(() => [
    {
      label: t('settings.sections.organization'),
      items: [
        { label: t('settings.nav.companyProfile'), to: '/settings/company-profile' },
        { label: t('settings.nav.terminology'), to: '/settings/terminology' },
        { label: t('settings.nav.notificationTemplates'), to: '/settings/notifications' },
      ],
    },
    {
      label: t('settings.sections.dispatch', { dispatch: getName('dispatch') }),
      items: [
        { label: getName('dispatch_region', true), to: '/settings/dispatch-regions' },
      ],
    },
    {
      // Section label uses the agreement glossary term; the "Plans" item label is
      // a fixed static string (no glossary key for plan yet — see agreement-plans.md).
      label: getName('agreement', true),
      items: [
        { label: t('settings.nav.plans'), to: '/settings/agreement-plans' },
      ],
    },
    {
      label: t('settings.sections.workOrders', { workOrders: getName('work_order', true) }),
      items: [
        { label: t('settings.nav.types'), to: '/settings/work-orders/types' },
        { label: getName('division', true), to: '/settings/work-orders/divisions' },
        { label: t('settings.nav.itemStatuses'), to: '/settings/work-orders/item-statuses' },
        { label: t('settings.nav.workflows'), to: '/settings/work-orders/workflows' },
      ],
    },
    {
      label: t('settings.sections.equipment', { equipment: getName('equipment', true) }),
      items: [
        { label: t('settings.nav.equipmentTaxonomy'), to: '/settings/equipment/types' },
        { label: t('settings.nav.filterSizes'), to: '/settings/equipment/filter-sizes' },
      ],
    },
    {
      label: t('settings.sections.access'),
      items: [
        ...(canViewUsers ? [{ label: t('entities.users'), to: '/settings/access/users' }] : []),
        { label: getName('role', true), to: '/settings/access/roles' },
      ],
    },
  ], [t, getName, canViewUsers]);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((i) => i.label.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [sections, query]);

  const primaryRole = currentUser?.roles?.[0]?.name;

  return (
    <AppLayout flush>
      <div className="flex h-[calc(100svh-52px)] min-h-0 max-lg:h-auto max-lg:flex-col">
        {/* ── Flush left rail (desktop) ───────────────────────── */}
        <aside className="flex w-[240px] shrink-0 flex-col border-r border-border bg-bg max-lg:hidden">
          <RailContent
            primaryRole={primaryRole}
            query={query}
            setQuery={setQuery}
            filteredSections={filteredSections}
          />
        </aside>

        {/* ── Content pane ─────────────────────────────────── */}
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-6 max-lg:px-4 max-lg:py-4">
          <div className="mx-auto max-w-screen-xl">
            {/* Nav toggle — opens the off-canvas rail below `lg` */}
            <div className="mb-3 flex items-center gap-2 lg:hidden">
              <Button
                plain
                size="xs"
                aria-label={t('settings.openNav')}
                onClick={() => setNavOpen(true)}
              >
                <Bars3Icon className="size-5 text-fg-strong" />
              </Button>
              <span className="text-[13px] font-semibold text-fg-strong max-sm:hidden">
                {t('entities.settings')}
              </span>
            </div>
            <Outlet />
          </div>
        </main>
      </div>

      {/* ── Off-canvas rail (mobile) ─────────────────────────── */}
      <Headless.Dialog open={navOpen} onClose={() => setNavOpen(false)}>
        <Headless.DialogBackdrop
          transition
          className="fixed inset-0 z-40 bg-zinc-950/30 transition duration-150 data-closed:opacity-0 dark:bg-zinc-950/50"
        />
        <div className="fixed inset-y-0 left-0 z-50 flex">
          <Headless.DialogPanel
            transition
            className="flex w-[280px] max-w-[85vw] flex-col bg-bg-elev shadow-lg transition duration-200 ease-out data-closed:-translate-x-full"
          >
            <RailContent
              primaryRole={primaryRole}
              query={query}
              setQuery={setQuery}
              filteredSections={filteredSections}
              onNavigate={() => setNavOpen(false)}
            />
          </Headless.DialogPanel>
        </div>
      </Headless.Dialog>
    </AppLayout>
  );
}
