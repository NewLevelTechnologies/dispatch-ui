/**
 * Extract the `message` field from an Axios-style API error response.
 * Returns undefined for non-API errors or responses without a message.
 */
export function getApiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('response' in error)) return undefined;
  return (error as { response?: { data?: { message?: string } } }).response?.data?.message;
}

/**
 * Extract the `code` field from an Axios-style API error response. Backend
 * returns a uniform `{ code, message }` shape on all custom exceptions
 * (e.g. `NO_RECIPIENT`, `NOT_SENDABLE_STATUS`, `RATE_LIMIT_EXCEEDED`,
 * `SHARE_LINK_REVOKED`). Prefer this over `getApiErrorMessage` whenever
 * a UX branch needs to behave differently per error class — branching on
 * a stable enum is more durable than parsing English message text.
 */
export function getApiErrorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('response' in error)) return undefined;
  return (error as { response?: { data?: { code?: string } } }).response?.data?.code;
}
