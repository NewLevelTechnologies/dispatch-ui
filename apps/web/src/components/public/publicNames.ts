import type { PublicTenantBranding } from '../../api/setup';
import { GLOSSARY_DEFAULTS } from '../../contexts/GlossaryContext';

/**
 * The tenant's names for what the public pages show, as i18n params. The
 * public pages have no glossary context (no login), so the names come with
 * the page's tenant block; before it loads, or where the tenant hasn't
 * renamed something, the defaults apply.
 */
export function publicNames(tenant?: PublicTenantBranding | null) {
  const name = (code: string, plural = false) => {
    const own = tenant?.glossary?.[code];
    const fallback = GLOSSARY_DEFAULTS[code];
    return (plural ? own?.plural : own?.singular)?.trim() || (plural ? fallback.plural : fallback.singular);
  };
  return {
    invoice: name('invoice'),
    payments: name('payment', true),
    quote: name('quote'),
  };
}
