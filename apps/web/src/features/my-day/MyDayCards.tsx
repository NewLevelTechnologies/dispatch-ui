// The sections of the technician's "My day" page. Layout and the bespoke
// marks (progress strip, route rail, focus ring) live in styles/my-day.css;
// cards, pills, tags and buttons are the shared primitives.
import { Fragment, useState } from 'react';
import clsx from 'clsx';
import {
  BriefcaseIcon,
  CalendarIcon,
  CheckIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  MapIcon,
  MapPinIcon,
  PhoneIcon,
  TruckIcon,
  WrenchIcon,
} from '@heroicons/react/24/outline';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency, titleCaseAddress } from '@dispatch/utils';
import {
  type MyDayStop,
  type QuoteListItem,
  type WorkOrder,
  type WorkOrderSummary,
  type WorkOrderType,
} from '../../api/setup';
import { Button } from '../../components/catalyst/button';
import { Link } from '../../components/catalyst/link';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Pill, Tag } from '../../components/ui/Pill';
import { WorkOrderTypePill } from '../../components/ui/WorkOrderTypePill';
import { DISPATCH_PRESENTATION, statusClass } from '../../lib/dispatchStatus';
import {
  clock,
  focusAction,
  formatDuration,
  formatEstimate,
  isLive,
  isPast,
  onSiteMinutes,
} from './myDayModel';

const woLabel = (stop: Pick<MyDayStop, 'workOrderNumber' | 'workOrderId'>) =>
  stop.workOrderNumber ?? `#${stop.workOrderId.slice(0, 8)}`;

const stopTitle = (stop: MyDayStop) => stop.workOrderSummary || woLabel(stop);

/** Only elevated priority is worth a pill. */
function PriorityPill({ priority }: { priority: MyDayStop['priority'] }) {
  const { t } = useTranslation();
  if (priority !== 'URGENT' && priority !== 'HIGH') return null;
  return (
    <Pill tone={priority === 'URGENT' ? 'danger' : 'warning'}>
      {t(`workOrders.priority.${priority.toLowerCase()}`)}
    </Pill>
  );
}

/** Universal directions link: opens the maps app on a phone, the web map on
 *  a desktop. */
function directionsUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

// ── Progress strip ───────────────────────────────────────────────────

