import { Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppLayout from '../components/AppLayout';
import { Text } from '../components/catalyst/text';
import { Button } from '../components/catalyst/button';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { findReport } from '../reports/registry';

/**
 * Resolves /reports/:slug → the matching report component from the registry.
 * Wraps the component in Suspense for the lazy-loaded module boundary.
 * Renders a not-found surface when the slug is unknown.
 */
export default function ReportDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const report = findReport(slug);

  if (!report) {
    return (
      <AppLayout>
        <div className="p-8">
          <div className="rounded-lg bg-red-50 p-4 ring-1 ring-red-200 dark:bg-red-950/10 dark:ring-red-900/20">
            <Text className="text-red-800 dark:text-red-400">
              {t('reports.notFound')}
            </Text>
          </div>
          <Button className="mt-4" onClick={() => navigate('/reports')}>
            <ArrowLeftIcon className="size-4" />
            {t('reports.backToReports')}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const { Component } = report;
  return (
    <AppLayout>
      <Suspense
        fallback={
          <div className="p-8 text-center">
            <Text>{t('reports.loading')}</Text>
          </div>
        }
      >
        <Component />
      </Suspense>
    </AppLayout>
  );
}
