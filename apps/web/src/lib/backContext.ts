// Back-context for links that leave a list.
//
// A detail page's "up" direction is dynamic — the same location is reached from
// a work order, a customer, the Locations list, search. The linking surface
// says where it came from with `from`, and carries that list's own query string
// in `back`, so the back-link returns the user to the queue they were working
// rather than a default view. The browser's back button stays independent of
// both.

/** Append the back-context a detail page reads: `?from=<surface>&back=<list query>`. */
export function withBackContext(path: string, from: string, listQuery: string): string {
  return `${path}?from=${from}${listQuery ? `&back=${encodeURIComponent(listQuery)}` : ''}`;
}

/**
 * Rebuild a list href from a `back` param. The value is only ever spliced in
 * after the `?`, so a hand-edited one can't redirect off `listPath`.
 */
export function resolveBack(listPath: string, back: string | null): string {
  return back ? `${listPath}?${back}` : listPath;
}
