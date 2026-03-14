import { useAuthenticator } from '@aws-amplify/ui-react';
import { useLocation } from 'react-router-dom';
import {
  HomeIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  WrenchScrewdriverIcon,
  CurrencyDollarIcon,
  CalendarIcon,
} from '@heroicons/react/24/outline';
import { Sidebar, SidebarBody, SidebarFooter, SidebarHeader, SidebarItem, SidebarSection } from './catalyst/sidebar';
import { SidebarLayout } from './catalyst/sidebar-layout';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from './catalyst/navbar';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './catalyst/dropdown';
import { Avatar } from './catalyst/avatar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
    { name: 'Customers', href: '/customers', icon: UserGroupIcon },
    { name: 'Work Orders', href: '/work-orders', icon: ClipboardDocumentListIcon },
    { name: 'Equipment', href: '/equipment', icon: WrenchScrewdriverIcon },
    { name: 'Financial', href: '/financial', icon: CurrencyDollarIcon },
    { name: 'Scheduling', href: '/scheduling', icon: CalendarIcon },
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
                Dispatch
              </div>
            </div>
          </SidebarHeader>

          <SidebarBody>
            <SidebarSection>
              {navigation.map((item) => (
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
                <DropdownItem onClick={() => signOut()}>
                  <DropdownLabel>Sign out</DropdownLabel>
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
