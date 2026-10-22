import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from './ThemeProvider';
import { THEME_PREFERENCES, type ThemePreference } from './themePreference';
import { Card } from '../components';

// A glyph, not copy — `accessibilityState.selected` carries the meaning to a
// screen reader.
const CHECK = '✓';

const LABEL_KEY: Record<ThemePreference, string> = {
  light: 'account.preferences.themeLight',
  dark: 'account.preferences.themeDark',
  system: 'account.preferences.themeSystem',
};

/**
 * Light / Dark / System, the same three web offers in Account Settings.
 * Defaults to System, so the app follows the phone unless the tech says
 * otherwise — a van windscreen at night and a bright plant room are different
 * problems, and the OS already knows which one they're in.
 */
export function ThemePreferenceCard() {
  const { t } = useTranslation();
  const { colors, radii, spacing, preference, setPreference } = useTheme();

  return (
    <Card title={t('account.preferences.theme')}>
      <View style={{ gap: spacing.xs }}>
        {THEME_PREFERENCES.map((option) => {
          const isSelected = option === preference;
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityLabel={t(LABEL_KEY[option])}
              accessibilityState={{ selected: isSelected }}
              onPress={() => setPreference(option)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: isSelected ? colors.accent500 : colors.border,
                  borderRadius: radii.md,
                  backgroundColor: pressed ? colors.bgHover : colors.bgElev,
                  padding: spacing.sm,
                },
              ]}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 14,
                  color: isSelected ? colors.fgStrong : colors.fg,
                  fontWeight: isSelected ? '600' : '400',
                }}
              >
                {t(LABEL_KEY[option])}
              </Text>
              {isSelected && <Text style={{ color: colors.accent700, fontSize: 14 }}>{CHECK}</Text>}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});
