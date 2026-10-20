import { View } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { DispatchRow } from '../../components';
import { ScheduleScreenShell } from '../../schedule/ScheduleScreenShell';
import { useMyDispatches } from '../../schedule/useMyDispatches';
import { dispatchToRowData } from '../../schedule/dispatchToRowData';
import { statusTone } from '../../schedule/statusTone';
import { todayRange } from '../../schedule/dateRanges';
import { formatFullDate } from '../../schedule/formatFullDate';

/**
 * The technician's jobs for today, soonest first. Calls `todayRange()` fresh
 * on every render rather than memoizing it: the range is stable all day (it
 * truncates to local midnight either side), and recomputing it is what makes
 * the screen roll over to the new day on its own right at midnight, instead
 * of needing a restart to notice.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const range = todayRange();
  const { dispatches, isLoading, error, refetch } = useMyDispatches(range, 'today');

  return (
    <ScheduleScreenShell
      title={t('nav.today')}
      eyebrow={formatFullDate()}
      isLoading={isLoading}
      error={error}
      isEmpty={dispatches.length === 0}
      emptyTitle={t('mobileSchedule.emptyTitleToday')}
      emptyBody={t('mobileSchedule.emptyBodyToday')}
      onRetry={() => void refetch()}
    >
      <View style={{ gap: spacing.sm }}>
        {dispatches.map((row) => {
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
    </ScheduleScreenShell>
  );
}
