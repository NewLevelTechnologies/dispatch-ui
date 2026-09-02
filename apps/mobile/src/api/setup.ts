// Mobile app API setup — configures the shared API client with Cognito auth.
//
// Amplify must be configured before any request can carry a token, so the
// config module is imported for its side effect here rather than left to a
// screen to remember.
import './../config/amplify';

import { fetchAuthSession } from 'aws-amplify/auth';
import { apiClient } from '@dispatch/api';

// NOTE: the auth provider is defined here rather than imported from
// @dispatch/api/src/amplifyAuthProvider, even though the two are nearly
// identical. That is not duplication for its own sake:
//
// packages/api resolves its own aws-amplify instance, and pnpm does not link
// @aws-amplify/react-native under it (verified: MODULE_NOT_FOUND from that
// directory). Importing the shared provider would make Metro follow
// packages/api -> aws-amplify -> @aws-amplify/core's .native.js files ->
// require('@aws-amplify/react-native'), which cannot resolve from there. That
// is the exact failure that broke the iOS bundle in #379 and is why the barrel
// stopped re-exporting the Amplify provider in the first place.
//
// Defining it here resolves aws-amplify from apps/mobile, which does have the
// React Native bindings linked. It also matches the rule in the root CLAUDE.md:
// platform-specific auth setup belongs in the app, not the shared package.
apiClient.setAuthProvider({
  getAccessToken: async () => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.accessToken?.toString() ?? null;
    } catch {
      // Signed out, or the refresh token has expired. Returning null lets the
      // request go out unauthenticated and fail with a 401, which the UI can
      // handle — better than throwing from an interceptor.
      return null;
    }
  },
});

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
if (API_BASE_URL) {
  apiClient.setBaseURL(API_BASE_URL);
}

export { apiClient };
export * from '@dispatch/api';
