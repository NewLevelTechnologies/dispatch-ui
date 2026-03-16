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
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  DocumentTextIcon,
  DocumentChartBarIcon,
  CreditCardIcon,
} from '@heroicons/react/24/outline';
import { Sidebar, SidebarBody, SidebarFooter, SidebarHeader, SidebarItem, SidebarSection } from './catalyst/sidebar';
import { SidebarLayout } from './catalyst/sidebar-layout';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from './catalyst/navbar';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { Avatar } from './catalyst/avatar';
import { useTheme } from '../contexts/ThemeContext';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const location = useLocation();
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const mainNavigation = [
    { name: t('entities.dashboard'), href: '/dashboard', icon: HomeIcon },
    { name: t('entities.customers'), href: '/customers', icon: UserGroupIcon },
    { name: t('entities.workOrders'), href: '/work-orders', icon: ClipboardDocumentListIcon },
    { name: t('entities.equipment'), href: '/equipment', icon: WrenchScrewdriverIcon },
  ];

  const financialNavigation = [
    { name: t('entities.invoices'), href: '/invoices', icon: DocumentTextIcon },
    { name: t('entities.quotes'), href: '/quotes', icon: DocumentChartBarIcon },
    { name: t('entities.payments'), href: '/payments', icon: CreditCardIcon },
  ];

  const schedulingNavigation = [
    { name: t('entities.scheduling'), href: '/scheduling', icon: CalendarIcon },
    // TODO: Add capability check - only show if user has VIEW_USERS capability
    { name: t('entities.users'), href: '/users', icon: ShieldCheckIcon },
  ];

  return (
    <SidebarLayout
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
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
              <div className="flex items-center gap-2 px-2 py-1">
                <CurrencyDollarIcon className="h-4 w-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-500">{t('entities.financial')}</span>
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
      <div className="p-3">
        {children}
      </div>
    </SidebarLayout>
  );
}
