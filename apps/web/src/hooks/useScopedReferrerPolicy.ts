import { useEffect } from 'react';

/**
 * Inject a `<meta name="referrer">` element into `document.head` for the
 * lifetime of the mounted component, then remove it on unmount. Per
 * Phase 7 §7.3, the customer-facing public pages (`/p/invoice/:token`,
 * `/p/quote/:token`) need `Referrer-Policy: no-referrer` so the token
 * in the URL bar doesn't leak via `Referer` headers when the page has
 * outbound links (PDF download, Pay Now buttons in v2).
 *
 * Why not in `index.html`: a document-wide meta would force the policy
 * on the authenticated app too, which §7.3 explicitly avoids — the auth
 * app may need referrer-aware behavior later (OAuth redirects, marketing
 * integrations). Scoping per-mount keeps the policy local to the public
 * routes only.
 *
 * The proper enforcement is the CloudFront response-headers policy on
 * the `/p/*` behavior (§7.3 infra ask) — this hook is defense-in-depth
 * for the SPA hop, equivalent to the spec's "belt-and-suspenders" note.
 */
export function useScopedReferrerPolicy(policy: string = 'no-referrer'): void {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = policy;
    document.head.appendChild(meta);
    return () => {
      document.head.removeChild(meta);
    };
  }, [policy]);
}
