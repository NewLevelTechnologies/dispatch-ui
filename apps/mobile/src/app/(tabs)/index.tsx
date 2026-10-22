import { useMemo } from 'react';
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '@dispatch/i18n';
import type { MyDayStop } from '@dispatch/api';
import { useTheme } from '../../theme/ThemeProvider';
import { AppHeader, Button } from '../../components';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useWorkOrderAccess } from '../../permissions/useWorkOrderAccess';
import { useAdvanceStop, useDayAt, useFocusWorkOrder, useMyDayStops } from '../../my-day/useMyDay';
import { pickFocus, shiftDay, showTomorrow } from '../../my-day/myDayModel';
import { ProgressStrip } from '../../my-day/ProgressStrip';
import { FocusCard } from '../../my-day/FocusCard';
import { RouteCard } from '../../my-day/RouteCard';
import { DayDone, NoStops, TomorrowCard } from '../../my-day/DayCards';
import { UnfinishedCard } from '../../my-day/UnfinishedCard';
import { useCarryover } from '../../my-day/useCarryover';

/**
 * The technician's day, after web's `/my-day`
 * (`apps/web/src/pages/MyDayPage.tsx`). Answers three questions in order:
 * what am I doing right now, what does the rest of the day look like, and
 * what's hanging over me.
 *
 * This screen is **today only**. Web can page back and forth through the
 * week; here that competed with vertical scrolling and made the screen feel
 * unsteady, and the Schedule tab already answers "what about other days"
 * properly. The tomorrow teaser stays, and leads there.
 *
 * Departs from web in two more places: no greeting or date line (the header
 * names the day and a phone has less room to spend), and the live/en-route
 * accent follows mobile's own `statusTone` rather than web's violet, since
 * every other status pill in this app already reads that way.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const router = useRouter();

  // The server resolves "today" in the tenant's zone and tells us which day
  // and zone it used — the client never computes either.
  const today = useMyDayStops();
  const todayDate = today.data?.date;
  const timeZone = today.data?.timeZone ?? 'UTC';
  const stops = today.stops;
  const focus = pickFocus(stops);

  const tomorrow = useDayAt(todayDate, 1);

  const { data: focusWorkOrder } = useFocusWorkOrder(focus?.workOrderId);
  // Every stop this endpoint returns is the signed-in tech's own work — it has
  // no assignee field because there is nothing else it could be. So the
  // assignment half of the capability test is answered by the user's own id;
  // what's left to decide is whether their role may move a job along at all.
  const { data: me } = useCurrentUser();
  const { canEdit } = useWorkOrderAccess(me?.id);
  const advance = useAdvanceStop();

  // What's hanging over the tech beyond the route. Today's own jobs are left
  // to the route above rather than listed twice on one screen.
  const onRoute = useMemo(() => new Set(stops.map((s) => s.workOrderId)), [stops]);
  const carryover = useCarryover(me?.id, onRoute);

  const openWorkOrder = (workOrderId: string) =>
    router.push({ pathname: '/work-order/[id]', params: { id: workOrderId } });

  const body = () => {
    if (today.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent500} />
        </View>
      );
    }

    if (today.error) {
      return (
        <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
          <Text style={{ color: colors.fgStrong, fontSize: 15, fontWeight: '700' }}>{t('myDay.errors.load')}</Text>
          <Button label={t('common.actions.tryAgain')} variant="secondary" onPress={() => void today.refetch()} />
        </View>
      );
    }

    const allDone = stops.length > 0 && !focus;

    return (
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {stops.length > 0 && <ProgressStrip stops={stops} focus={focus} timeZone={timeZone} />}

        {stops.length === 0 && <NoStops />}
        {allDone && <DayDone stops={stops} />}

        {focus && (
          <FocusCard
            key={focus.dispatchId}
            stop={focus}
            workOrder={focusWorkOrder?.id === focus.workOrderId ? focusWorkOrder : undefined}
            timeZone={timeZone}
            canEdit={canEdit}
            pending={advance.isPending}
            onAdvance={(to) => advance.mutate({ stop: focus, to })}
            onComplete={() => openWorkOrder(focus.workOrderId)}
            onOpenWorkOrder={() => openWorkOrder(focus.workOrderId)}
          />
        )}

        {stops.length > 0 && (
          <RouteCard
            stops={stops}
            focusId={focus?.dispatchId ?? null}
            timeZone={timeZone}
            onOpenStop={(stop: MyDayStop) => openWorkOrder(stop.workOrderId)}
          />
        )}

        <UnfinishedCard
          awaitingParts={carryover.awaitingParts}
          quotes={carryover.quotes}
          onOpenWorkOrder={openWorkOrder}
          // Reachable through the job it belongs to — useCarryover drops any
          // quote that has none, so this always has somewhere to go.
          onOpenQuote={(quote) => quote.workOrderId && openWorkOrder(quote.workOrderId)}
        />

        {todayDate && showTomorrow(tomorrow.stops.length, shiftDay(todayDate, 1)) && (
          // Anything past today belongs to Schedule, which shows the week.
          <TomorrowCard stops={tomorrow.stops} timeZone={timeZone} onPress={() => router.push('/schedule')} />
        )}
      </ScrollView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
      <AppHeader title={t('nav.today')} />
      {body()}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