export function ProgressStrip({
  stops,
  focus,
  timeZone,
}: {
  stops: MyDayStop[];
  focus: MyDayStop | null;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const done = stops.filter((s) => isPast(s.status)).length;
  const place = focus ? focus.customerName ?? woLabel(focus) : '';
  return (
    <div className="md-progress">
      <div className="md-progress-bar" role="img" aria-label={t('myDay.progress.aria')}>
        {stops.map((s) => (
          <span key={s.dispatchId} className={clsx('md-seg', statusClass(s.status))} />
        ))}
      </div>
      <div className="md-progress-txt">
        <span>{t('myDay.progress.done', { done, count: stops.length })}</span>
        {focus?.status === 'IN_PROGRESS' && <span>· {t('myDay.progress.onSiteAt', { place })}</span>}
        {focus?.status === 'EN_ROUTE' && <span>· {t('myDay.progress.enRouteTo', { place })}</span>}
        {focus?.status === 'SCHEDULED' && (
          <span>· {t('myDay.progress.nextAt', { time: clock(focus.arrivalWindowStart, timeZone) })}</span>
        )}
        {!focus && <span>· {t('myDay.progress.dayComplete')}</span>}
      </div>
    </div>
  );
}

// ── Focus card — the one stop to act on now ─────────────────────────

export function FocusCard({
  stop,
  workOrder,
  timeZone,
  pending,
  onAdvance,
  onComplete,
}: {
  stop: MyDayStop;
  workOrder: WorkOrder | undefined;
  timeZone: string;
  pending: boolean;
  onAdvance: (to: MyDayStop['status']) => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const live = isLive(stop.status);
  const action = focusAction(stop.status);
  const estimate = formatEstimate(stop.estimatedDuration);

  const eyebrow =
    stop.status === 'IN_PROGRESS'
      ? t('myDay.focus.onSiteSince', { time: clock(stop.arrivedAt, timeZone) ?? '' })
      : stop.status === 'EN_ROUTE'
        ? t('myDay.focus.enRoute')
        : t('myDay.focus.upNext');

  // Where and what come from the stop (as released); only who to call and the
  // equipment need the work order.
  const siteName =
    stop.serviceLocationName && stop.serviceLocationName !== stop.customerName ? stop.serviceLocationName : null;
  const street = stop.serviceLocationStreet
    ? [titleCaseAddress(stop.serviceLocationStreet), titleCaseAddress(stop.serviceLocationCity)].filter(Boolean).join(', ')
    : null;
  const fullAddress = stop.serviceLocationStreet
    ? [stop.serviceLocationStreet, stop.serviceLocationCity, stop.serviceLocationState, stop.serviceLocationZip]
        .filter(Boolean)
        .join(', ')
    : null;
  const site = workOrder?.serviceLocation;
  const contactName = site?.siteContactName || workOrder?.customer?.name || null;
  const contactPhone = site?.siteContactPhone || workOrder?.customer?.phone || null;
  const drive = stop.status === 'SCHEDULED' ? stop.driveMinFromPrev : null;

  return (
    <section className={clsx('card md-focus', live && 'live')} aria-label={t('myDay.focus.aria')}>
      <div className="md-focus-top">
        <Pill tone={live ? 'violet' : 'info'} dot live={live}>
          {eyebrow}
        </Pill>
        <div className="md-focus-tags">
          <PriorityPill priority={stop.priority} />
          <Tag>{woLabel(stop)}</Tag>
        </div>
      </div>

      <div className="md-focus-when">
        <span className="md-focus-time tnum">
          {clock(stop.arrivalWindowStart, timeZone)}
          <span className="md-focus-dash"> – </span>
          {clock(stop.arrivalWindowEnd, timeZone)}
        </span>
        {estimate && <span className="md-focus-est">{t('myDay.focus.estimate', { estimate })}</span>}
      </div>

      <h2 className="md-focus-title">{stopTitle(stop)}</h2>
      {(stop.customerName || siteName) && (
        <div className="md-focus-cust">
          {stop.customerName}
          {stop.customerName && siteName && <span className="md-dot-sep">·</span>}
          {siteName}
        </div>
      )}

      {(street || stop.serviceLocationCity) && (
        <div className="md-focus-addr">
          <MapPinIcon className="md-icon" aria-hidden="true" />
          <span>{street ?? titleCaseAddress(stop.serviceLocationCity)}</span>
          {drive != null && <span className="md-drive">{t('myDay.drive', { count: drive })}</span>}
        </div>
      )}
      {workOrder?.equip?.label && (
        <div className="md-focus-meta">
          <WrenchIcon className="md-icon" aria-hidden="true" />
          <span>{workOrder.equip.label}</span>
        </div>
      )}

      <div className="md-actions">
        {action && (
          <Button
            color="accent"
            className="md-btn-lg"
            disabled={pending}
            onClick={() => (action.kind === 'status' ? onAdvance(action.to) : onComplete())}
          >
            {t(`myDay.actions.${action.labelKey}`)}
          </Button>
        )}
        <div className="md-actions-row">
          {fullAddress && (
            <Button outline className="md-btn-md" href={directionsUrl(fullAddress)} target="_blank" rel="noreferrer">
              <MapIcon data-slot="icon" />
              {t('myDay.actions.navigate')}
            </Button>
          )}
          {contactPhone && (
            <Button outline className="md-btn-md" href={`tel:${contactPhone.replace(/[^\d+]/g, '')}`}>
              <PhoneIcon data-slot="icon" />
              {t('myDay.actions.call', { name: contactName?.split(' ')[0] ?? '' })}
            </Button>
          )}
          <Button outline className="md-btn-md" href={`/work-orders/${stop.workOrderId}`}>
            <BriefcaseIcon data-slot="icon" />
            {t('myDay.actions.open', { id: woLabel(stop) })}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── Today's route ────────────────────────────────────────────────────

export function RouteCard({
  stops,
  focusId,
  timeZone,
  types,
  expandPast,
}: {
  stops: MyDayStop[];
  focusId: string | null;
  timeZone: string;
  types: WorkOrderType[] | undefined;
  expandPast: boolean;
}) {
  const { t } = useTranslation();
  const past = stops.filter((s) => isPast(s.status));
  const rest = stops.filter((s) => !isPast(s.status));
  // Collapse only when there's something left to look at instead.
  const collapsible = past.length > 0 && rest.length > 0;
  const [showPast, setShowPast] = useState(expandPast);
  const from = clock(past[0]?.arrivedAt ?? past[0]?.arrivalWindowStart, timeZone);
  const last = past[past.length - 1];
  const to = clock(last?.departedAt ?? last?.arrivalWindowEnd, timeZone);

  return (
    <Card>
      <CardHead>
        <CardTitle icon={<TruckIcon className="size-3.5" />}>{t('myDay.route.title')}</CardTitle>
        <CardSub>{t('myDay.route.stops', { count: stops.length })}</CardSub>
      </CardHead>
      <CardBody flush className="md-route">
        {collapsible && (
          <Button plain className="md-collapse" aria-expanded={showPast} onClick={() => setShowPast((v) => !v)}>
            <ChevronRightIcon data-slot="icon" className={clsx('md-collapse-chev', showPast && 'open')} />
            {t('myDay.route.completed', { count: past.length, from, to })}
          </Button>
        )}
        {(showPast || !collapsible) &&
          past.map((s) => <StopRow key={s.dispatchId} stop={s} past timeZone={timeZone} types={types} />)}
        {rest.map((s) => (
          <StopRow key={s.dispatchId} stop={s} current={s.dispatchId === focusId} timeZone={timeZone} types={types} />
        ))}
      </CardBody>
    </Card>
  );
}

function StopRow({
  stop,
  past = false,
  current = false,
  timeZone,
  types,
}: {
  stop: MyDayStop;
  past?: boolean;
  current?: boolean;
  timeZone: string;
  types: WorkOrderType[] | undefined;
}) {
  const { t } = useTranslation();
  const type = types?.find((tp) => tp.id === stop.workOrderTypeId);
  const arrived = clock(stop.arrivedAt, timeZone);
  const departed = clock(stop.departedAt, timeZone);
  const sub =
    stop.status === 'NO_SHOW'
      ? t('myDay.route.noShow')
      : past
        ? arrived && departed
          ? `${arrived}–${departed}`
          : null
        : formatEstimate(stop.estimatedDuration);
  const place = [stop.serviceLocationName || stop.customerName, titleCaseAddress(stop.serviceLocationCity)]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link
      href={`/work-orders/${stop.workOrderId}`}
      className={clsx('md-stop', past && 'past', current && 'current')}
      aria-current={current ? 'step' : undefined}
    >
      <div className="md-stop-time">
        <span className="tnum">{clock(stop.arrivalWindowStart, timeZone)}</span>
        {sub && <span className="md-stop-est">{sub}</span>}
      </div>
      <div className="md-rail">
        <span className={clsx('md-rail-dot', statusClass(stop.status))}>
          {stop.status === 'COMPLETED' && <CheckIcon className="size-2.5" strokeWidth={3} />}
        </span>
      </div>
      <div className="md-stop-body">
        {!past && stop.driveMinFromPrev != null && (
          <div className="md-stop-drive">{t('myDay.drive', { count: stop.driveMinFromPrev })}</div>
        )}
        <div className="md-stop-title">
          <span>{stopTitle(stop)}</span>
          {current && isLive(stop.status) && (
            <span className="md-now">
              {stop.status === 'IN_PROGRESS' ? t('myDay.route.onSite') : t('myDay.focus.enRoute')}
            </span>
          )}
        </div>
        {place && <div className="md-stop-sub">{place}</div>}
        <div className="md-stop-chips">
          <Tag>{woLabel(stop)}</Tag>
          {type && <WorkOrderTypePill type={type} />}
          {!past && <PriorityPill priority={stop.priority} />}
          {stop.recurring && <span className="md-chip">{t('myDay.route.agreement')}</span>}
          {stop.status === 'NO_SHOW' && (
            <Pill tone={DISPATCH_PRESENTATION.NO_SHOW.tone}>{t('workOrders.dispatches.status.NO_SHOW')}</Pill>
          )}
        </div>
      </div>
      <span className="md-stop-right" aria-hidden="true">
        {past ? <CheckIcon className="size-3.5" /> : <ChevronRightIcon className="size-3.5" />}
      </span>
    </Link>
  );
}

// ── Side column ──────────────────────────────────────────────────────

export function UnfinishedCard({
  awaitingParts,
  quotes,
}: {
  awaitingParts: WorkOrderSummary[];
  quotes: QuoteListItem[];
}) {
  const { t } = useTranslation();
  const total = awaitingParts.length + quotes.length;
  if (total === 0) return null;
  const sentDay = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : null;

  return (
    <Card>
      <CardHead>
        <CardTitle icon={<ExclamationTriangleIcon className="size-3.5" />}>{t('myDay.unfinished.title')}</CardTitle>
        <Pill>{total}</Pill>
      </CardHead>
      <CardBody flush>
        {awaitingParts.map((wo) => (
          <CarryRow
            key={wo.id}
            id={wo.workOrderNumber ?? `#${wo.id.slice(0, 8)}`}
            title={[wo.summary, wo.customer?.name].filter(Boolean).join(' — ')}
            meta={t('myDay.unfinished.awaitingParts')}
            href={`/work-orders/${wo.id}`}
          />
        ))}
        {quotes.map((q) => (
          <CarryRow
            key={q.id}
            id={q.quoteNumber}
            title={q.title || t('myDay.unfinished.quoteAwaiting', { quote: q.quoteNumber })}
            meta={[
              sentDay(q.lastSentAt) && t('myDay.unfinished.sent', { date: sentDay(q.lastSentAt) }),
              q.customerName,
              formatCurrency(q.totalAmount),
            ]
              .filter(Boolean)
              .join(' · ')}
            href={`/quotes/${q.id}`}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function CarryRow({ id, title, meta, href }: { id: string; title: string; meta: string; href: string }) {
  const { t } = useTranslation();
  return (
    <div className="md-carry">
      <span className="md-carry-dot" />
      <div className="md-carry-body">
        <div className="md-carry-title">
          <Tag className="mr-1.5">{id}</Tag>
          {title}
        </div>
        <div className="md-carry-meta">{meta}</div>
      </div>
      <Button plain size="xxs" href={href}>
        {t('myDay.unfinished.view')}
      </Button>
    </div>
  );
}

export function TomorrowLink({
  stops,
  href,
  timeZone,
}: {
  stops: MyDayStop[];
  href: string;
  timeZone: string;
}) {
  const { t } = useTranslation();
  const first = stops[0];
  return (
    <Link href={href} className="md-tomorrow">
      <CalendarIcon className="md-icon" aria-hidden="true" />
      <div className="grow">
        <div className="md-tomorrow-t">
          {stops.length ? t('myDay.tomorrow.title', { count: stops.length }) : t('myDay.tomorrow.titleEmpty')}
        </div>
        <div className="md-tomorrow-s">
          {first
            ? t('myDay.tomorrow.first', {
                time: clock(first.arrivalWindowStart, timeZone),
                place: first.customerName ?? woLabel(first),
              })
            : t('myDay.tomorrow.none')}
        </div>
      </div>
      <ChevronRightIcon className="md-icon" aria-hidden="true" />
    </Link>
  );
}

// ── Edge states ──────────────────────────────────────────────────────

export function DayDone({ stops }: { stops: MyDayStop[] }) {
  const { t } = useTranslation();
  const done = stops.filter((s) => s.status === 'COMPLETED').length;
  const noShows = stops.filter((s) => s.status === 'NO_SHOW').length;
  const minutes = onSiteMinutes(stops);
  const parts = [
    t('myDay.dayDone.summary', { done, total: stops.length }),
    noShows ? t('myDay.dayDone.noShows', { count: noShows }) : null,
    minutes ? t('myDay.dayDone.onSite', { duration: formatDuration(minutes) }) : null,
  ].filter(Boolean);
  return (
    <div className="md-quiet" role="status">
      <div className="md-quiet-check">
        <CheckIcon className="size-4" strokeWidth={2.5} />
      </div>
      <div>
        <div className="md-quiet-t">{t('myDay.dayDone.title')}</div>
        <div className="md-quiet-s">
          {parts.map((p, i) => (
            <Fragment key={i}>
              {i > 0 && ' · '}
              {p}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export function NoStops({ dispatchPhone }: { dispatchPhone: string | null | undefined }) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardBody flush>
        <EmptyState
          icon={<CalendarIcon className="size-10 text-fg-dim" />}
          title={t('myDay.noStops.title')}
          description={t('myDay.noStops.description')}
          action={
            dispatchPhone ? (
              <Button outline href={`tel:${dispatchPhone.replace(/[^\d+]/g, '')}`}>
                <PhoneIcon data-slot="icon" />
                {t('myDay.actions.callDispatch')}
              </Button>
            ) : undefined
          }
        />
      </CardBody>
    </Card>
  );
}
