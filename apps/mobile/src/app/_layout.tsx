import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Initialize i18next from the shared package (same locales as web).
import '@dispatch/i18n';
// Initialize the shared API client (Amplify config, base URL, auth provider).
import '../api/setup';
import { AuthProvider, useAuth } from '../auth/AuthContext';
import { ThemeProvider } from '../theme/ThemeProvider';
import { TenantProvider } from '../tenant/TenantContext';

const queryClient = new QueryClient();

/**
 * Sends the user to sign-in or back to the app as auth state settles.
 *
 * The redirect lives in an effect rather than a conditional render because
 * expo-router needs the navigator mounted before it will accept a navigation —
 * redirecting during the first render silently does nothing.
 */
function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const onSignIn = segments[0] === 'sign-in';

    if (status === 'signedOut' && !onSignIn) router.replace('/sign-in');
    if (status === 'signedIn' && onSignIn) router.replace('/');
  }, [status, segments, router]);

  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: true, title: 'Dispatch' }}>
      {/* The tab shell and every detail screen draw their own chrome
          (AppHeader) — a native stack header on top of that would double up. */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="dispatch/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="work-order/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="availability" options={{ headerShown: false }} />
      <Stack.Screen name="style-guide" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <TenantProvider>
              <AuthGate />
              <StatusBar style="auto" />
            </TenantProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
