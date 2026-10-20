import { Text, View } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../components';
import { ScheduleScreenShell } from '../schedule/ScheduleScreenShell';
import { useMyAvailability } from '../availability/useMyAvailability';
import { formatAvailabilitySpan } from '../availability/formatAvailabilitySpan';

/**
 * Read-only for now — view what's on the books, same as a dispatcher sees on
 * the board's hatched rows. Marking time off from here (create/remove) is a
 * deliberate follow-up, not an oversight: see apps/mobile/PLAN.md.
 */
export default function AvailabilityScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { availability, isLoading, error, refetch } = useMyAvailability();

  return (
    <ScheduleScreenShell
      title={t('myAvailability.title')}
      isLoading={isLoading}
      error={error}
      errorTitle={t('myAvailability.errorTitle')}
      errorBody={t('myAvailability.errorBody')}
      isEmpty={availability.length === 0}
      emptyTitle={t('myAvailability.emptyTitle')}
      emptyBody={t('myAvailability.emptyBody')}
      onRetry={() => void refetch()}
    >
      <View style={{ gap: spacing.sm }}>
        {availability.map((entry) => (
          <Card key={entry.id}>
            <Text style={{ color: colors.fgStrong, fontWeight: '700', fontSize: 14 }}>{entry.label}</Text>
            <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 2 }}>
              {formatAvailabilitySpan(entry)}
            </Text>
            {entry.reason && (
              <Text style={{ color: colors.fgMuted, fontSize: 12, marginTop: 4 }}>{entry.reason}</Text>
            )}
          </Card>
        ))}
      </View>
    </ScheduleScreenShell>
  );
}
