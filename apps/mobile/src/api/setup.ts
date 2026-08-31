// Mobile app API setup - configures the shared API client with secure token storage.
//
// TODO: Replace the placeholder auth provider with real authentication
// (e.g. Expo AuthSession + Cognito, or a custom login flow that stores
// tokens in SecureStore).

import { apiClient } from '@dispatch/api';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
if (API_BASE_URL) {
  apiClient.setBaseURL(API_BASE_URL);
}

apiClient.setAuthProvider({
  getAccessToken: async () => {
    return await SecureStore.getItemAsync('auth_token');
  },
});

export { apiClient };
export * from '@dispatch/api';
