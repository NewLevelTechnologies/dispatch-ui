import { View, Text, StyleSheet, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { tenantSettingsApi } from '../api/setup';
import { formatPhone } from '@dispatch/utils';
import { useTranslation } from '@dispatch/i18n';
import { useAuth } from '../auth/AuthContext';

export default function HomeScreen() {
  const { t } = useTranslation();
  const { username, leave } = useAuth();

  // /tenant-settings requires a bearer token. Reaching it at all is the proof
  // that the Cognito session is being attached to outbound requests — the
  // request carries no token of its own, the interceptor in @dispatch/api adds
  // one via the auth provider wired up in src/api/setup.ts.
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.getSettings(),
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('app.name')}</Text>
      <Text style={styles.signedInAs}>{t('app.signedInAs', { username: username ?? '—' })}</Text>

      {isLoading && <ActivityIndicator size="large" style={styles.spinner} />}

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>{t('app.couldNotLoadTenantSettings')}</Text>
          <Text style={styles.errorBody}>
            {error instanceof Error ? error.message : String(error)}
          </Text>
          <Text style={styles.errorHint}>{t('app.tokenErrorHint')}</Text>
        </View>
      )}

      {settings && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('app.authenticatedRequestSucceeded')}</Text>
          <Text style={styles.label}>{t('tenantSettings.title')}</Text>
          <Text style={styles.value}>{settings.companyName ?? '—'}</Text>
          <Text style={styles.label}>{t('common.form.phone')}</Text>
          <Text style={styles.value}>
            {settings.phone ? formatPhone(settings.phone) : '—'}
          </Text>
          <Text style={styles.label}>{t('common.form.timezone')}</Text>
          <Text style={styles.value}>{settings.timezone ?? '—'}</Text>
        </View>
      )}

      <Pressable style={styles.signOut} onPress={leave}>
        <Text style={styles.signOutText}>{t('auth.signOut')}</Text>
      </Pressable>

      <Text style={styles.hint}>{t('app.pocHint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 32 },
  title: { fontSize: 24, fontWeight: '700' },
  signedInAs: { fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 24 },
  spinner: { marginVertical: 24 },
  card: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 16, marginBottom: 24 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#15803d', marginBottom: 8 },
  label: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', marginTop: 8 },
  value: { fontSize: 16, fontWeight: '500' },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  errorTitle: { color: '#dc2626', fontWeight: '600', marginBottom: 6 },
  errorBody: { color: '#7f1d1d', marginBottom: 8 },
  errorHint: { color: '#9ca3af', fontSize: 13 },
  signOut: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  signOutText: { fontSize: 16, fontWeight: '600', color: '#374151' },
  hint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 24 },
});
