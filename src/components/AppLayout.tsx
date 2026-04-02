import { useAuthenticator } from '@aws-amplify/ui-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import { useSidebar } from '../contexts/SidebarContext';
import {
  HomeIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  ShieldCheckIcon,
  KeyIcon,
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
  Bars3Icon,
  ChevronDoubleLeftIcon,
} from '@heroicons/react/24/outline';
import { Sidebar, SidebarBody, SidebarFooter, SidebarHeader, SidebarItem, SidebarSection } from './catalyst/sidebar';
import { SidebarLayout } from './catalyst/sidebar-layout';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from './catalyst/navbar';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { Avatar } from './catalyst/avatar';
import { useTheme } from '../contexts/ThemeContext';
import { useHasAnyCapability } from '../hooks/useCurrentUser';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const location = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { theme, setTheme } = useTheme();
  const { isCollapsed, toggleSidebar } = useSidebar();

  // Permission checks for navigation visibility
  const canViewUsers = useHasAnyCapability('VIEW_USERS');
  const canViewRoles = useHasAnyCapability('VIEW_ROLES');
  const canViewSettings = useHasAnyCapability('VIEW_SETTINGS');

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
    ...(canViewRoles ? [{ name: t('entities.roles'), href: '/roles', icon: KeyIcon }] : []),
    ...(canViewSettings ? [{ name: t('entities.settings'), href: '/settings', icon: Cog6ToothIcon }] : []),
  ];

  return (
    <SidebarLayout
      isCollapsed={isCollapsed}
      sidebar={
        <Sidebar>
          <SidebarHeader>
            {isCollapsed ? (
              <div className="flex items-center justify-center">
                <button
                  onClick={toggleSidebar}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-950/5 dark:hover:bg-white/5 transition-colors"
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                >
                  <Bars3Icon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 flex-shrink-0">
                    <span className="text-sm font-bold text-white">D</span>
                  </div>
                  <div className="text-base font-semibold text-zinc-900 dark:text-white truncate">
                    {t('app.name')}
                  </div>
                </div>
                <button
                  onClick={toggleSidebar}
                  className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-zinc-950/5 dark:hover:bg-white/5 transition-colors flex-shrink-0"
                  aria-label="Collapse sidebar"
                >
                  <ChevronDoubleLeftIcon className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                </button>
              </div>
            )}
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              {mainNavigation.map((item) => (
                <SidebarItem
                  key={item.name}
                  href={item.href}
                  current={location.pathname === item.href}
                  title={isCollapsed ? item.name : undefined}
                >
                  {isCollapsed ? (
                    <div className="flex w-full items-center justify-center">
                      <item.icon className="h-5 w-5" />
                    </div>
                  ) : (
                    <>
                      <item.icon className="h-5 w-5" />
                      <span>{item.name}</span>
                    </>
                  )}
                </SidebarItem>
              ))}
            </SidebarSection>

            {!isCollapsed && (
              <SidebarSection className="max-lg:hidden">
                <div className="flex items-center gap-3 px-2 py-1">
                  <WrenchScrewdriverIcon className="h-5 w-5 text-zinc-500" />
                  <span className="text-sm/6 font-medium text-zinc-500 dark:text-zinc-400">{getName('equipment', true)}</span>
                </div>
                {equipmentNavigation.map((item) => (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={location.pathname === item.href}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </SidebarItem>
                ))}
              </SidebarSection>
            )}
            {isCollapsed && (
              <>
                <div className="mx-auto my-2 h-px w-8 bg-zinc-200 dark:bg-zinc-800" />
                <SidebarSection className="max-lg:hidden">
                  {equipmentNavigation.map((item) => (
                    <SidebarItem
                      key={item.name}
                      href={item.href}
                      current={location.pathname === item.href}
                      title={item.name}
                    >
                      <div className="flex w-full items-center justify-center">
                        <item.icon className="h-5 w-5" />
                      </div>
                    </SidebarItem>
                  ))}
                </SidebarSection>
              </>
            )}

            {!isCollapsed && (
              <SidebarSection className="max-lg:hidden">
                <div className="flex items-center gap-3 px-2 py-1">
                  <CurrencyDollarIcon className="h-5 w-5 text-zinc-500" />
                  <span className="text-sm/6 font-medium text-zinc-500 dark:text-zinc-400">{t('entities.financial')}</span>
                </div>
                {financialNavigation.map((item) => (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={location.pathname === item.href}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </SidebarItem>
                ))}
              </SidebarSection>
            )}
            {isCollapsed && (
              <>
                <div className="mx-auto my-2 h-px w-8 bg-zinc-200 dark:bg-zinc-800" />
                <SidebarSection className="max-lg:hidden">
                  {financialNavigation.map((item) => (
                    <SidebarItem
                      key={item.name}
                      href={item.href}
                      current={location.pathname === item.href}
                      title={item.name}
                    >
                      <div className="flex w-full items-center justify-center">
                        <item.icon className="h-5 w-5" />
                      </div>
                    </SidebarItem>
                  ))}
                </SidebarSection>
              </>
            )}

            {!isCollapsed && (
              <SidebarSection className="max-lg:hidden">
                <div className="flex items-center gap-3 px-2 py-1">
                  <CalendarIcon className="h-5 w-5 text-zinc-500" />
                  <span className="text-sm/6 font-medium text-zinc-500 dark:text-zinc-400">{t('entities.scheduling')}</span>
                </div>
                {schedulingNavigation.map((item) => (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={location.pathname === item.href}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </SidebarItem>
                ))}
              </SidebarSection>
            )}
            {isCollapsed && (
              <>
                <div className="mx-auto my-2 h-px w-8 bg-zinc-200 dark:bg-zinc-800" />
                <SidebarSection className="max-lg:hidden">
                  {schedulingNavigation.map((item) => (
                    <SidebarItem
                      key={item.name}
                      href={item.href}
                      current={location.pathname === item.href}
                      title={item.name}
                    >
                      <div className="flex w-full items-center justify-center">
                        <item.icon className="h-5 w-5" />
                      </div>
                    </SidebarItem>
                  ))}
                </SidebarSection>
              </>
            )}

            {adminNavigation.length > 0 && (
              <>
                {isCollapsed && <div className="mx-auto my-2 h-px w-8 bg-zinc-200 dark:bg-zinc-800" />}
                <SidebarSection className="max-lg:hidden">
                  {adminNavigation.map((item) => (
                    <SidebarItem
                      key={item.name}
                      href={item.href}
                      current={location.pathname === item.href}
                      title={isCollapsed ? item.name : undefined}
                    >
                      {isCollapsed ? (
                        <div className="flex w-full items-center justify-center">
                          <item.icon className="h-5 w-5" />
                        </div>
                      ) : (
                        <>
                          <item.icon className="h-5 w-5" />
                          <span>{item.name}</span>
                        </>
                      )}
                    </SidebarItem>
                  ))}
                </SidebarSection>
              </>
            )}
          </SidebarBody>

          <SidebarFooter>
            <Dropdown>
              <DropdownButton
                as={SidebarItem}
                title={isCollapsed ? user?.signInDetails?.loginId : undefined}
              >
                {isCollapsed ? (
                  <div className="flex w-full items-center justify-center">
                    <Avatar
                      slot="icon"
                      initials={user?.signInDetails?.loginId?.charAt(0).toUpperCase() || 'U'}
                      className="size-6"
                    />
                  </div>
                ) : (
                  <>
                    <Avatar
                      slot="icon"
                      initials={user?.signInDetails?.loginId?.charAt(0).toUpperCase() || 'U'}
                      className="size-6"
                    />
                    <span className="truncate">{user?.signInDetails?.loginId}</span>
                  </>
                )}
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
