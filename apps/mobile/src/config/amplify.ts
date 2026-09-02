// AWS Amplify configuration for the mobile app.
//
// Mirrors apps/web/src/config/amplify.ts and points at the SAME Cognito user
// pool, so mobile inherits web's users, MFA settings and groups rather than
// becoming a second identity source to keep in sync.
//
// Two deliberate differences from web:
//
//  1. No `oauth` block. Web uses the Cognito hosted UI with redirects derived
//     from window.location.origin, which does not exist on native. This app
//     signs in with username/password directly against the user pool
//     (USER_SRP_AUTH), so no hosted UI, no redirect registration, and no
//     browser round-trip. Hosted UI can be added later — it needs
//     expo-web-browser plus `dispatch://` callbacks registered on the Cognito
//     app client, and the commented-out env vars in .env.example.
//
//  2. Polyfills. Amplify's crypto paths need react-native-get-random-values
//     installed before anything else touches them, so this import must stay
//     first and must not be reordered by a formatter.
import 'react-native-get-random-values';

import { Amplify } from 'aws-amplify';
import { cognitoUserPoolsTokenProvider } from 'aws-amplify/auth/cognito';
import { secureTokenStorage } from '../storage/secureTokenStorage';

const userPoolId = process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID;
const userPoolClientId = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID;

// Expo inlines EXPO_PUBLIC_* at build time, so a missing value is a build-time
// misconfiguration, not a runtime one. Fail loudly here rather than letting
// Amplify throw something opaque on the first sign-in attempt.
if (!userPoolId || !userPoolClientId) {
  throw new Error(
    'Missing Cognito configuration. Copy apps/mobile/.env.example to ' +
      'apps/mobile/.env, then restart Metro with `pnpm dev --clear` — env values ' +
      'are baked into the bundle, so a plain restart keeps serving the old ones.'
  );
}

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId,
      userPoolClientId,
      loginWith: { email: true },
    },
  },
});

// Keep tokens in the iOS Keychain / Android Keystore rather than Amplify's
// React Native default of AsyncStorage, which is plain text on disk.
//
// Must run after Amplify.configure — the token provider reads configuration when
// it is first used, and swapping storage beforehand has no configured provider
// to attach to.
//
// Switching storage strands any tokens previously written to AsyncStorage, so
// existing sessions are not carried over: everyone signs in once more after this
// ships. That is a one-time cost, and the orphaned values expire on their own.
cognitoUserPoolsTokenProvider.setKeyValueStorage(secureTokenStorage);
