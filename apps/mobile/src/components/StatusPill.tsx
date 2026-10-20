import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type PillTone = 'info' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

type StatusPillProps = {
  label: string;
  tone: PillTone;
};

/** Mirrors web's `.pill` convention (tinted background, solid foreground, dot) — see apps/web/src/styles/components.css. */
export function StatusPill({ label, tone }: StatusPillProps) {
  const { colors, radii } = useTheme();

  const { bg, fg } =
    tone === 'info'
      ? { bg: colors.infoTint, fg: colors.info }
      : tone === 'accent'
        ? { bg: colors.accentTint, fg: colors.accent700 }
        : tone === 'success'
          ? { bg: colors.successTint, fg: colors.success }
          : tone === 'warning'
            ? { bg: colors.warningTint, fg: colors.warning }
            : tone === 'danger'
              ? { bg: colors.dangerTint, fg: colors.danger }
              : { bg: colors.bgActive, fg: colors.fgMuted };

  return (
    <View style={[styles.pill, { backgroundColor: bg, borderRadius: radii.full }]}>
      <View style={[styles.dot, { backgroundColor: fg }]} />
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 9,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
