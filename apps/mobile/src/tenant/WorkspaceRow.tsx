import { Pressable, Text, View, StyleSheet } from 'react-native';
import type { TenantMembership } from '../api/setup';
import { useTheme } from '../theme/ThemeProvider';
import { workspaceMark } from './workspaceMark';

type WorkspaceRowProps = {
  membership: TenantMembership;
  onPress: (membership: TenantMembership) => void;
};

/** A tappable workspace tile — used by both the first-run picker and the Profile switcher. */
export function WorkspaceRow({ membership, onPress }: WorkspaceRowProps) {
  const { colors, radii, spacing } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => onPress(membership)}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: colors.border,
          borderRadius: radii.md,
          backgroundColor: pressed ? colors.bgHover : colors.bgElev,
          padding: spacing.sm,
          gap: spacing.sm,
        },
      ]}
    >
      <View
        style={[
          styles.mark,
          { backgroundColor: colors.accentTint, borderRadius: radii.sm },
        ]}
      >
        <Text style={{ color: colors.accent700, fontWeight: '700', fontSize: 13 }}>
          {workspaceMark(membership.companyName)}
        </Text>
      </View>
      <View style={styles.main}>
        <Text style={[styles.name, { color: colors.fgStrong }]} numberOfLines={1}>
          {membership.companyName}
        </Text>
        {/* The slug is the only tenant identifier ever shown to a user — it
            disambiguates same-named companies. tenantId is never rendered. */}
        <Text style={[styles.slug, { color: colors.fgMuted }]} numberOfLines={1}>
          {membership.tenantSlug}
        </Text>
      </View>
      <Text style={{ color: colors.fgMuted }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  mark: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
  },
  slug: {
    fontSize: 11,
    marginTop: 1,
  },
});
