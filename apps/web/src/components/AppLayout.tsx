import { Fragment } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  HomeIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
  TruckIcon,
  ShoppingCartIcon,
  CalendarIcon,
  Cog6ToothIcon,
  SunIcon,
  MoonIcon,
  DocumentTextIcon,
  DocumentChartBarIcon,
  CreditCardIcon,
  CubeIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  ClockIcon,
  ArrowPathIcon,
  MapPinIcon,
  EllipsisHorizontalIcon,
  LifebuoyIcon,
  ArrowRightStartOnRectangleIcon,
  BellIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import { approvalsApi, type ApprovalsBellSummary } from '../api/setup';
import { Sidebar, SidebarBody, SidebarFooter, SidebarHeader, SidebarHeading, SidebarItem, SidebarSection } from './catalyst/sidebar';
import { SidebarLayout } from './catalyst/sidebar-layout';
import { Navbar } from './catalyst/navbar';
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import WorkspaceBrand from './workspace/WorkspaceBrand';
import { useTheme } from './ThemeProvider';
import { ToggleGroup, ToggleGroupOption } from './ui/ToggleGroup';
import { useCurrentUser, useHasAnyCapability } from '../hooks/useCurrentUser';
import { useApprovalsVisible } from '../hooks/useApprovalsVisible';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { roleColor } from '@dispatch/utils';
import ApprovalsBellPopover from './ApprovalsBellPopover';

const ENV_BADGE: Record<string, { label: string; className: string }> = {
  development: { label: 'DEV', className: 'bg-warning-500/20 text-warning-500 ring-warning-500/30' },
  qa: { label: 'QA', className: 'bg-info-500/20 text-info-500 ring-info-500/30' },
  staging: { label: 'STG', className: 'bg-violet-500/20 text-violet-500 ring-violet-500/30' },
};

