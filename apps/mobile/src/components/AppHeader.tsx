import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

type AppHeaderProps = {
  /** Small line above the title — e.g. a date, or the signed-in user. */
  eyebrow?: string;
  title: string;
  /** Small line below the title — e.g. a record number backing it up. */
  subtitle?: string;
};

/**
 * Always-dark header, regardless of light/dark mode — mirrors web's sidebar,
 * which tokens.css calls out as "intentionally dark in both themes... matches
 * Linear, Vercel, ServiceTitan". This is the one glance that says "same
 * product as the dashboard" the moment the app opens.
 */
export function AppHeader({ eyebrow, title, subtitle }: AppHeaderProps) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.bar, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md },
      ]}
    >
      {eyebrow && <Text style={{ color: colors.barFgDim, fontSize: 11 }}>{eyebrow}</Text>}
      <Text style={[styles.title, { color: colors.barFg }]}>{title}</Text>
      {subtitle && <Text style={{ color: colors.barFgDim, fontSize: 11, marginTop: 2 }}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
});
