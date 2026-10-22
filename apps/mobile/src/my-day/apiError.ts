/**
 * Reading the shape of an API failure. Ports the three selectors My day needs
 * from web's `apps/web/src/lib/toast.ts` — mobile has no toast layer, so the
 * extraction is split from the presentation and the caller decides how to say
 * it (an Alert, today).
 */

type Axiosish = { response?: { status?: number; data?: { message?: string; error?: string; code?: string | null } } };

function responseOf(err: unknown): Axiosish['response'] {
  return err instanceof Error && 'response' in err ? (err as Axiosish).response : undefined;
}

/** HTTP status, if this came back from the server at all. */
export function errorStatus(err: unknown): number | undefined {
  return responseOf(err)?.status;
}

/** The server's own error code, e.g. `DISPATCH_VERSION_CONFLICT`. */
export function errorCode(err: unknown): string | undefined {
  return responseOf(err)?.data?.code ?? undefined;
}

/** A genuine concurrent-edit collision rather than a generic failure. */
export function isConflict(err: unknown): boolean {
  return errorStatus(err) === 409;
}

/**
 * Server-authored prose for the user, if there is any. Controllers write
 * `message`; the JWT interceptor writes its human-readable half as `error`.
 * Falls back to the Error's own message, which at least names a network
 * failure rather than showing nothing.
 */
export function extractApiError(err: unknown): string | undefined {
  const data = responseOf(err)?.data;
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  if (err instanceof Error && err.message) return err.message;
  return undefined;
}
