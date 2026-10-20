import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { DispatchRow } from '../../components';
import { ScheduleScreenShell } from '../../schedule/ScheduleScreenShell';
import { useMyBoardDispatches } from '../../schedule/useMyBoardDispatches';
import { boardDispatchToRowData } from '../../schedule/boardDispatchToRowData';
import { statusTone } from '../../schedule/statusTone';
import { dayKey } from '../../schedule/dayGroups';
import { formatFullDate } from '../../schedule/formatFullDate';

/**
 * The technician's jobs for today, soonest first. Calls `dayKey()` fresh on
 * every render rather than memoizing it, same reasoning as the old
 * `todayRange()` call this replaced: recomputing it is what makes the screen
 * roll over to the new day on its own right at midnight.
 */
export default function TodayScreen() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const router = useRouter();
  const date = dayKey(new Date());
  const { dispatches, isLoading, error, refetch } = useMyBoardDispatches(date);

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
          const data = boardDispatchToRowData(row);
          return (
            <DispatchRow
              key={data.id}
              time={data.time}
              title={data.title}
              subtitle={data.subtitle}
              statusLabel={t(`workOrders.dispatches.status.${data.status}`)}
              statusTone={statusTone(data.status)}
              onPress={() =>
                router.push({ pathname: '/dispatch/[id]', params: { id: row.id, workOrderId: row.workOrderId } })
              }
            />
          );
        })}
      </View>
    </ScheduleScreenShell>
  );
}
