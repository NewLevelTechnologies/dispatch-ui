import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '@dispatch/i18n';
import { useAuth } from '../../auth/AuthContext';
import { useTenant } from '../../tenant/TenantContext';
import { useTheme } from '../../theme/ThemeProvider';
import { AppHeader, Button, Card } from '../../components';
import { WorkspaceRow } from '../../tenant/WorkspaceRow';
import { MapsPreferenceCard } from '../../maps/MapsPreferenceCard';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { username, leave } = useAuth();
  const { memberships, activeMembership, switchTenant } = useTenant();
  const router = useRouter();

  const otherMemberships = memberships.filter((m) => m.tenantId !== activeMembership?.tenantId);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSunken }}>
      <AppHeader title={t('account.profile.title')} eyebrow={username ?? undefined} />
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        {activeMembership && (
          <Card title={t('workspace.menuLabel')}>
            <WorkspaceRow membership={activeMembership} onPress={() => {}} />
          </Card>
        )}

        {otherMemberships.length > 0 && (
          <Card title={t('workspace.switchAria')}>
            <View style={{ gap: spacing.sm }}>
              {otherMemberships.map((m) => (
                <WorkspaceRow key={m.tenantId} membership={m} onPress={switchTenant} />
              ))}
            </View>
          </Card>
        )}

        <MapsPreferenceCard />

        <Button
          label={t('myAvailability.title')}
          variant="secondary"
          onPress={() => router.push('/availability')}
        />

        {/* Dev convenience: Phase 0's component library has no permanent home
            of its own yet. Remove once there's a real settings surface to
            move it to. */}
        <Button
          label={t('styleGuide.title')}
          variant="ghost"
          onPress={() => router.push('/style-guide')}
        />

        <Button label={t('auth.signOut')} variant="secondary" onPress={leave} />

        {username && (
          <Text style={{ color: colors.fgMuted, fontSize: 11, textAlign: 'center' }}>
            {t('workspace.signedInAs', { email: username })}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
