import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { StatusPill, type PillTone } from './StatusPill';

type DispatchRowProps = {
  /** Arrival window start, already formatted by the caller (e.g. "8:00a"). */
  time: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusTone: PillTone;
  onPress?: () => void;
  onPressCall?: () => void;
  onPressDirections?: () => void;
};

/** One job on the Today / Schedule list — the mobile app's most-rendered row. */
export function DispatchRow({
  time,
  title,
  subtitle,
  statusLabel,
  statusTone,
  onPress,
  onPressCall,
  onPressDirections,
}: DispatchRowProps) {
  const { colors, radii, spacing } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        styles.row,
        {
          backgroundColor: colors.bgElev,
          borderColor: colors.border,
          borderRadius: radii.lg,
          padding: spacing.md,
          gap: spacing.md,
        },
      ]}
    >
      <Text style={[styles.time, { color: colors.fgMuted }]}>{time}</Text>
      <View style={styles.main}>
        <Text style={[styles.title, { color: colors.fgStrong }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.subtitle, { color: colors.fgMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
        <View style={{ marginTop: spacing.xs }}>
          <StatusPill label={statusLabel} tone={statusTone} />
        </View>
      </View>
      {(onPressCall || onPressDirections) && (
        <View style={styles.actions}>
          {onPressDirections && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Directions"
              onPress={onPressDirections}
              style={[styles.iconButton, { borderColor: colors.border, borderRadius: radii.sm }]}
            >
              <Text>↗</Text>
            </Pressable>
          )}
          {onPressCall && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call"
              onPress={onPressCall}
              style={[styles.iconButton, { borderColor: colors.border, borderRadius: radii.sm }]}
            >
              <Text>☎</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
  },
  time: {
    fontSize: 12,
    fontWeight: '600',
    width: 48,
    paddingTop: 2,
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
