import { Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import type { MyDayStop } from '@dispatch/api';
import { useTheme } from '../theme/ThemeProvider';
import { clock } from './clock';

/**
 * One segment per stop, plus the line that answers "how far through am I" —
 * "2 of 5 stops done · next at 10a".
 */
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
  const { colors, spacing } = useTheme();

  const done = stops.filter((s) => s.status === 'COMPLETED').length;
  const place = (s: MyDayStop) => s.serviceLocationName || s.customerName || s.serviceLocationCity || '';

  const suffix = !focus
    ? t('myDay.progress.dayComplete')
    : focus.status === 'IN_PROGRESS'
      ? t('myDay.progress.onSiteAt', { place: place(focus) })
      : focus.status === 'EN_ROUTE'
        ? t('myDay.progress.enRouteTo', { place: place(focus) })
        : t('myDay.progress.nextAt', { time: clock(focus.arrivalWindowStart, timeZone) ?? '' });

  const segmentColor = (s: MyDayStop) => {
    if (s.status === 'COMPLETED') return colors.success;
    if (s.status === 'NO_SHOW') return colors.danger;
    if (s.status === 'IN_PROGRESS' || s.status === 'EN_ROUTE') return colors.accent500;
    return colors.border;
  };

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={t('myDay.progress.aria')}
      style={{ gap: spacing.xs }}
    >
      <View style={styles.track}>
        {stops.map((s) => (
          <View key={s.dispatchId} style={[styles.segment, { backgroundColor: segmentColor(s) }]} />
        ))}
      </View>
      <Text style={{ color: colors.fgMuted, fontSize: 12 }}>
        {t('myDay.progress.done', { done, count: stops.length })} · {suffix}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 5,
    borderRadius: 3,
  },
});
