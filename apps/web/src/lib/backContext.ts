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

export type DocumentBackKind = 'quote' | 'invoice';

/**
 * A link out of a quote or invoice (to its customer, location or work order)
 * that the target page's back-link returns from: `from=quote|invoice`, the
 * document's id and its number for the label.
 */
export function withDocumentBack(path: string, kind: DocumentBackKind, id: string, number: string | null | undefined): string {
  const qs = new URLSearchParams({ from: kind, docId: id, ...(number ? { docNo: number } : {}) });
  return `${path}${path.includes('?') ? '&' : '?'}${qs.toString()}`;
}

/** The quote or invoice a page was opened from, or null. Only ever an in-app document path. */
export function documentBack(params: URLSearchParams): { kind: DocumentBackKind; href: string; number: string | null } | null {
  const from = params.get('from');
  const id = params.get('docId');
  if ((from !== 'quote' && from !== 'invoice') || !id) return null;
  return { kind: from, href: `/${from}s/${encodeURIComponent(id)}`, number: params.get('docNo') };
}
