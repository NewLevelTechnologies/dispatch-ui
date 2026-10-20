import { Pressable, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

type ButtonProps = {
  /** Caller supplies already-translated text — this is a dumb primitive, not a copy owner. */
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
};

/**
 * Full-width by design — a technician's thumb is usually the only input
 * device available, often through a glove. Fixed 50px height keeps the hit
 * target well above the 44pt (iOS) / 48dp (Android) accessibility minimum
 * even with the border included.
 */
export function Button({ label, onPress, variant = 'primary', disabled, testID }: ButtonProps) {
  const { colors, radii, typography } = useTheme();

  const background =
    variant === 'primary'
      ? colors.accent600
      : variant === 'secondary'
        ? colors.bgElev
        : 'transparent';
  const borderColor =
    variant === 'primary' ? colors.accent700 : variant === 'secondary' ? colors.border : 'transparent';
  const textColor = variant === 'primary' ? '#ffffff' : colors.fgStrong;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor,
          borderRadius: radii.md,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={[styles.label, { color: textColor, fontSize: typography.subtitle.fontSize }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 50,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: {
    fontWeight: '600',
  },
});
