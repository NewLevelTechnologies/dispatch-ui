import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { activityApi, financialActivityApi } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Link } from '../../components/catalyst/link';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import type { ActivityTone } from '../../lib/activityGlyph';
import { buildRecentActivity } from '../../lib/locationActivityRows';

const SHOWN = 9;

const DOT: Record<ActivityTone, TimelineEntry['dot']> = {
  info: 'info',
  success: 'success',
  warning: 'warning',
  accent: '',
  neutral: 'muted',
};

/**
 * The most recent tenant-wide events: the work-order stream and the financial
 * stream merged by timestamp, through the same row models the location and
 * customer Activity tabs use, so an event reads identically everywhere. Not
 * polled, so no "Live" pill.
 */
export function ActivityCard() {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canInvoices = useHasCapability('VIEW_ALL_INVOICES');

  const business = useQuery({
    queryKey: ['home-activity', 'work-orders'],
    queryFn: () => activityApi.listForTenant({ limit: SHOWN }),
  });
  // Invoice amounts ride this stream, so it follows the invoice capability.
  const financial = useQuery({
    queryKey: ['home-activity', 'financial'],
    queryFn: () => financialActivityApi.getForTenant({ limit: SHOWN }),
    enabled: canInvoices,
  });

  const isLoading = business.isLoading || (canInvoices && financial.isLoading);
  const isError = business.isError || (canInvoices && financial.isError);

  let body;
  if (isLoading) {
    body = <LoadingState />;
  } else if (isError) {
    body = (
      <ErrorState
        title={t('dashboard.activity.error')}
        action={
          <Button
            outline
            size="xs"
            onClick={() => {
              void business.refetch();
              if (canInvoices) void financial.refetch();
            }}
          >
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  } else {
    const recent = buildRecentActivity(
      {
        events: business.data?.content ?? [],
        financial: canInvoices ? (financial.data?.content ?? []) : [],
      },
      t,
      getName,
      SHOWN,
    );
    body =
      recent.length === 0 ? (
        <EmptyState compact title={t('dashboard.activity.empty')} />
      ) : (
        <Timeline
          items={recent.map((item) => ({
            dot: DOT[item.tone],
            time: <span title={item.tsExact}>{item.ts}</span>,
            text: (
              <>
                {item.text}
                {item.obj && item.objHref && (
                  <>
                    {' · '}
                    <Link href={item.objHref} className="text-fg-accent hover:underline">
                      {item.obj}
                    </Link>
                  </>
                )}
              </>
            ),
          }))}
        />
      );
  }

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('dashboard.activity.title')}</CardTitle>
      </CardHead>
      <CardBody>{body}</CardBody>
    </Card>
  );
}
