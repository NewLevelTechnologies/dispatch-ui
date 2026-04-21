import { useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
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
  ChevronDownIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';
import { Sidebar, SidebarBody, SidebarDivider, SidebarFooter, SidebarHeader, SidebarItem, SidebarSection } from './catalyst/sidebar';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from './catalyst/navbar';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { Avatar } from './catalyst/avatar';
import { useTheme } from '../contexts/ThemeContext';
import { useHasAnyCapability } from '../hooks/useCurrentUser';
import { DenseSidebarLayout } from './shell/DenseSidebarLayout';
import { PaletteSwitcher } from './shell/PaletteSwitcher';

const COLLAPSED_KEY = 'sidebar-collapsed';
const DEFAULT_COLLAPSED = { equipment: false, financial: false, scheduling: false, admin: false };

function SectionToggle({
  section,
  label,
  icon: Icon,
  collapsed,
  onToggle,
}: {
  section: string;
  label: string;
  icon: React.ElementType;
  collapsed: Record<string, boolean>;
  onToggle: (section: string) => void;
}) {
  const isCollapsed = collapsed[section];
  return (
    <div onClick={() => onToggle(section)} className="flex w-full cursor-pointer items-center gap-2 px-2 py-1">
      <Icon className="h-4 w-4 text-text-tertiary shrink-0" aria-hidden="true" />
      <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(section); }}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        className="shrink-0 text-text-tertiary hover:text-text-primary transition-colors"
      >
        {isCollapsed
          ? <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
          : <ChevronDownIcon className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}

function loadCollapsed(): Record<string, boolean> {
  try {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : DEFAULT_COLLAPSED;
  } catch {
    return DEFAULT_COLLAPSED;
  }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const location = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { theme, setTheme } = useTheme();

  const canViewUsers = useHasAnyCapability('VIEW_USERS');
  const canViewRoles = useHasAnyCapability('VIEW_ROLES');
  const canViewSettings = useHasAnyCapability('VIEW_SETTINGS');

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);

  const toggleSection = (section: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      return next;
    });
  };

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

  const allNavItems = [
    ...mainNavigation,
    ...equipmentNavigation,
    ...financialNavigation,
    ...schedulingNavigation,
    ...adminNavigation,
  ];
  const currentPage = allNavItems.find(item => item.href === location.pathname);

  return (
    <DenseSidebarLayout
      sidebar={
        <Sidebar>
          <SidebarHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent">
                <span className="text-sm font-bold text-text-inverted">D</span>
              </div>
              <div className="text-sm font-semibold text-text-primary">
                {t('app.name')}
              </div>
            </div>
          </SidebarHeader>

          <SidebarBody className="[&>[data-slot=section]+[data-slot=section]]:mt-2">
            <SidebarSection>
              {mainNavigation.map((item) => (
                <SidebarItem
                  key={item.name}
                  href={item.href}
                  current={location.pathname === item.href}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </SidebarItem>
              ))}
            </SidebarSection>

            <SidebarDivider />

            <SidebarSection>
              <SectionToggle section="equipment" label={getName('equipment', true)} icon={WrenchScrewdriverIcon} collapsed={collapsed} onToggle={toggleSection} />
              {!collapsed['equipment'] && equipmentNavigation.map((item) => (
                <SidebarItem
                  key={item.name}
                  href={item.href}
                  current={location.pathname === item.href}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </SidebarItem>
              ))}
            </SidebarSection>

            <SidebarSection>
              <SectionToggle section="financial" label={t('entities.financial')} icon={CurrencyDollarIcon} collapsed={collapsed} onToggle={toggleSection} />
              {!collapsed['financial'] && financialNavigation.map((item) => (
                <SidebarItem
                  key={item.name}
                  href={item.href}
                  current={location.pathname === item.href}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </SidebarItem>
              ))}
            </SidebarSection>

            <SidebarSection>
              <SectionToggle section="scheduling" label={t('entities.scheduling')} icon={CalendarIcon} collapsed={collapsed} onToggle={toggleSection} />
              {!collapsed['scheduling'] && schedulingNavigation.map((item) => (
                <SidebarItem
                  key={item.name}
                  href={item.href}
                  current={location.pathname === item.href}
                >
                  <item.icon className="h-4 w-4" />
                  <span>{item.name}</span>
                </SidebarItem>
              ))}
            </SidebarSection>

            {adminNavigation.length > 0 && (
              <SidebarSection>
                <SectionToggle section="admin" label={t('entities.admin')} icon={ShieldCheckIcon} collapsed={collapsed} onToggle={toggleSection} />
                {!collapsed['admin'] && adminNavigation.map((item) => (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={location.pathname === item.href}
                  >
                    <item.icon className="h-4 w-4" />
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
                  <div className="text-sm font-medium text-text-primary mb-2">{t('common.theme')}</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setTheme('light')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        theme === 'light'
                          ? 'bg-accent text-text-inverted'
                          : 'bg-surface-sunken text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
                      }`}
                      aria-label="Light mode"
                    >
                      <SunIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setTheme('dark')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        theme === 'dark'
                          ? 'bg-accent text-text-inverted'
                          : 'bg-surface-sunken text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
                      }`}
                      aria-label="Dark mode"
                    >
                      <MoonIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setTheme('system')}
                      className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                        theme === 'system'
                          ? 'bg-accent text-text-inverted'
                          : 'bg-surface-sunken text-text-secondary hover:bg-surface-overlay hover:text-text-primary'
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
          {/* Breadcrumb */}
          <NavbarSection>
            <span className="text-xs text-text-tertiary">{t('app.name')}</span>
            {currentPage && (
              <>
                <span className="mx-1.5 text-xs text-text-tertiary">/</span>
                <span className="text-xs font-medium text-text-primary">{currentPage.name}</span>
              </>
            )}
          </NavbarSection>
          <NavbarSpacer />
          {/* ⌘K search stub */}
          <NavbarSection>
            <NavbarItem aria-label="Search">
              <button className="flex items-center gap-2 rounded-md border border-border-default bg-surface-sunken px-3 py-1.5 text-xs text-text-tertiary hover:bg-surface-overlay transition-colors">
                <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                <span>{t('common.search')}</span>
                {/* eslint-disable-next-line i18next/no-literal-string */}
                <span className="ml-1 font-mono text-[10px] text-text-tertiary">cmd+K</span>
              </button>
            </NavbarItem>
          </NavbarSection>
        </Navbar>
      }
    >
      {children}
      <PaletteSwitcher />
    </DenseSidebarLayout>
  );
}
