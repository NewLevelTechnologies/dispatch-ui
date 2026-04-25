/**
 * Extract the `message` field from an Axios-style API error response.
 * Returns undefined for non-API errors or responses without a message.
 */
export function getApiErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error) || !('response' in error)) return undefined;
  return (error as { response?: { data?: { message?: string } } }).response?.data?.message;
}
