// ─────────────────────────────────────────────────────────────────────
// "My day" — the technician's landing (/my-day). Answers three questions
// in order:
//   1. What am I doing right now / next?        → focus card
//   2. What does the rest of the day look like? → route timeline
//   3. What's hanging over me?                  → unfinished + tomorrow
//
// Phone-first: one column, 44 px primary target. ≥900 px: two columns in
// the standard shell. Spec: claude_designs/technician-my-day.md.
// ─────────────────────────────────────────────────────────────────────
import { useMemo, useRef, type TouchEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { Button } from '../components/catalyst/button';
import { Heading } from '../components/catalyst/heading';
import { Text } from '../components/catalyst/text';
import AppLayout from '../components/AppLayout';
import { Callout } from '../components/ui/Callout';
import { LoadingState } from '../components/ui/LoadingState';
import { tenantSettingsApi, workOrderTypesApi } from '../api/setup';
import { useTenantTimeZone } from '../hooks/useTenantTimeZone';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { extractApiError } from '../lib/toast';
import { greetingPart } from '../features/home/opsSelectors';
import {
  BackToToday,
  DayDone,
  DayStepper,
  OtherDayRoute,
  FocusCard,
  NoStops,
  ProgressStrip,
  RouteCard,
  TomorrowLink,
  UnfinishedCard,
} from '../features/my-day/MyDayCards';
import { DAY_KEYS, DAY_RANGE, clock, dayName, pickFocus, showTomorrow, swipeStep } from '../features/my-day/myDayModel';
import { useUrlTab } from '../hooks/useUrlTab';
import { shiftDay } from '../lib/boardMove';
import {
  useAdvanceDispatch,
  useCarryover,
  useFocusWorkOrder,
  useDayAt,
  useMyDayStops,
} from '../features/my-day/useMyDay';

const shiftedDate = (today: string | undefined, offset: number) => (today ? shiftDay(today, offset) : undefined);

export default function MyDayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  // The server resolves "today" in the tenant's zone and says which day and
  // zone it used; until it answers, the tenant setting stands in.
  const fallbackZone = useTenantTimeZone();
  const day = useMyDayStops();
  const today = day.data?.date;
  const timeZone = day.data?.timeZone ?? fallbackZone;
  const next = useDayAt(today, 1);
  const tomorrow = next.data?.date;
  const stops = day.stops;

  // ‹ Today › — the day in view, as ?day=±N so refresh and Back keep it.
  const [dayKey, setDayKey] = useUrlTab(DAY_KEYS, '0', 'day');
  const offset = Number(dayKey);
  const step = (to: number) => setDayKey(String(Math.max(-DAY_RANGE, Math.min(DAY_RANGE, to))));
  // Tomorrow is already loaded for its card; any other day loads on demand.
  const other = useDayAt(today, offset);
  const viewed = offset === 1 ? next : other;
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: TouchEvent) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    const by = swipeStep(dx);
    if (by) step(offset + by);
  };
  const focus = pickFocus(stops);
  const { data: focusWorkOrder } = useFocusWorkOrder(focus?.workOrderId);

  const onRoute = useMemo(() => new Set(stops.map((s) => s.workOrderId)), [stops]);
  const carryover = useCarryover(user?.id, onRoute);
  const advance = useAdvanceDispatch();

  const { data: types } = useQuery({
    queryKey: ['work-order-types'],
    queryFn: () => workOrderTypesApi.getAll(),
  });
  const { data: settings } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });

  // Time of day from the device clock — it's the tech's morning, wherever
  // the tenant's office is.
  const greeting = t(`dashboard.greeting.${greetingPart(new Date())}Named`, { name: user?.firstName ?? '' });
  const longDate = (date: string | undefined) =>
    (date ? new Date(`${date}T12:00:00Z`) : new Date()).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: date ? 'UTC' : timeZone,
    });
  const dateLabel = longDate(today);
  const first = stops[0];
  const last = stops[stops.length - 1];
  const subtitle =
    first && last
      ? t('myDay.subtitle', {
          date: dateLabel,
          count: stops.length,
          first: clock(first.arrivalWindowStart, timeZone),
          last: clock(last.arrivalWindowEnd, timeZone),
        })
      : t('myDay.subtitleEmpty', { date: dateLabel });

  const allDone = stops.length > 0 && !focus;

  // Another day: history behind, released work ahead.
  const past = offset < 0;
  const viewedDate = viewed.data?.date;
  const viewedStops = viewed.stops;
  const viewedSub = !viewedDate
    ? ''
    : past
      ? viewedStops.length
        ? t('myDay.other.pastSub', {
            date: longDate(viewedDate),
            done: viewedStops.filter((s) => s.status === 'COMPLETED').length,
            count: viewedStops.length,
          })
        : t('myDay.other.pastSubEmpty', { date: longDate(viewedDate) })
      : viewedStops.length
        ? t('myDay.other.futureSub', {
            date: longDate(viewedDate),
            count: viewedStops.length,
            first: clock(viewedStops[0].arrivalWindowStart, timeZone),
            last: clock(viewedStops[viewedStops.length - 1].arrivalWindowEnd, timeZone),
          })
        : longDate(viewedDate);
  const viewedName = dayName(offset, shiftedDate(today, offset), t);

  return (
    <AppLayout>
      <div className="md-wrap" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <header className="md-head">
          <div className="md-head-row">
            <Heading level={1} size="page-lg">
              {offset === 0 ? greeting : viewedName}
            </Heading>
            {today && <DayStepper offset={offset} label={dayName(offset, shiftedDate(today, offset), t)} onStep={step} />}
          </div>
          <Text size="sm" tone="muted" className="mt-0.5">
            {offset !== 0 ? viewedSub : day.isLoading ? dateLabel : subtitle}
          </Text>
        </header>

        {day.isLoading || (offset !== 0 && viewed.isLoading) ? (
          <LoadingState />
        ) : day.error || (offset !== 0 && viewed.error) ? (
          <Callout
            kind="danger"
            title={t('myDay.errors.load')}
            action={
              <Button outline size="xs" onClick={() => (day.error ? day.refetch() : viewed.refetch())}>
                {t('common.actions.tryAgain')}
              </Button>
            }
          >
            {extractApiError(day.error ?? viewed.error) ?? ((day.error ?? viewed.error) as Error).message}
          </Callout>
        ) : offset !== 0 ? (
          <div className="md-grid">
            <div className="md-col">
              <OtherDayRoute stops={viewedStops} past={past} timeZone={timeZone} types={types} />
            </div>
            <div className="md-col">
              {past && <UnfinishedCard awaitingParts={carryover.awaitingParts} quotes={carryover.quotes} />}
              <BackToToday href="/my-day" date={dateLabel} />
            </div>
          </div>
        ) : (
          <>
            {stops.length > 0 && <ProgressStrip stops={stops} focus={focus} timeZone={timeZone} />}
            <div className="md-grid">
              <div className="md-col">
                {stops.length === 0 && <NoStops dispatchPhone={settings?.phone} />}
                {allDone && <DayDone stops={stops} />}
                {focus && (
                  <FocusCard
                    key={focus.dispatchId}
                    stop={focus}
                    workOrder={focusWorkOrder?.id === focus.workOrderId ? focusWorkOrder : undefined}
                    timeZone={timeZone}
                    pending={advance.isPending}
                    onAdvance={(to) => advance.mutate({ stop: focus, to })}
                    onComplete={() => navigate(`/work-orders/${focus.workOrderId}?tab=trips`)}
                  />
                )}
                {stops.length > 0 && (
                  <RouteCard
                    stops={stops}
                    focusId={focus?.dispatchId ?? null}
                    timeZone={timeZone}
                    types={types}
                    expandPast={allDone}
                  />
                )}
              </div>
              <div className="md-col">
                <UnfinishedCard awaitingParts={carryover.awaitingParts} quotes={carryover.quotes} />
                {tomorrow && showTomorrow(next.stops.length, tomorrow) && (
                  <TomorrowLink stops={next.stops} href="/my-day?day=1" timeZone={timeZone} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