export default function AppLayout({ children, flush }: { children: React.ReactNode; flush?: boolean }) {
  const { user, signOut, authStatus } = useAuthenticator((context) => [context.user, context.authStatus]);
  const location = useLocation();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const { mode, accent, setMode, setAccent } = useTheme();
  const { data: currentUser } = useCurrentUser();

  // Sidebar identity row: show full name + primary role once /me resolves.
  // Falls back to the Cognito loginId so first paint never shows a blank slot.
  const loginEmail = user?.signInDetails?.loginId ?? '';
  const fullName = currentUser
    ? `${currentUser.firstName} ${currentUser.lastName}`.trim()
    : loginEmail;
  const primaryRole = currentUser?.roles?.[0]?.name;
  const avatarKey = fullName || loginEmail || 'U';
  const avatarBg = roleColor(avatarKey);
  const avatarInitials = (() => {
    if (currentUser?.firstName || currentUser?.lastName) {
      return `${currentUser.firstName?.[0] ?? ''}${currentUser.lastName?.[0] ?? ''}`.toUpperCase() || 'U';
    }
    return loginEmail.charAt(0).toUpperCase() || 'U';
  })();

  // Permission checks for navigation visibility
  const canViewSettings = useHasAnyCapability('VIEW_SETTINGS');

  const approvalsVisible = useApprovalsVisible();

  // Bell summary: pending-for-me (approver workload) + recently-resolved-
  // mine (24h server window, requester side). Drives both the sidebar
  // nav badge (pending-for-me only) and the topbar bell badge
  // (pendingForMe + recentlyResolvedMine — the union of "anything for
  // me to look at").
  //
  // Polls every 5 minutes — approvals are low-frequency, no reason to
  // hammer the endpoint. `refetchIntervalInBackground: false` pauses
  // polling when the tab is hidden; `refetchOnWindowFocus` picks up
  // the moment the user returns. Gated on `approvalsVisible` so
  // OPEN-mode tenants with no history don't generate background traffic.
  const { data: bellSummary } = useQuery<ApprovalsBellSummary>({
    queryKey: ['approvals', 'bell-summary'],
    queryFn: () => approvalsApi.getBellSummary(),
    enabled: authStatus === 'authenticated' && approvalsVisible,
    refetchInterval: 5 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const pendingApprovalCount = bellSummary?.pendingForMe ?? 0;
  const recentlyResolvedMine = bellSummary?.recentlyResolvedMine ?? 0;
  const bellBadgeCount = pendingApprovalCount + recentlyResolvedMine;

  // Desktop gets the peek-and-resume bell popover; mobile keeps the
  // page-takeover behavior (the full inbox is already single-column
  // and back-friendly on small viewports, so a popover would be more
  // friction, not less).
  const isDesktop = useMediaQuery('(min-width: 768px)');

  const envKey = (import.meta.env.VITE_ENV || '').toLowerCase();
  const envBadge = ENV_BADGE[envKey];

  const isCurrent = (href: string) =>
    href === '/dashboard' ? location.pathname === href : location.pathname.startsWith(href);

  type MainNavItem = { name: string; href: string; icon: typeof HomeIcon; badge?: number };
  const mainNavigation: MainNavItem[] = [
    { name: t('entities.dashboard'), href: '/dashboard', icon: HomeIcon },
    { name: getName('customer', true), href: '/customers', icon: UserGroupIcon },
    { name: getName('service_location', true), href: '/service-locations', icon: MapPinIcon },
    { name: getName('work_order', true), href: '/work-orders', icon: ClipboardDocumentListIcon },
    ...(approvalsVisible
      ? [{ name: t('approvals.title'), href: '/approvals', icon: CheckBadgeIcon, badge: pendingApprovalCount }]
      : []),
  ];

  const equipmentNavigation = [
    { name: getName('equipment', true), href: '/equipment', icon: WrenchScrewdriverIcon },
    { name: t('equipment.entities.parts'), href: '/parts-inventory', icon: CubeIcon },
    { name: t('equipment.entities.warehouses'), href: '/warehouses', icon: BuildingStorefrontIcon },
    { name: t('entities.vendors'), href: '/vendors', icon: TruckIcon },
    { name: t('entities.purchasing'), href: '/purchasing', icon: ShoppingCartIcon },
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
    // Reports lives here as a role-restricted utility surface (alongside
    // Settings). Not gated yet — when we wire capability checks, gate on
    // "user has access to at least one report" via the registry's
    // requiresCapability fields.
    { name: t('reports.title'), href: '/reports', icon: ChartBarIcon },
    ...(canViewSettings ? [{ name: t('entities.settings'), href: '/settings', icon: Cog6ToothIcon }] : []),
  ];

  // Breadcrumbs: walk the nav groups to find which one the current route belongs
  // to, then surface "Section / Page" in the topbar. mainNavigation and
  // adminNavigation have no section heading, so those routes show just the page.
  const navGroups: { section?: string; items: { name: string; href: string }[] }[] = [
    { items: mainNavigation },
    { section: t('entities.inventory'), items: equipmentNavigation },
    { section: t('entities.financial'), items: financialNavigation },
    { section: t('entities.scheduling'), items: schedulingNavigation },
    { items: adminNavigation },
  ];
  const activeGroup = navGroups.find((g) => g.items.some((i) => isCurrent(i.href)));
  const activeItem = activeGroup?.items.find((i) => isCurrent(i.href));
  const breadcrumbs: string[] = [];
  if (activeGroup?.section) breadcrumbs.push(activeGroup.section);
  if (activeItem) breadcrumbs.push(activeItem.name);

  return (
    <SidebarLayout
      flush={flush}
      sidebar={
        <Sidebar>
          <SidebarHeader>
            {/* The brand block is now the workspace: it already answers "where
                am I", and the active workspace lives here and nowhere else. It
                becomes a switcher only when there is more than one. */}
            <WorkspaceBrand envBadge={envBadge} />
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
                  >
                    <item.icon data-slot="icon" />
                    <span>{item.name}</span>
                    {item.badge != null && item.badge > 0 && (
                      <span
                        aria-label={t('approvals.nav.pendingCount', { count: item.badge })}
                        className="ml-auto inline-flex h-[18px] min-w-[20px] items-center justify-center rounded-full bg-accent-500 px-1.5 font-mono text-[10px] font-semibold text-white"
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </SidebarItem>
                );
              })}
            </SidebarSection>

            <SidebarSection>
              <SidebarHeading>{t('entities.inventory')}</SidebarHeading>
              {equipmentNavigation.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={current}
                  >
                    <item.icon data-slot="icon" />
                    <span>{item.name}</span>
                  </SidebarItem>
                );
              })}
            </SidebarSection>

            <SidebarSection>
              <SidebarHeading>{t('entities.financial')}</SidebarHeading>
              {financialNavigation.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={current}
                  >
                    <item.icon data-slot="icon" />
                    <span>{item.name}</span>
                  </SidebarItem>
                );
              })}
            </SidebarSection>

            <SidebarSection>
              <SidebarHeading>{t('entities.scheduling')}</SidebarHeading>
              {schedulingNavigation.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <SidebarItem
                    key={item.name}
                    href={item.href}
                    current={current}
                  >
                    <item.icon data-slot="icon" />
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
                    >
                      <item.icon data-slot="icon" />
                      <span>{item.name}</span>
                    </SidebarItem>
                  );
                })}
              </SidebarSection>
            )}
          </SidebarBody>

          <SidebarFooter>
            <Dropdown>
              <DropdownButton
                as="button"
                className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sidebar-fg hover:bg-sidebar-bg-2 focus:outline-none data-active:bg-sidebar-bg-2"
                aria-label={t('account.menu')}
              >
                <span className="relative grid size-[30px] shrink-0 place-items-center" aria-hidden="true">
                  {currentUser?.photoUrl ? (
                    <img
                      src={currentUser.photoUrl}
                      alt=""
                      className="size-[30px] rounded-full object-cover ring-1 ring-sidebar-bg-2"
                    />
                  ) : (
                    <span
                      className="grid size-[30px] place-items-center rounded-full text-[11px] font-semibold text-white"
                      style={{
                        background: avatarBg,
                        border: `1px solid color-mix(in oklch, ${avatarBg} 70%, black)`,
                      }}
                    >
                      {avatarInitials}
                    </span>
                  )}
                  <span
                    className="absolute right-0 bottom-0 size-2 rounded-full ring-2 ring-sidebar-bg"
                    style={{ background: 'oklch(70% 0.18 145)' }}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[12px] font-semibold text-white">
                    {fullName || loginEmail}
                  </span>
                  {primaryRole && (
                    <span className="truncate text-[10.5px] text-sidebar-fg-dim">
                      {primaryRole}
                    </span>
                  )}
                </span>
                <EllipsisHorizontalIcon className="size-4 shrink-0 text-sidebar-fg-dim" />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="top start">
                <div className="px-3 py-2">
                  <div className="mb-2 text-sm font-medium text-fg-strong">{t('common.theme')}</div>
                  <ToggleGroup value={mode} onChange={setMode} aria-label={t('common.theme')} className="w-full">
                    <ToggleGroupOption value="light" aria-label="Light mode" className="flex-1 justify-center">
                      <SunIcon className="h-4 w-4" />
                    </ToggleGroupOption>
                    <ToggleGroupOption value="dark" aria-label="Dark mode" className="flex-1 justify-center">
                      <MoonIcon className="h-4 w-4" />
                    </ToggleGroupOption>
                  </ToggleGroup>
                  <div className="mt-3 mb-2 text-sm font-medium text-fg-strong">{t('common.themeAccent')}</div>
                  <ToggleGroup value={accent} onChange={setAccent} aria-label={t('common.themeAccent')} className="w-full">
                    <ToggleGroupOption
                      value="warm"
                      aria-label={t('common.themeAccentWarm')}
                      title={t('common.themeAccentWarm')}
                      className="flex-1 justify-center"
                    >
                      <span
                        className="size-4 rounded-full ring-1 ring-black/10"
                        style={{ background: 'oklch(68% 0.185 50)' }}
                      />
                    </ToggleGroupOption>
                    <ToggleGroupOption
                      value="cool"
                      aria-label={t('common.themeAccentCool')}
                      title={t('common.themeAccentCool')}
                      className="flex-1 justify-center"
                    >
                      <span
                        className="size-4 rounded-full ring-1 ring-black/10"
                        style={{ background: 'oklch(56% 0.125 215)' }}
                      />
                    </ToggleGroupOption>
                  </ToggleGroup>
                </div>
                <DropdownDivider />
                <DropdownItem href="/account/settings">
                  <Cog6ToothIcon data-slot="icon" />
                  <DropdownLabel>{t('account.settings')}</DropdownLabel>
                </DropdownItem>
                <DropdownItem onClick={() => { /* Help & Support — placeholder until docs/widget ships */ }}>
                  <LifebuoyIcon data-slot="icon" />
                  <DropdownLabel>{t('common.helpSupport')}</DropdownLabel>
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem
                  onClick={() => signOut()}
                  className="text-danger-500 data-focus:bg-danger-500/10 data-focus:text-danger-500 *:data-[slot=icon]:text-danger-500 data-focus:*:data-[slot=icon]:text-danger-500"
                >
                  <ArrowRightStartOnRectangleIcon data-slot="icon" />
                  <DropdownLabel>{t('common.signOut')}</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </SidebarFooter>
        </Sidebar>
      }
      navbar={
        <Navbar>
          {breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1.5 text-[12.5px] text-fg-muted">
              {breadcrumbs.map((c, i) => (
                <Fragment key={i}>
                  <span className={i === breadcrumbs.length - 1 ? 'font-semibold text-fg-strong' : ''}>
                    {c}
                  </span>
                  {i < breadcrumbs.length - 1 && <span className="text-fg-dim opacity-60">/</span>}
                </Fragment>
              ))}
            </div>
          )}
          <div className="mx-auto flex h-[30px] w-full max-w-[380px] items-center gap-2 rounded-md border border-border bg-bg-sunken px-2.5 text-[12.5px] text-fg-muted">
            <span className="text-fg-dim">{t('common.search')}</span>
            <span aria-hidden className="ml-auto rounded border border-border bg-bg px-1.5 py-px font-mono text-[10px]">{'⌘K'}</span>
          </div>
          {approvalsVisible && (
            isDesktop ? (
              <ApprovalsBellPopover badgeCount={bellBadgeCount} />
            ) : (
              <Link
                to="/approvals?tab=pending"
                aria-label={t('approvals.nav.bellAria', { count: bellBadgeCount })}
                className="relative grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <BellIcon className="size-[18px]" />
                {bellBadgeCount > 0 && (
                  <span
                    aria-hidden
                    className="absolute -top-px -right-px inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full border-2 border-bg bg-accent-500 px-[3px] font-mono text-[9.5px] font-bold leading-none text-white"
                  >
                    {bellBadgeCount > 99 ? '99+' : bellBadgeCount}
                  </span>
                )}
              </Link>
            )
          )}
        </Navbar>
      }
    >
      {children}
    </SidebarLayout>
  );
}
