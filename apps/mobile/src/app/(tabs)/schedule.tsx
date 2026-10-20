import { Text, View } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { DispatchRow } from '../../components';
import { ScheduleScreenShell } from '../../schedule/ScheduleScreenShell';
import { useMyDispatches } from '../../schedule/useMyDispatches';
import { dispatchToRowData } from '../../schedule/dispatchToRowData';
import { statusTone } from '../../schedule/statusTone';
import { upcomingRange } from '../../schedule/dateRanges';
import { groupByDay } from '../../schedule/dayGroups';

const UPCOMING_DAYS = 7;

/** The technician's jobs for the next week, grouped by day — including today. */
export default function ScheduleScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const range = upcomingRange(UPCOMING_DAYS);
  const { dispatches, isLoading, error, refetch } = useMyDispatches(range, `upcoming-${UPCOMING_DAYS}`);

  const days = groupByDay(dispatches, (row) => row.arrivalWindowStart, t);

  return (
    <ScheduleScreenShell
      title={t('nav.schedule')}
      isLoading={isLoading}
      error={error}
      isEmpty={dispatches.length === 0}
      emptyTitle={t('mobileSchedule.emptyTitleWeek')}
      emptyBody={t('mobileSchedule.emptyBodyWeek')}
      onRetry={() => void refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {days.map((day) => (
          <View key={day.key} style={{ gap: spacing.sm }}>
            <Text style={{ color: colors.fgMuted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 }}>
              {day.heading}
            </Text>
            {day.items.map((row) => {
              const data = dispatchToRowData(row);
              return (
                <DispatchRow
                  key={data.id}
                  time={data.time}
                  title={data.title}
                  subtitle={data.subtitle}
                  statusLabel={t(`workOrders.dispatches.status.${data.status}`)}
                  statusTone={statusTone(data.status)}
                />
              );
            })}
          </View>
        ))}
      </View>
    </ScheduleScreenShell>
  );
}
