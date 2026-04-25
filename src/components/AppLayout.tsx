import { useAuthenticator } from '@aws-amplify/ui-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  HomeIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
  CalendarIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  DocumentTextIcon,
  DocumentChartBarIcon,
  CreditCardIcon,
  CubeIcon,
  BuildingStorefrontIcon,
  ClockIcon,
  ArrowPathIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { Sidebar, SidebarBody, SidebarFooter, SidebarHeader, SidebarItem, SidebarSection } from './catalyst/sidebar';
import { SidebarLayout } from './catalyst/sidebar-layout';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from './catalyst/navbar';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { Avatar } from './catalyst/avatar';
import { useTheme } from '../contexts/ThemeContext';
import { useHasAnyCapability } from '../hooks/useCurrentUser';

const ENV_BADGE: Record<string, { label: string; className: string }> = {
  development: { label: 'DEV', className: 'bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-400' },
  qa: { label: 'QA', className: 'bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-400' },
  staging: { label: 'STG', className: 'bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-400' },
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-1 mb-1 px-2 text-[11px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
      {children}
    </h3>
  );
}

function navItemClasses(isCurrent: boolean) {
  return isCurrent
    ? 'rounded-lg bg-zinc-950/[0.04] dark:bg-white/[0.06]'
    : '';
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const location = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { theme, setTheme } = useTheme();

  // Permission checks for navigation visibility
  const canViewUsers = useHasAnyCapability('VIEW_USERS');
  const canViewSettings = useHasAnyCapability('VIEW_SETTINGS');

  const envKey = (import.meta.env.VITE_ENV || '').toLowerCase();
  const envBadge = ENV_BADGE[envKey];

  const isCurrent = (href: string) =>
    href === '/dashboard' ? location.pathname === href : location.pathname.startsWith(href);

  const mainNavigation = [
    { name: t('entities.dashboard'), href: '/dashboard', icon: HomeIcon },
    { name: getName('customer', true), href: '/customers', icon: UserGroupIcon },
    { name: getName('service_location', true), href: '/service-locations', icon: MapPinIcon },
    { name: getName('work_order', true), href: '/work-orders', icon: ClipboardDocumentListIcon },
  ];

  const equipmentNavigation = [
    { name: getName('equipment', true), href: '/equipment', icon: WrenchScrewdriverIcon },
    { name: t('equipment.entities.parts'), href: '/parts-inventory', icon: CubeIcon },
    { name: t('equipment.entities.warehouses'), href: '/warehouses', icon: BuildingStorefrontIcon },
  ];

  const financialNavigation = [
    { name: getName('invoice', true), href: '/invoices', icon: DocumentTextIcon },
    { name: getName('quote', true), href: '/quotes', icon: DocumentChartBarIcon },
    { name: getName('payment', true), href: '/payments', icon: CreditCardIcon },
  ];

  const schedulingNavigation = [
    { name: getName('dispatch', true), href: '/dispatches', icon: CalendarIcon },
    { name: t('scheduling.entities.availability'), href: '/availability', icon: ClockIcon },
    { name: t('scheduling.entities.recurringOrders'), href: '/recurring-orders', icon: ArrowPathIcon },
  ];

  const adminNavigation = [
    ...(canViewUsers ? [{ name: t('entities.users'), href: '/users', icon: ShieldCheckIcon }] : []),
    ...(canViewSettings ? [{ name: t('entities.settings'), href: '/settings', icon: Cog6ToothIcon }] : []),
  ];

  return (
    <SidebarLayout
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow-sm">
                <span className="text-sm font-bold text-white">D</span>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-base font-semibold text-zinc-900 dark:text-white">
                  {t('app.name')}
                </span>
                {envBadge && (
                  <span
                    className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider ring-1 ring-inset ${envBadge.className}`}
                  >
                    {envBadge.label}
                  </span>
                )}
              </div>
            </div>
          </SidebarHeader>

          <SidebarBody className="[&>[data-slot=section]+[data-slot=section]]:mt-5">
            <SidebarSection>
              {mainNavigation.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={current}
                    className={navItemClasses(current)}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </SidebarItem>
                );
              })}
            </SidebarSection>

            <SidebarSection>
              <SectionHeading>{t('entities.inventory')}</SectionHeading>
              {equipmentNavigation.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={current}
                    className={navItemClasses(current)}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </SidebarItem>
                );
              })}
            </SidebarSection>

            <SidebarSection>
              <SectionHeading>{t('entities.financial')}</SectionHeading>
              {financialNavigation.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={current}
                    className={navItemClasses(current)}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </SidebarItem>
                );
              })}
            </SidebarSection>

            <SidebarSection>
              <SectionHeading>{t('entities.scheduling')}</SectionHeading>
              {schedulingNavigation.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={current}
                    className={navItemClasses(current)}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </SidebarItem>
                );
              })}
            </SidebarSection>

            {adminNavigation.length > 0 && (
              <SidebarSection>
                {adminNavigation.map((item) => {
                  const current = isCurrent(item.href);
                  return (
                    <SidebarItem
                      key={item.name}
                      href={item.href}
                      current={current}
                      className={navItemClasses(current)}
                    >
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </SidebarItem>
                  );
                })}
              </SidebarSection>
            )}
          </SidebarBody>

          <SidebarFooter>
            <Dropdown>
              <DropdownButton as={SidebarItem}>
                <Avatar
                  slot="icon"
                  initials={user?.signInDetails?.loginId?.charAt(0).toUpperCase() || 'U'}
                  className="size-6"
                />
                <span className="truncate">{user?.signInDetails?.loginId}</span>
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="top start">
                <div className="px-3 py-2">
                  <div className="text-sm font-medium text-zinc-900 dark:text-white mb-2">{t('common.theme')}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        theme === 'light'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                      aria-label="Light mode"
                    >
                      <SunIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        theme === 'dark'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                      aria-label="Dark mode"
                    >
                      <MoonIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setTheme('system')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        theme === 'system'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                      aria-label="System theme"
                    >
                      <ComputerDesktopIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <DropdownItem href="/account/settings">
                  <DropdownLabel>{t('account.settings')}</DropdownLabel>
                </DropdownItem>
                <DropdownItem onClick={() => signOut()}>
                  <DropdownLabel>{t('common.signOut')}</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
      navbar={
        <Navbar>
          <NavbarSpacer />
          <NavbarSection>
            <NavbarItem>
              <Avatar
                initials={user?.signInDetails?.loginId?.charAt(0).toUpperCase() || 'U'}
                className="size-8"
              />
            </NavbarItem>
          </NavbarSection>
        </Navbar>
      }
    >
      <div className="p-2">
        {children}
      </div>
    </SidebarLayout>
  );
}
