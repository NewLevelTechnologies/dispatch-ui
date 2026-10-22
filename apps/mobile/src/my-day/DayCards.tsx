import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import type { MyDayStop } from '@dispatch/api';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Card } from '../components';
import { clock } from './clock';
import { formatDuration, onSiteMinutes } from './myDayModel';

/** Nothing released for this day yet. */
export function NoStops({ onCallDispatch }: { onCallDispatch?: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  return (
    <Card>
      <View style={{ alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.xs }}>
        <Text style={{ color: colors.fgStrong, fontSize: 15, fontWeight: '700' }}>{t('myDay.noStops.title')}</Text>
        <Text style={{ color: colors.fgMuted, fontSize: 13, textAlign: 'center' }}>
          {t('myDay.noStops.description')}
        </Text>
        {onCallDispatch && (
          <View style={{ marginTop: spacing.sm }}>
            <Button label={t('myDay.actions.callDispatch')} variant="secondary" onPress={onCallDispatch} />
          </View>
        )}
      </View>
    </Card>
  );
}

/** Every stop is behind the tech — the quiet end-of-day state. */
export function DayDone({ stops }: { stops: MyDayStop[] }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  const done = stops.filter((s) => s.status === 'COMPLETED').length;
  const noShows = stops.filter((s) => s.status === 'NO_SHOW').length;
  const minutes = Math.round(onSiteMinutes(stops));

  const parts = [
    t('myDay.dayDone.summary', { done, total: stops.length }),
    ...(noShows ? [t('myDay.dayDone.noShows', { count: noShows })] : []),
    ...(minutes > 0 ? [t('myDay.dayDone.onSite', { duration: formatDuration(minutes) })] : []),
  ];

  return (
    <Card>
      <View style={{ alignItems: 'center', paddingVertical: spacing.md, gap: 2 }}>
        <Text style={{ color: colors.fgStrong, fontSize: 15, fontWeight: '700' }}>{t('myDay.dayDone.title')}</Text>
        <Text style={{ color: colors.fgMuted, fontSize: 12, textAlign: 'center' }}>{parts.join(' · ')}</Text>
      </View>
    </Card>
  );
}

/** A glance at tomorrow, so the last thing on the screen isn't a dead end. */
export function TomorrowCard({
  stops,
  timeZone,
  onPress,
}: {
  stops: MyDayStop[];
  timeZone: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();

  const first = stops[0];
  const place = first ? first.serviceLocationName || first.customerName || '' : '';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.tomorrow,
        {
          borderColor: colors.border,
          borderRadius: radii.lg,
          backgroundColor: pressed ? colors.bgHover : 'transparent',
          padding: spacing.md,
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.fgStrong, fontSize: 14, fontWeight: '600' }}>
          {stops.length ? t('myDay.tomorrow.title', { count: stops.length }) : t('myDay.tomorrow.titleEmpty')}
        </Text>
        <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 1 }}>
          {first
            ? t('myDay.tomorrow.first', { time: clock(first.arrivalWindowStart, timeZone) ?? '', place })
            : t('myDay.tomorrow.none')}
        </Text>
      </View>
      <Text style={{ color: colors.fgMuted }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tomorrow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
  },
});
