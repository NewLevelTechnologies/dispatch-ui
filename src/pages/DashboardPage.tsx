import { useTranslation } from 'react-i18next';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';

export default function DashboardPage() {
  const { t } = useTranslation();

  return (
    <AppLayout>
      <Heading>{t('entities.dashboard')}</Heading>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        {t('dashboard.welcome')}
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg bg-white p-6 shadow ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-base font-medium text-zinc-900 dark:text-white">
            {t('entities.customers')}
          </h3>
          <p className="mt-2 text-3xl font-semibold" style={{ color: 'var(--color-primary-600)' }}>
            --
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t('dashboard.stats.totalCustomers')}
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-base font-medium text-zinc-900 dark:text-white">
            {t('entities.workOrders')}
          </h3>
          <p className="mt-2 text-3xl font-semibold" style={{ color: 'var(--color-primary-600)' }}>
            --
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t('dashboard.stats.activeWorkOrders')}
          </p>
        </div>

        <div className="rounded-lg bg-white p-6 shadow ring-1 ring-zinc-950/5 dark:bg-zinc-900 dark:ring-white/10">
          <h3 className="text-base font-medium text-zinc-900 dark:text-white">
            {t('entities.revenue')}
          </h3>
          <p className="mt-2 text-3xl font-semibold" style={{ color: 'var(--color-primary-600)' }}>
            --
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {t('dashboard.stats.thisMonth')}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
