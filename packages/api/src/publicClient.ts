import axios from 'axios';

/**
 * Axios instance for the share-link public endpoints
 * (`/api/v1/public/invoices`, `/api/v1/public/quotes`).
 *
 * Critical differences from the authenticated `apiClient`:
 *   1. NO request interceptor → no `Authorization: Bearer …` JWT.
 *      The public endpoints are unauthenticated from the JWT/RLS
 *      perspective; auth is the `X-Share-Token` header attached
 *      per-call by the calling API service.
 *   2. NO 401-redirect response interceptor. A 401 here would
 *      mean "missing or unparseable token" and the caller should
 *      route the visitor to the cliff page, not log them out of
 *      an app they were never logged into.
 *
 * Keeps `baseURL` and JSON `Content-Type` in lockstep with the
 * authenticated client so any future env-var or API-version
 * change ripples through both.
 */
const publicApiClient = axios.create({
  baseURL: 'https://dev.api.dispatch.newleveltech.net/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Keep the public client's origin in lockstep with the authenticated one.
 * Called by platform-specific setup alongside `apiClient.setBaseURL()`.
 */
export function setPublicApiBaseURL(baseURL: string) {
  publicApiClient.defaults.baseURL = baseURL;
}

export default publicApiClient;
