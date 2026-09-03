// Platform-agnostic API client
// Each platform (web/mobile) provides its own auth token via setAuthProvider()

import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';

export interface AuthTokenProvider {
  getAccessToken: () => Promise<string | null>;
}

/**
 * Supplies the tenant the caller is currently acting in.
 *
 * The JWT says *who*; this header says *which*. One person can hold a
 * membership in several tenants, so the token alone can no longer identify a
 * workspace. Sync by design: the value is read from browser storage or memory,
 * never fetched, and making it async would put an await in front of every
 * request for no gain.
 */
export interface TenantProvider {
  getActiveTenantId: () => string | null;
}

/**
 * Endpoints that must go out WITHOUT `X-Tenant-Id`.
 *
 * `/users/me/tenants` is the bootstrap call — it runs before a tenant has been
 * chosen and answers "which workspaces does this person belong to?". Sending a
 * stale or guessed tenant on it would be meaningless at best; the backend marks
 * it `@TenantOptional` for the same reason.
 *
 * Matched against the path only, so query strings and the configured baseURL
 * prefix don't defeat it.
 */
const TENANT_OPTIONAL_PATHS = ['/users/me/tenants'];

function isTenantOptional(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split('?')[0]?.replace(/\/+$/, '') ?? '';
  return TENANT_OPTIONAL_PATHS.some((p) => path === p || path.endsWith(p));
}

class ApiClient {
  private instance: AxiosInstance;
  private authProvider?: AuthTokenProvider;
  private tenantProvider?: TenantProvider;

  constructor(baseURL: string) {
    this.instance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      // Serialize array params as repeated keys (?id=a&id=b) instead of the
      // axios default of bracketed indexes (?id[]=a&id[]=b). Spring binds
      // List<T> @RequestParam from the repeated form.
      paramsSerializer: { indexes: null },
    });

    // Add auth interceptor
    this.instance.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        if (this.authProvider) {
          const token = await this.authProvider.getAccessToken();
          if (token && config.headers) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        // Every authenticated call names its tenant. Routing all of them
        // through this one interceptor is what keeps the app from shipping
        // half-migrated — a bare fetch/axios call would silently lose the
        // header and resolve against the legacy JWT claim instead.
        if (this.tenantProvider && config.headers && !isTenantOptional(config.url)) {
          const tenantId = this.tenantProvider.getActiveTenantId();
          if (tenantId) {
            config.headers['X-Tenant-Id'] = tenantId;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor — propagate errors so callers can show them.
    this.instance.interceptors.response.use(
      (response) => response,
      (error) => Promise.reject(error)
    );
  }

  // Set auth provider (called by platform-specific code)
  setAuthProvider(provider: AuthTokenProvider) {
    this.authProvider = provider;
  }

  // Set the active-tenant provider (called by platform-specific code).
  // Until one is installed, no `X-Tenant-Id` is sent and the backend falls back
  // to the legacy `custom:tenant_id` claim — which is exactly the behaviour
  // wanted before this rollout completes.
  setTenantProvider(provider: TenantProvider) {
    this.tenantProvider = provider;
  }

  // Point the client at a different API origin. Each app reads its own env
  // config (Vite's import.meta.env on web, native config on mobile) and calls
  // this — the package itself stays platform-agnostic.
  setBaseURL(baseURL: string) {
    this.instance.defaults.baseURL = baseURL;
  }

  // Expose axios methods.
  //
  // These mirror axios's own signatures rather than collapsing the return to a
  // concrete AxiosResponse<T>. Keeping `R` as a free type parameter matters:
  // callers (and vi.mocked(...) in tests) rely on being able to instantiate the
  // response type themselves, exactly as they could against a bare axios
  // instance. Hardcoding `Promise<AxiosResponse<T>>` here forces every test
  // mock to supply status/statusText/headers/config.
  //
  // The casts are internal only — axios resolves its return through a private
  // conditional type we can't name from outside the package.
  //
  // The `any` defaults below are deliberate and load-bearing: they are axios's
  // own defaults for these parameters. Narrowing them to `unknown` makes the
  // response type resolve concretely at every call site, which breaks
  // `vi.mocked(apiClient.get).mockResolvedValue({ data })` throughout the
  // consuming app's suite.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  get<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: AxiosRequestConfig<D>
  ): Promise<R> {
    return this.instance.get(url, config) as Promise<R>;
  }

  post<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>
  ): Promise<R> {
    return this.instance.post(url, data, config) as Promise<R>;
  }

  put<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>
  ): Promise<R> {
    return this.instance.put(url, data, config) as Promise<R>;
  }

  delete<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    config?: AxiosRequestConfig<D>
  ): Promise<R> {
    return this.instance.delete(url, config) as Promise<R>;
  }

  patch<T = any, R = AxiosResponse<T>, D = any>(
    url: string,
    data?: D,
    config?: AxiosRequestConfig<D>
  ): Promise<R> {
    return this.instance.patch(url, data, config) as Promise<R>;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

// Export singleton with a dev-environment default baseURL. Platform-specific
// code MUST call apiClient.setAuthProvider() and should call setBaseURL() with
// its own env config — otherwise every build talks to the dev API.
const apiClient = new ApiClient('https://dev.api.dispatch.newleveltech.net/api/v1');

export default apiClient;
export { apiClient, ApiClient };
