import { useTranslation } from '@dispatch/i18n';
import type { PublicTenantBranding } from '../api/setup';

interface Props {
  tenant: PublicTenantBranding;
}

/**
 * Sender-block header for the customer-facing public invoice / quote
 * pages. Logo (if present) + company name on top, mailing address below.
 * Every field is individually nullable — tenants that haven't configured
 * branding still get a working public page; this component renders only
 * what's present and collapses cleanly when nothing is.
 *
 * Intentionally narrow: no support email/phone here (that lives in the
 * page footer to keep the "questions" affordance below the document body,
 * matching customer expectations from utility / Stripe / Square invoices).
 */
export default function TenantBrandingHeader({ tenant }: Props) {
  const { t } = useTranslation();
  const addressLine1 = tenant.streetAddress?.trim() || null;
  const cityStateZip = [tenant.city, tenant.state, tenant.zipCode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ')
    .replace(/, (\w{2}), (\d{5})/, ', $1 $2'); // collapse "City, ST, 12345" → "City, ST 12345"
  const hasAddress = !!(addressLine1 || cityStateZip);

  // Nothing to show → render nothing rather than an empty header block.
  // Tenant pages can still render their document body cleanly.
  if (!tenant.logoUrl && !tenant.displayName && !tenant.companySlogan?.trim() && !hasAddress) {
    return null;
  }

  const logoAltName = tenant.displayName ?? t('public.common.theSender');

  return (
    <header className="flex flex-col items-center text-center print:items-start print:text-left">
      {tenant.logoUrl && (
        <img
          src={tenant.logoUrl}
          alt={t('public.common.logoAlt', { name: logoAltName })}
          className="mb-3 max-h-16 w-auto object-contain"
        />
      )}
      {tenant.displayName && (
        <h1 className="text-xl font-semibold text-zinc-900">
          {tenant.displayName}
        </h1>
      )}
      {tenant.companySlogan?.trim() && (
        <p className="mt-0.5 text-sm italic text-zinc-500">
          {tenant.companySlogan.trim()}
        </p>
      )}
      {hasAddress && (
        <address className="mt-1 not-italic text-sm text-zinc-600">
          {addressLine1 && <div>{addressLine1}</div>}
          {cityStateZip && <div>{cityStateZip}</div>}
        </address>
      )}
    </header>
  );
}
