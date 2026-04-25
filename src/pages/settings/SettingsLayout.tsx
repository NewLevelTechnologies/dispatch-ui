import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../../contexts/GlossaryContext';
import AppLayout from '../../components/AppLayout';
import { Heading } from '../../components/catalyst/heading';

interface NavItem {
  label: string;
  to: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

export default function SettingsLayout() {
  const { t } = useTranslation();
  const { getName } = useGlossary();

  const sections: NavSection[] = [
    {
      label: t('settings.sections.organization'),
      items: [
        { label: t('settings.nav.general'), to: '/settings/general' },
        { label: t('settings.nav.terminology'), to: '/settings/terminology' },
        { label: t('settings.nav.notificationTemplates'), to: '/settings/notification-templates' },
      ],
    },
    {
      label: t('settings.sections.dispatch', { dispatch: getName('dispatch') }),
      items: [
        { label: `${getName('dispatch')} ${t('entities.regions')}`, to: '/settings/dispatch-regions' },
      ],
    },
    {
      label: t('settings.sections.workOrders', { workOrders: getName('work_order', true) }),
      items: [
        { label: t('settings.nav.types'), to: '/settings/work-orders/types' },
        { label: getName('division', true), to: '/settings/work-orders/divisions' },
        { label: t('settings.nav.itemStatuses'), to: '/settings/work-orders/item-statuses' },
        { label: t('settings.nav.statusWorkflows'), to: '/settings/work-orders/status-workflows' },
        { label: t('settings.nav.workflowConfig'), to: '/settings/work-orders/workflow-config' },
      ],
    },
    {
      label: t('settings.sections.access'),
      items: [
        { label: getName('role', true), to: '/settings/access/roles' },
      ],
    },
  ];

  return (
    <AppLayout>
      <div className="pb-2">
        <Heading>{t('entities.settings')}</Heading>
      </div>
      <div className="flex gap-8 pb-8">
        <aside className="w-56 shrink-0">
          <nav className="space-y-6">
            {sections.map((section) => (
              <div key={section.label}>
                <div className="px-3 mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {section.label}
                </div>
                <ul className="space-y-0.5">
                  {section.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          [
                            'block rounded-md px-3 py-1.5 text-sm transition-colors',
                            isActive
                              ? 'bg-zinc-100 text-zinc-900 font-medium dark:bg-zinc-800 dark:text-white'
                              : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-white',
                          ].join(' ')
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </AppLayout>
  );
}
