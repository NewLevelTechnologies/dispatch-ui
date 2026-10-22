import { Pressable, Text, View, StyleSheet } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../theme/ThemeProvider';
import { DAY_RANGE } from './myDayModel';

// Glyphs, not copy — the accessible names come from the i18n'd labels below.
const PREV = '‹';
const NEXT = '›';

/**
 * ‹ Today › — moves the screen a day either way, up to a week out. The middle
 * button is also the way back to today, so a tech who swiped three days out
 * has one tap home rather than three.
 */
export function DayStepper({
  offset,
  label,
  onStep,
}: {
  offset: number;
  label: string;
  onStep: (to: number) => void;
}) {
  const { t } = useTranslation();
  const { colors, radii, spacing } = useTheme();

  const arrow = (direction: -1 | 1) => {
    const disabled = direction === -1 ? offset <= -DAY_RANGE : offset >= DAY_RANGE;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={direction === -1 ? t('myDay.stepper.previous') : t('myDay.stepper.next')}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => onStep(offset + direction)}
        style={{ paddingHorizontal: spacing.sm, opacity: disabled ? 0.35 : 1 }}
      >
        <Text style={{ color: colors.barFg, fontSize: 20, fontWeight: '600' }}>
          {direction === -1 ? PREV : NEXT}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={t('myDay.stepper.aria')}
      style={[styles.bar, { borderColor: colors.barFgDim, borderRadius: radii.md }]}
    >
      {arrow(-1)}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={offset === 0 ? label : t('myDay.stepper.backToToday')}
        onPress={() => onStep(0)}
        style={{ paddingHorizontal: spacing.xs, minWidth: 84 }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: colors.barFg,
            fontSize: 13,
            fontWeight: offset === 0 ? '700' : '600',
            textAlign: 'center',
          }}
        >
          {label}
        </Text>
      </Pressable>
      {arrow(1)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 4,
  },
});
