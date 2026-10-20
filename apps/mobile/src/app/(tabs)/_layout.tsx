import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import type { ColorValue } from 'react-native';
import { useTranslation } from '@dispatch/i18n';
import { useTheme } from '../../theme/ThemeProvider';
import TenantGate from '../../tenant/TenantGate';

const ICONS: Record<string, string> = {
  index: '▣',
  schedule: '▦',
  lookup: '⌕',
  profile: '◍',
};

/**
 * Always-dark tab bar, matching AppHeader — same "Dashboard Continuity"
 * reasoning: web's sidebar is dark in both themes, so this is the one glance
 * that says "same product" every time the app opens.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    // Wraps the whole tab shell, not each screen individually — signed in is
    // not the same as being in a workspace, and nothing under here should
    // render (or fire a tenant-scoped request) until one is active.
    <TenantGate>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent500,
          tabBarInactiveTintColor: colors.barFgDim,
          tabBarStyle: { backgroundColor: colors.bar, borderTopColor: colors.bar },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t('nav.today'), tabBarIcon: ({ color }) => <TabIcon name="index" color={color} /> }}
        />
        <Tabs.Screen
          name="schedule"
          options={{
            title: t('nav.schedule'),
            tabBarIcon: ({ color }) => <TabIcon name="schedule" color={color} />,
          }}
        />
        <Tabs.Screen
          name="lookup"
          options={{ title: t('nav.lookup'), tabBarIcon: ({ color }) => <TabIcon name="lookup" color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('nav.profile'),
            tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} />,
          }}
        />
      </Tabs>
    </TenantGate>
  );
}

function TabIcon({ name, color }: { name: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 18 }}>{ICONS[name]}</Text>;
}
