import { useTranslation } from '@dispatch/i18n';

interface Props {
  /**
   * `invalid` (default) — the token isn't recognized (not found, expired,
   * or revoked). Same UX for all three intentionally — don't leak which.
   *
   * `error` — an unexpected error talking to the API. Same friendly
   * message, slightly different sub-line so support has a hook if a
   * customer reports it.
   */
  reason?: 'invalid' | 'error';
}

/**
 * Customer-facing landing for an unresolvable share link. Rendered when:
 *   - the token doesn't match any share-link row,
 *   - the link has expired (`expires_at < now()`),
 *   - the link has been revoked (`revoked_at IS NOT NULL`),
 *   - or the public endpoint errored out.
 *
 * No tenant branding here on purpose — we can't trust the token enough to
 * look up the tenant, and rendering "Acme HVAC" on a "link expired" page
 * for a customer of a different tenant would be wrong. Generic, neutral.
 *
 * v1 has no self-service "request a new link" affordance (§3 decision —
 * cut from v1, deferred to v2). Customer is directed to contact whoever
 * sent the link.
 */
export default function CliffPage({ reason = 'invalid' }: Props) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-zinc-900">
          {t('public.cliff.headline')}
        </h1>
        <p className="mt-4 text-zinc-600">
          {reason === 'error'
            ? t('public.cliff.error')
            : t('public.cliff.invalid')}
        </p>
        <p className="mt-2 text-zinc-600">{t('public.cliff.contact')}</p>
      </div>
    </div>
  );
}
