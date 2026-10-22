import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View, StyleSheet, type GestureResponderEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '@dispatch/i18n';
import type { MyDayStop } from '@dispatch/api';
import { useTheme } from '../../theme/ThemeProvider';
import { AppHeader, Button } from '../../components';
import { useCurrentUser } from '../../hooks/useCurrentUser';
import { useWorkOrderAccess } from '../../permissions/useWorkOrderAccess';
import { useAdvanceStop, useDayAt, useFocusWorkOrder, useMyDayStops } from '../../my-day/useMyDay';
import { clampOffset, dayName, pickFocus, shiftDay, showTomorrow, swipeStep } from '../../my-day/myDayModel';
import { ProgressStrip } from '../../my-day/ProgressStrip';
import { FocusCard } from '../../my-day/FocusCard';
import { RouteCard } from '../../my-day/RouteCard';
import { DayDone, NoStops, TomorrowCard } from '../../my-day/DayCards';
import { DayStepper } from '../../my-day/DayStepper';

/**
 * The technician's day, mirroring web's `/my-day`
 * (`apps/web/src/pages/MyDayPage.tsx`). Answers three questions in order:
 * what am I doing right now, what does the rest of the day look like, and
 * what's coming next.
 *
 * Deliberately different from web in two places: no greeting or date line
 * (the header already names the day, and a phone has less room to spend),
 * and the live/en-route accent follows mobile's own `statusTone` rather than
 * web's violet — every other status pill in this app already reads that way,
 * and a one-off colour here would be the odd one out.
 *
 * Only today can be acted on. Other days are a read-only route: the stops
 * are real, but the actions belong to the day you're actually working.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const router = useRouter();

  const [offset, setOffset] = useState(0);
  const step = (to: number) => setOffset(clampOffset(to));

  // The server resolves "today" in the tenant's zone and tells us which day
  // and zone it used — the client never computes either.
  const today = useMyDayStops();
  const todayDate = today.data?.date;
  const timeZone = today.data?.timeZone ?? 'UTC';

  const other = useDayAt(todayDate, offset);
  const tomorrow = useDayAt(todayDate, 1);

  const viewed = offset === 0 ? today : other;
  const stops = viewed.stops;
  // Acting on a day you aren't working would be a mis-tap waiting to happen.
  const focus = offset === 0 ? pickFocus(stops) : null;

  const { data: focusWorkOrder } = useFocusWorkOrder(focus?.workOrderId);
  // Every stop this endpoint returns is the signed-in tech's own work — it has
  // no assignee field because there is nothing else it could be. So the
  // assignment half of the capability test is answered by the user's own id;
  // what's left to decide is whether their role may move a job along at all.
  const { data: me } = useCurrentUser();
  const { canEdit } = useWorkOrderAccess(me?.id);
  const advance = useAdvanceStop();

  const openWorkOrder = (workOrderId: string) =>
    router.push({ pathname: '/work-order/[id]', params: { id: workOrderId } });

  // Horizontal drags step a day; short ones are a scroll or a tap.
  const [touchX, setTouchX] = useState<number | null>(null);
  const onTouchStart = (e: GestureResponderEvent) => setTouchX(e.nativeEvent.pageX);
  const onTouchEnd = (e: GestureResponderEvent) => {
    if (touchX == null) return;
    const by = swipeStep(e.nativeEvent.pageX - touchX);
    setTouchX(null);
    if (by) step(offset + by);
  };

  const viewedDate = offset === 0 ? todayDate : todayDate && shiftDay(todayDate, offset);
  const headerTitle = offset === 0 ? t('myDay.title') : dayName(offset, viewedDate, t);
  const stepper = todayDate ? (
    <DayStepper offset={offset} label={dayName(offset, viewedDate, t)} onStep={step} />
  ) : undefined;

  const body = () => {
    if (viewed.isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent500} />
        </View>
      );
    }

    if (viewed.error) {
      return (
        <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
          <Text style={{ color: colors.fgStrong, fontSize: 15, fontWeight: '700' }}>{t('myDay.errors.load')}</Text>
          <Button label={t('common.actions.tryAgain')} variant="secondary" onPress={() => void viewed.refetch()} />
        </View>
      );
    }

    const allDone = stops.length > 0 && !focus && offset === 0;

    return (
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {offset === 0 && stops.length > 0 && (
          <ProgressStrip stops={stops} focus={focus} timeZone={timeZone} />
        )}

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
            title={offset === 0 ? undefined : t('myDay.other.route')}
            onOpenStop={(stop: MyDayStop) => openWorkOrder(stop.workOrderId)}
          />
        )}

        {offset === 0 && todayDate && showTomorrow(tomorrow.stops.length, shiftDay(todayDate, 1)) && (
          <TomorrowCard stops={tomorrow.stops} timeZone={timeZone} onPress={() => step(1)} />
        )}
      </ScrollView>
    );
  };

  return (
    <View
      style={{ flex: 1, backgroundColor: colors.bgSunken }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <AppHeader title={headerTitle} trailing={stepper} />
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
