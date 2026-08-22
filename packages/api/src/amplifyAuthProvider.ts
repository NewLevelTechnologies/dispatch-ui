// Shared AWS Amplify auth provider for web and mobile
// Both platforms use the same Cognito backend with the same users, MFA, etc.

import type { AuthTokenProvider } from './client';

/**
 * Creates an auth token provider using AWS Amplify's fetchAuthSession.
 * Works on both web and React Native (Amplify v6+ automatically detects platform).
 *
 * Must be called after Amplify.configure() has been called in your app.
 */
export function createAmplifyAuthProvider(): AuthTokenProvider {
  return {
    getAccessToken: async () => {
      try {
        // Dynamic import to avoid issues if Amplify isn't configured yet
        const { fetchAuthSession } = await import('aws-amplify/auth');
        const session = await fetchAuthSession();
        return session.tokens?.accessToken?.toString() || null;
      } catch (error) {
        console.error('Error fetching auth session:', error);
        return null;
      }
    },
  };
}
