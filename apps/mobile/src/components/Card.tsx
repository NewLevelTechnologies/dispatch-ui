import { View, Text, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { useTheme } from '../theme/ThemeProvider';

type CardProps = {
  /** Already-translated section label (e.g. "Location", "Files") — optional, caller owns copy. */
  title?: string;
  children: ReactNode;
};

/** Mirrors web's `.card` / `.card-head` / `.card-body` shape (apps/web/src/styles/components.css). */
export function Card({ title, children }: CardProps) {
  const { colors, radii, spacing, typography } = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bgElev, borderColor: colors.border, borderRadius: radii.lg },
      ]}
    >
      {title && (
        <View style={[styles.head, { borderBottomColor: colors.borderSoft, padding: spacing.md }]}>
          <Text
            style={{ color: colors.fgStrong, fontSize: typography.label.fontSize, fontWeight: '700' }}
          >
            {title}
          </Text>
        </View>
      )}
      <View style={{ padding: spacing.md }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  head: {
    borderBottomWidth: 1,
  },
});
