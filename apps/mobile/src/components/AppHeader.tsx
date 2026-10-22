import { View, Text, Pressable, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
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
  /** Sits opposite the title — a control that belongs to the screen, like a day stepper. */
  trailing?: ReactNode;
};

/**
 * Always-dark header, regardless of light/dark mode — mirrors web's sidebar,
 * which tokens.css calls out as "intentionally dark in both themes... matches
 * Linear, Vercel, ServiceTitan". This is the one glance that says "same
 * product as the dashboard" the moment the app opens.
 */
export function AppHeader({ eyebrow, title, subtitle, onBack, trailing }: AppHeaderProps) {
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
          style={[styles.back, { flexDirection: 'row', alignItems: 'center' }]}
        >
          <Text style={{ color: colors.barFg, fontSize: 22, fontWeight: '600' }}>‹</Text>
          <Text style={{ color: colors.barFg, fontSize: 15, fontWeight: '600', marginLeft: 2 }}>
            {t('common.actions.back')}
          </Text>
        </Pressable>
      )}
      {eyebrow && <Text style={{ color: colors.barFgDim, fontSize: 11 }}>{eyebrow}</Text>}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.barFg }]} numberOfLines={1}>
          {title}
        </Text>
        {trailing}
      </View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    flexShrink: 1,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
});
