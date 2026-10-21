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
import { useMemo } from 'react';
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
  DayDone,
  FocusCard,
  NoStops,
  ProgressStrip,
  RouteCard,
  TomorrowLink,
  UnfinishedCard,
} from '../features/my-day/MyDayCards';
import { clock, pickFocus, showTomorrow } from '../features/my-day/myDayModel';
import {
  useAdvanceDispatch,
  useCarryover,
  useFocusWorkOrder,
  useMyDayStops,
  useTomorrowStops,
} from '../features/my-day/useMyDay';

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
  const next = useTomorrowStops(today);
  const tomorrow = next.data?.date;
  const stops = day.stops;
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
  const dateLabel = (today ? new Date(`${today}T12:00:00Z`) : new Date()).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: today ? 'UTC' : timeZone,
  });
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
  // My work orders, narrowed to tomorrow — there's no tech-facing schedule
  // page to send them to.
  const tomorrowHref =
    user && tomorrow ? `/work-orders?assigned=${user.id}&from=${tomorrow}&to=${tomorrow}` : '/work-orders';

  return (
    <AppLayout>
      <div className="md-wrap">
        <header className="md-head">
          <Heading level={1} size="page-lg">
            {greeting}
          </Heading>
          <Text size="sm" tone="muted" className="mt-0.5">
            {day.isLoading ? dateLabel : subtitle}
          </Text>
        </header>

        {day.isLoading ? (
          <LoadingState />
        ) : day.error ? (
          <Callout
            kind="danger"
            title={t('myDay.errors.load')}
            action={
              <Button outline size="xs" onClick={() => day.refetch()}>
                {t('common.actions.tryAgain')}
              </Button>
            }
          >
            {extractApiError(day.error) ?? (day.error as Error).message}
          </Callout>
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
                  <TomorrowLink stops={next.stops} href={tomorrowHref} timeZone={timeZone} />
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
