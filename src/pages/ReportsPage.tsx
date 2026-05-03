import { useMemo } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppLayout from '../components/AppLayout';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import { Badge } from '../components/catalyst/badge';
import { reports, type ReportDefinition } from '../reports/registry';

export default function ReportsPage() {
  const { t } = useTranslation();

  // Group reports by category so the hub stays organized as the catalog grows.
  // Reports without a category fall into a synthetic "Other" bucket.
  const grouped = useMemo(() => {
    const buckets = new Map<string, ReportDefinition[]>();
    for (const r of reports) {
      const key = r.category || t('reports.uncategorized');
      const existing = buckets.get(key) ?? [];
      existing.push(r);
      buckets.set(key, existing);
    }
    return Array.from(buckets.entries());
  }, [t]);

  return (
    <AppLayout>
      <div className="p-4">
        <Heading>{t('reports.title')}</Heading>
        <Text className="mt-1 text-zinc-600 dark:text-zinc-400">
          {t('reports.description')}
        </Text>

        {reports.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
            <Text className="text-zinc-500 dark:text-zinc-400">{t('reports.empty')}</Text>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {grouped.map(([category, categoryReports]) => (
              <section key={category}>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {category}
                </h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {categoryReports.map((report) => (
                    <RouterLink
                      key={report.slug}
                      to={`/reports/${report.slug}`}
                      className="block rounded-lg border border-zinc-200 p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-zinc-950 dark:text-white">
                          {report.title}
                        </span>
                        {report.category && (
                          <Badge color="zinc" className="shrink-0 text-xs">
                            {report.category}
                          </Badge>
                        )}
                      </div>
                      <Text className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {report.description}
                      </Text>
                    </RouterLink>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
