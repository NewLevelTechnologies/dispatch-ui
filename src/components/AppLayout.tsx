import { useAuthenticator } from '@aws-amplify/ui-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  HomeIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
  CurrencyDollarIcon,
  CalendarIcon,
  ShieldCheckIcon,
  KeyIcon,
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const location = useLocation();
  const { t } = useTranslation();
  const { theme, setTheme, colorScheme, setColorScheme } = useTheme();

  // Permission checks for navigation visibility
  const canViewUsers = useHasAnyCapability('VIEW_USERS');
  const canViewRoles = useHasAnyCapability('VIEW_ROLES');

  // Color scheme mapping for active button
  const activeColorClasses: Record<string, string> = {
    indigo: 'bg-indigo-600 text-white',
    blue: 'bg-blue-600 text-white',
    purple: 'bg-purple-600 text-white',
    emerald: 'bg-emerald-600 text-white',
    amber: 'bg-amber-600 text-white',
    rose: 'bg-rose-600 text-white',
  };

  const mainNavigation = [
    { name: t('entities.dashboard'), href: '/dashboard', icon: HomeIcon },
    { name: t('entities.customers'), href: '/customers', icon: UserGroupIcon },
    { name: t('entities.serviceLocations'), href: '/service-locations', icon: MapPinIcon },
    { name: t('entities.workOrders'), href: '/work-orders', icon: ClipboardDocumentListIcon },
  ];

  const equipmentNavigation = [
    { name: t('entities.equipment'), href: '/equipment', icon: WrenchScrewdriverIcon },
    { name: t('equipment.entities.parts'), href: '/parts-inventory', icon: CubeIcon },
    { name: t('equipment.entities.warehouses'), href: '/warehouses', icon: BuildingStorefrontIcon },
  ];

  const financialNavigation = [
    { name: t('entities.invoices'), href: '/invoices', icon: DocumentTextIcon },
    { name: t('entities.quotes'), href: '/quotes', icon: DocumentChartBarIcon },
    { name: t('entities.payments'), href: '/payments', icon: CreditCardIcon },
  ];

  const schedulingNavigation = [
    { name: t('scheduling.entities.dispatches'), href: '/dispatches', icon: CalendarIcon },
    { name: t('scheduling.entities.availability'), href: '/availability', icon: ClockIcon },
    { name: t('scheduling.entities.recurringOrders'), href: '/recurring-orders', icon: ArrowPathIcon },
  ];

  const adminNavigation = [
    ...(canViewUsers ? [{ name: t('entities.users'), href: '/users', icon: ShieldCheckIcon }] : []),
    ...(canViewRoles ? [{ name: t('entities.roles'), href: '/roles', icon: KeyIcon }] : []),
  ];

  return (
    <SidebarLayout
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-3">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ backgroundColor: 'var(--color-primary-600)' }}
              >
                <span className="text-sm font-bold text-white">D</span>
              </div>
              <div className="text-base font-semibold text-zinc-900 dark:text-white">
                {t('app.name')}
              </div>
            </div>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              {mainNavigation.map((item) => (
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

            <SidebarSection className="max-lg:hidden">
              <div className="flex items-center gap-3 px-2 py-1">
                <WrenchScrewdriverIcon className="h-5 w-5 text-zinc-500" />
                <span className="text-sm/6 font-medium text-zinc-500 dark:text-zinc-400">{t('entities.equipment')}</span>
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

            {adminNavigation.length > 0 && (
              <SidebarSection className="max-lg:hidden">
                {adminNavigation.map((item) => (
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
                          ? activeColorClasses[colorScheme]
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
                          ? activeColorClasses[colorScheme]
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
                          ? activeColorClasses[colorScheme]
                          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
                      }`}
                      aria-label="System theme"
                    >
                      <ComputerDesktopIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2 border-t border-zinc-200 dark:border-zinc-700">
                  <div className="text-sm font-medium text-zinc-900 dark:text-white mb-2">Color Scheme</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => setColorScheme('indigo')}
                      className={`flex items-center justify-center rounded-md p-2 transition-all ${
                        colorScheme === 'indigo'
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-600 ring-offset-2 dark:ring-offset-zinc-800'
                          : 'bg-indigo-100 dark:bg-indigo-950 hover:bg-indigo-200 dark:hover:bg-indigo-900'
                      }`}
                      aria-label="Indigo color scheme"
                      title="Indigo"
                    >
                      <div className="h-4 w-4 rounded-full bg-indigo-600" />
                    </button>
                    <button
                      onClick={() => setColorScheme('blue')}
                      className={`flex items-center justify-center rounded-md p-2 transition-all ${
                        colorScheme === 'blue'
                          ? 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2 dark:ring-offset-zinc-800'
                          : 'bg-blue-100 dark:bg-blue-950 hover:bg-blue-200 dark:hover:bg-blue-900'
                      }`}
                      aria-label="Blue color scheme"
                      title="Blue"
                    >
                      <div className="h-4 w-4 rounded-full bg-blue-600" />
                    </button>
                    <button
                      onClick={() => setColorScheme('purple')}
                      className={`flex items-center justify-center rounded-md p-2 transition-all ${
                        colorScheme === 'purple'
                          ? 'bg-purple-600 text-white ring-2 ring-purple-600 ring-offset-2 dark:ring-offset-zinc-800'
                          : 'bg-purple-100 dark:bg-purple-950 hover:bg-purple-200 dark:hover:bg-purple-900'
                      }`}
                      aria-label="Purple color scheme"
                      title="Purple"
                    >
                      <div className="h-4 w-4 rounded-full bg-purple-600" />
                    </button>
                    <button
                      onClick={() => setColorScheme('emerald')}
                      className={`flex items-center justify-center rounded-md p-2 transition-all ${
                        colorScheme === 'emerald'
                          ? 'bg-emerald-600 text-white ring-2 ring-emerald-600 ring-offset-2 dark:ring-offset-zinc-800'
                          : 'bg-emerald-100 dark:bg-emerald-950 hover:bg-emerald-200 dark:hover:bg-emerald-900'
                      }`}
                      aria-label="Emerald color scheme"
                      title="Emerald"
                    >
                      <div className="h-4 w-4 rounded-full bg-emerald-600" />
                    </button>
                    <button
                      onClick={() => setColorScheme('amber')}
                      className={`flex items-center justify-center rounded-md p-2 transition-all ${
                        colorScheme === 'amber'
                          ? 'bg-amber-600 text-white ring-2 ring-amber-600 ring-offset-2 dark:ring-offset-zinc-800'
                          : 'bg-amber-100 dark:bg-amber-950 hover:bg-amber-200 dark:hover:bg-amber-900'
                      }`}
                      aria-label="Amber color scheme"
                      title="Amber"
                    >
                      <div className="h-4 w-4 rounded-full bg-amber-600" />
                    </button>
                    <button
                      onClick={() => setColorScheme('rose')}
                      className={`flex items-center justify-center rounded-md p-2 transition-all ${
                        colorScheme === 'rose'
                          ? 'bg-rose-600 text-white ring-2 ring-rose-600 ring-offset-2 dark:ring-offset-zinc-800'
                          : 'bg-rose-100 dark:bg-rose-950 hover:bg-rose-200 dark:hover:bg-rose-900'
                      }`}
                      aria-label="Rose color scheme"
                      title="Rose"
                    >
                      <div className="h-4 w-4 rounded-full bg-rose-600" />
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
