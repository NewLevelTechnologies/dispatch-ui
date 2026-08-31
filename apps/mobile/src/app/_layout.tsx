import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Initialize the shared API client (sets base URL + auth provider).
import '../api/setup';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: true, title: 'Dispatch' }} />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
