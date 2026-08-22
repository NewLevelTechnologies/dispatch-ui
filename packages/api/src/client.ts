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

class ApiClient {
  private instance: AxiosInstance;
  private authProvider?: AuthTokenProvider;

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
