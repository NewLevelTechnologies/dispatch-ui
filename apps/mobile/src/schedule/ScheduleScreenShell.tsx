import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../theme/ThemeProvider';
import { AppHeader, Button } from '../components';

type ScheduleScreenShellProps = {
  title: string;
  eyebrow?: string;
  isLoading: boolean;
  error: unknown;
  /** Defaults to the generic "couldn't load your schedule" copy Today/Schedule share. */
  errorTitle?: string;
  errorBody?: string;
  isEmpty: boolean;
  emptyTitle: string;
  emptyBody: string;
  onRetry: () => void;
  children: ReactNode;
};

/**
 * Shared chrome for Today, Schedule and Availability: same header, same
 * loading/error/empty states, so each screen differs only in what it
 * fetches and how it lays out the list once there's something to show.
 */
export function ScheduleScreenShell({
  title,
  eyebrow,
  isLoading,
  error,
  errorTitle,
  errorBody,
  isEmpty,
  emptyTitle,
  emptyBody,
  onRetry,
  children,
}: ScheduleScreenShellProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
      <AppHeader title={title} eyebrow={eyebrow} />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accent500} />
        </View>
      ) : error ? (
        <View style={[styles.center, { padding: spacing.xl, gap: spacing.md }]}>
          <Text style={[styles.stateTitle, { color: colors.fgStrong }]}>
            {errorTitle ?? t('mobileSchedule.errorTitle')}
          </Text>
          <Text style={[styles.stateBody, { color: colors.fgMuted }]}>
            {errorBody ?? t('mobileSchedule.errorBody')}
          </Text>
          <Button label={t('common.actions.tryAgain')} variant="secondary" onPress={onRetry} />
        </View>
      ) : isEmpty ? (
        <View style={[styles.center, { padding: spacing.xl, gap: spacing.xs }]}>
          <Text style={[styles.stateTitle, { color: colors.fgStrong }]}>{emptyTitle}</Text>
          <Text style={[styles.stateBody, { color: colors.fgMuted }]}>{emptyBody}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>{children}</ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  stateBody: {
    fontSize: 13,
    textAlign: 'center',
  },
});
