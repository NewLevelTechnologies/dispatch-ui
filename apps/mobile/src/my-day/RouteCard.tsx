import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import type { MyDayStop } from '@dispatch/api';
import { useTheme } from '../theme/ThemeProvider';
import { Card, StatusPill } from '../components';
import { statusTone } from '../schedule/statusTone';
import { clock } from './clock';
import { formatEstimate, isLive, isPast } from './myDayModel';

/**
 * One stop in the day's route. Tapping opens the **work order**, not the
 * dispatch — matching web, and what a tech is actually reaching for.
 */
function StopRow({
  stop,
  timeZone,
  isFocus,
  onPress,
}: {
  stop: MyDayStop;
  timeZone: string;
  isFocus: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  const past = isPast(stop.status);
  const dotColor = past
    ? stop.status === 'COMPLETED'
      ? colors.success
      : colors.danger
    : isLive(stop.status)
      ? colors.accent500
      : colors.border;

  const place = [stop.serviceLocationName || stop.customerName, stop.serviceLocationCity].filter(Boolean).join(' · ');
  const estimate = formatEstimate(stop.estimatedDuration);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          padding: spacing.sm,
          gap: spacing.sm,
          // The stop the card above is about, tinted so the eye can tie the
          // two together without re-reading the title.
          backgroundColor: pressed ? colors.bgHover : isFocus ? colors.accentTint : 'transparent',
        },
      ]}
    >
      <View style={styles.time}>
        <Text style={{ color: past ? colors.fgMuted : colors.fgStrong, fontSize: 13, fontWeight: '600' }}>
          {clock(stop.arrivalWindowStart, timeZone)}
        </Text>
        {estimate && <Text style={{ color: colors.fgMuted, fontSize: 11 }}>{estimate}</Text>}
      </View>

      <View style={[styles.dot, { backgroundColor: dotColor, borderColor: dotColor }]} />

      <View style={styles.main}>
        {stop.driveMinFromPrev != null && !past && (
          <Text style={{ color: colors.fgMuted, fontSize: 11 }}>
            {t('myDay.drive', { count: stop.driveMinFromPrev })}
          </Text>
        )}
        <Text
          numberOfLines={2}
          style={{ color: past ? colors.fgMuted : colors.fgStrong, fontSize: 14, fontWeight: '600' }}
        >
          {stop.workOrderSummary || stop.workOrderNumber || ''}
        </Text>
        {place && (
          <Text numberOfLines={1} style={{ color: colors.fgMuted, fontSize: 12, marginTop: 1 }}>
            {place}
          </Text>
        )}
        <View style={[styles.chips, { marginTop: 4, gap: spacing.xs }]}>
          {stop.workOrderNumber && (
            <Text style={{ color: colors.fgMuted, fontSize: 11, fontVariant: ['tabular-nums'] }}>
              {stop.workOrderNumber}
            </Text>
          )}
          {/* Only a stop that's genuinely underway gets the badge — being the
              focus just means it's next, which the card above already says. */}
          {isLive(stop.status) && (
            <StatusPill
              label={stop.status === 'IN_PROGRESS' ? t('myDay.route.onSite') : t('myDay.focus.enRoute')}
              tone={statusTone(stop.status)}
            />
          )}
          {stop.status === 'NO_SHOW' && <StatusPill label={t('myDay.route.noShow')} tone="danger" />}
          {stop.recurring && <StatusPill label={t('myDay.route.agreement')} tone="neutral" />}
        </View>
      </View>

      <Text style={{ color: colors.fgMuted }}>›</Text>
    </Pressable>
  );
}

/** The whole day in order, newest work last — the "what does the rest of the day look like" answer. */
export function RouteCard({
  stops,
  focusId,
  timeZone,
  onOpenStop,
  title,
}: {
  stops: MyDayStop[];
  focusId: string | null;
  timeZone: string;
  onOpenStop: (stop: MyDayStop) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <Card title={title ?? t('myDay.route.title')}>
      <View>
        {stops.map((stop, i) => (
          <View
            key={stop.dispatchId}
            style={i > 0 ? { borderTopWidth: 1, borderTopColor: colors.borderSoft } : undefined}
          >
            <StopRow
              stop={stop}
              timeZone={timeZone}
              isFocus={stop.dispatchId === focusId}
              onPress={() => onOpenStop(stop)}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  time: {
    width: 56,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    marginTop: 3,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
});
