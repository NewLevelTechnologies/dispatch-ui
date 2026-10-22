import { useQuery } from '@tanstack/react-query';
import {
  CalendarIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CubeIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@dispatch/i18n';
import { activityApi, financialActivityApi } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Link } from '../../components/catalyst/link';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { Avatar } from '../../components/ui/Avatar';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorState } from '../../components/ui/ErrorState';
import { EmptyState } from '../../components/ui/EmptyState';
import { buildRecentActivity, type RecentActivityItem } from '../../lib/locationActivityRows';
import { verbSentence } from './activitySentence';

const SHOWN = 9;

/** The glyph in a non-staff row's circle, by what the event is about. */
function systemGlyph(kind: string) {
  if (kind.startsWith('QUOTE_')) return ClipboardDocumentListIcon;
  if (kind.startsWith('INVOICE_') || kind.startsWith('PAYMENT_')) return CreditCardIcon;
  if (kind.startsWith('DISPATCH_')) return CalendarIcon;
  if (kind.startsWith('PO_')) return CubeIcon;
  return Cog6ToothIcon;
}

/**
 * The row's sentence. A person who acted leads it, verb first: "Marcus Bell
 * completed WO-3901 · No cooling". The system is never named, so its rows
 * lead with the object instead: "WO-3888 · Rescheduled to Thu 8–10a". The
 * object is the link; the name never is.
 */
function ActivityText({ item, named }: { item: RecentActivityItem; named: boolean }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const link = (label: string) =>
    item.objHref ? (
      <Link href={item.objHref} className="text-fg-accent hover:underline">
        {label}
      </Link>
    ) : (
      label
    );
  const detail = item.objDetail ? ` · ${item.objDetail}` : '';

  if (named) {
    const verb = item.objLabel ? verbSentence(item.event, item.stream, item.actor, t, getName) : null;
    if (verb && item.objLabel) {
      return (
        <>
          <strong>{item.actor}</strong> {verb.before}
          {link(item.objLabel)}
          {verb.after}
          {detail}
        </>
      );
    }
    // No verb template for this kind: name, then the event as the tabs say it.
    return (
      <>
        <strong>{item.actor}</strong>
        {' · '}
        {item.text}
        {item.obj && (
          <>
            {' · '}
            {link(item.obj)}
          </>
        )}
      </>
    );
  }

  if (!item.objLabel) return <>{item.text}</>;
  return (
    <>
      {link(item.objLabel)}
      {' · '}
      {item.text}
      {detail}
    </>
  );
}

/** Today reads as a clock time ("10:12"); anything older as the usual
 *  relative / dated timestamp. */
function rowTime(item: RecentActivityItem): string {
  const at = new Date(item.at);
  if (Number.isNaN(at.getTime()) || at.toDateString() !== new Date().toDateString()) return item.ts;
  return at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '');
}

/**
 * The most recent events in scope: the work-order stream and the financial
 * stream merged by timestamp, through the same row models the location and
 * customer Activity tabs use, so an event reads identically everywhere. Not
 * polled, so no "Live" pill.
 */
export function ActivityCard({ regionIds }: { regionIds: string[] | undefined }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const canInvoices = useHasCapability('VIEW_ALL_INVOICES');

  const business = useQuery({
    queryKey: ['home-activity', 'work-orders', regionIds],
    queryFn: () => activityApi.listForTenant({ limit: SHOWN, regionIds }),
  });
  // Invoice amounts ride this stream, so it follows the invoice capability. The
  // home card keeps to invoices sent and paid; quote steps and individual
  // payments live on the location, customer and job feeds.
  const financial = useQuery({
    queryKey: ['home-activity', 'financial', regionIds],
    queryFn: () => financialActivityApi.getForTenant({ limit: SHOWN, regionIds, kinds: ['INVOICE_SENT', 'INVOICE_PAID'] }),
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
        <div className="home-act-list">
          {recent.map((item) => {
            const Glyph = systemGlyph(item.kind);
            // A customer with no name on record is just the glossary word —
            // the sentence already says who, so don't prefix it.
            const named =
              item.actorType === 'staff' || (item.actorType === 'customer' && item.actor !== getName('customer'));
            return (
              <div className="home-act" key={item.id}>
                {/* An avatar means staff. Customers are named in the text;
                    the system gets a glyph and is never named. */}
                {item.actorType === 'staff' ? (
                  <Avatar name={item.actor} size="sm" />
                ) : (
                  <span className="home-act-sys" aria-hidden="true">
                    <Glyph className="size-3" />
                  </span>
                )}
                <div className="home-act-text">
                  <ActivityText item={item} named={named} />
                </div>
                <div className="home-act-time" title={item.tsExact}>
                  {rowTime(item)}
                </div>
              </div>
            );
          })}
        </div>
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
