import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { tenantSettingsApi } from '../api/setup';
import { formatPhone } from '@dispatch/utils';

export default function HomeScreen() {
  const { data: settings, isLoading, error } = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: () => tenantSettingsApi.get(),
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dispatch Mobile</Text>

      {isLoading && <ActivityIndicator size="large" />}

      {error && (
        <Text style={styles.error}>
          API connection failed — check EXPO_PUBLIC_API_BASE_URL and auth token.
        </Text>
      )}

      {settings && (
        <View style={styles.card}>
          <Text style={styles.label}>Tenant</Text>
          <Text style={styles.value}>{settings.companyName ?? '—'}</Text>
          <Text style={styles.label}>Phone</Text>
          <Text style={styles.value}>
            {settings.companyPhone ? formatPhone(settings.companyPhone) : '—'}
          </Text>
        </View>
      )}

      <Text style={styles.hint}>
        This screen proves @dispatch/api and @dispatch/utils wire up from the
        monorepo. Replace it with real screens.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  card: { backgroundColor: '#f3f4f6', borderRadius: 8, padding: 16, width: '100%', marginBottom: 16 },
  label: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', marginTop: 8 },
  value: { fontSize: 16, fontWeight: '500' },
  error: { color: '#dc2626', textAlign: 'center', marginBottom: 16 },
  hint: { fontSize: 13, color: '#9ca3af', textAlign: 'center', marginTop: 24 },
});
