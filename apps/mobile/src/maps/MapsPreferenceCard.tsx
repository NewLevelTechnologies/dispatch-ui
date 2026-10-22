import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from '../components';
import { useMapsPreference } from './useMapsPreference';

// A glyph, not copy — `accessibilityState.selected` is what carries the
// meaning to a screen reader.
const CHECK = '✓';

/**
 * Where Directions opens, changeable after the fact — the first Directions tap
 * asks once and remembers, and this is how that answer gets revisited.
 *
 * Hidden entirely when the device has only one maps app: there is no setting
 * to offer, and an un-changeable row reads as broken.
 */
export function MapsPreferenceCard() {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();
  const { apps, selected, choose, isLoading } = useMapsPreference();

  if (isLoading || apps.length < 2) return null;

  return (
    <Card title={t('mobileMaps.preferenceTitle')}>
      <View style={{ gap: spacing.xs }}>
        {apps.map((app) => {
          const isSelected = app.id === selected;
          return (
            <Pressable
              key={app.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              onPress={() => choose(app.id)}
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
                {t(app.nameKey)}
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
