import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AppHeader } from './AppHeader';

type PlaceholderScreenProps = {
  title: string;
  body: string;
};

/** A tab with a real header and tab-bar entry, but no screen built yet. */
export function PlaceholderScreen({ title, body }: PlaceholderScreenProps) {
  const { colors, spacing } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
      <AppHeader title={title} />
      <View style={[styles.body, { padding: spacing.xl }]}>
        <Text style={{ color: colors.fgMuted, textAlign: 'center' }}>{body}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
