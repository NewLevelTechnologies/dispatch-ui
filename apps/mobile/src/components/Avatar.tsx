import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

export type AvatarSize = 'sm' | 'md' | 'lg';

type AvatarProps = {
  /** Full display name — only the initials are rendered. */
  name: string;
  size?: AvatarSize;
};

const DIMENSIONS: Record<AvatarSize, number> = { sm: 28, md: 36, lg: 52 };
const FONT_SIZES: Record<AvatarSize, number> = { sm: 11, md: 13, lg: 18 };

/** Up to two initials: first + last word. "Mike R." -> "MR", "Dana" -> "D". */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Deterministic hash so the same person always lands on the same tone. */
function hashIndex(name: string, count: number): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % count;
}

export function Avatar({ name, size = 'md' }: AvatarProps) {
  const { colors } = useTheme();
  const palette = [colors.accent600, colors.info, colors.success, colors.danger];
  const background = palette[hashIndex(name, palette.length)];
  const dimension = DIMENSIONS[size];

  return (
    <View
      accessibilityLabel={name}
      style={[
        styles.base,
        { width: dimension, height: dimension, borderRadius: dimension / 2, backgroundColor: background },
      ]}
    >
      <Text style={{ color: '#ffffff', fontSize: FONT_SIZES[size], fontWeight: '700' }}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
