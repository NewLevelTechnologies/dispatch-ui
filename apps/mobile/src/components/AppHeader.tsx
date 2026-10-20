import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../theme/ThemeProvider';

type AppHeaderProps = {
  /** Small line above the title — e.g. a date, or the signed-in user. */
  eyebrow?: string;
  title: string;
  /** Small line below the title — e.g. a record number backing it up. */
  subtitle?: string;
  /**
   * Shows a back chevron above the title when given. Every detail screen
   * (dispatch, work order, …) sets `headerShown: false` on its Stack.Screen
   * so this bar is the only chrome — without this, that leaves no way back.
   */
  onBack?: () => void;
};

/**
 * Always-dark header, regardless of light/dark mode — mirrors web's sidebar,
 * which tokens.css calls out as "intentionally dark in both themes... matches
 * Linear, Vercel, ServiceTitan". This is the one glance that says "same
 * product as the dashboard" the moment the app opens.
 */
export function AppHeader({ eyebrow, title, subtitle, onBack }: AppHeaderProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.bar, paddingTop: insets.top + spacing.sm, paddingBottom: spacing.md },
      ]}
    >
      {onBack && (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
          style={styles.back}
        >
          <Text style={{ color: colors.barFg, fontSize: 22, fontWeight: '600' }}>‹</Text>
        </Pressable>
      )}
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
  back: {
    alignSelf: 'flex-start',
    marginLeft: -6,
    marginBottom: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
});
