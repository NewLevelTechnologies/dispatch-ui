// Web app API setup - configures the shared API client with Amplify auth
import { apiClient, setPublicApiBaseURL } from '@dispatch/api';
import { createAmplifyAuthProvider } from '@dispatch/api/src/amplifyAuthProvider';

// Point the shared clients at this build's API origin. The package defaults to
// the dev API, so without this a qa/prod bundle would silently talk to dev.
const baseURL = import.meta.env.VITE_API_BASE_URL;
if (baseURL) {
  apiClient.setBaseURL(baseURL);
  setPublicApiBaseURL(baseURL);
}

// Configure API client with shared Amplify auth provider
// (Same auth logic used by mobile app - same Cognito users, MFA, etc.)
apiClient.setAuthProvider(createAmplifyAuthProvider());

// Re-export the configured client and all API services. Deliberately no default
// export: callers must name what they want, since `apiClient` (authenticated)
// and `publicApiClient` (share-link) are easy to confuse.
export { apiClient };
export * from '@dispatch/api';
