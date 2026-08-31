import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import axios from 'axios';
import {
  publicFinancialApi,
  type PublicQuoteResponse,
  type PublicQuoteStatus,
} from '../api/setup';
import TenantBrandingHeader from '../components/TenantBrandingHeader';
import CliffPage from '../components/CliffPage';
import { Badge } from '../components/catalyst/badge';
import { useScopedReferrerPolicy } from '../hooks/useScopedReferrerPolicy';

/**
 * Customer-facing read-only quote view, rendered when a customer clicks
 * the `View Quote` link from a send email. Route: `/p/quote/:token`.
 *
 * Mirrors `PublicInvoicePage` structure with a quote-shaped hero (total
 * amount + expiration date instead of balance + due date) and no payments
 * section. REJECTED / EXPIRED / CANCELLED render with muted styling;
 * ACCEPTED gets a lime accent. No customer-side accept/decline affordance
 * in v1 (out of scope — quote responses are a phone call today).
 */

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const formatMoney = (value: number | string | null | undefined): string =>
  currencyFormatter.format(Number(value ?? 0) || 0);

const formatDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

const formatQuantity = (value: string | number): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Number.isInteger(n) ? String(n) : String(n);
};

type QuoteBadgeProps = { status: PublicQuoteStatus };

const QuoteStatusBadge = ({ status }: QuoteBadgeProps) => {
  const { t } = useTranslation();
  switch (status) {
    case 'ACCEPTED':
      return <Badge color="lime">{t('public.quote.status.accepted')}</Badge>;
    case 'REJECTED':
      // Customer-facing label stays "Declined" — gentler than "Rejected"
      // on a document the customer themselves may have declined.
      return <Badge color="zinc">{t('public.quote.status.declined')}</Badge>;
    case 'CANCELLED':
      return <Badge color="zinc">{t('public.quote.status.cancelled')}</Badge>;
    case 'EXPIRED':
      return <Badge color="amber">{t('public.quote.status.expired')}</Badge>;
    case 'SENT':
      return <Badge color="sky">{t('public.quote.status.pending')}</Badge>;
    case 'DRAFT':
      return <Badge color="zinc">{t('public.quote.status.draft')}</Badge>;
    default:
      return null;
  }
};

/**
 * Loading screen for the public quote. After ~5s with no result it surfaces
 * a "taking longer than usual" note plus a manual retry, mirroring the public
 * invoice page — an escape hatch if a hard stall slips past the automatic
 * page-show revalidation below.
 */
const QuoteLoadingState = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 px-4 text-center">
      <div className="text-zinc-500">{t('public.quote.loading')}</div>
      {slow && (
        <>
          <div className="text-sm text-zinc-400">{t('public.common.slowLoad')}</div>
          <button
            type="button"
            onClick={onRetry}
            className="text-sm font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
          >
            {t('public.common.retry')}
          </button>
        </>
      )}
    </div>
  );
};

export default function PublicQuotePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams<{ token: string }>();
  useScopedReferrerPolicy();

  const { data, isLoading, isError, error, refetch } = useQuery<
    PublicQuoteResponse,
    unknown
  >({
    queryKey: ['publicQuote', token],
    queryFn: ({ signal }) => publicFinancialApi.getQuoteByToken(token, signal),
    enabled: !!token,
    // A real 404 means the token is revoked/expired — that's the cliff, so
    // bail immediately rather than spinning through retries. Other failures
    // (genuinely flaky networks) get a couple of backed-off retries.
    retry: (failureCount, err) => {
      if (axios.isAxiosError(err) && err.response?.status === 404) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // Mail's in-app browser (SFSafariViewController) prewarms this page: the
  // initial request fires and completes during the prewarm pass — the
  // response is visible in the network log — but its result never reaches
  // the live page that gets shown to the customer, so React Query is stuck
  // in 'loading' with nothing to render. Re-issuing the request from the
  // live page fixes it every time (that's exactly what the manual "Try
  // again" button does). Automate it: revalidate as soon as the page is
  // actually shown/visible, plus a one-shot right after it settles, so the
  // customer never has to tap. We tear the listeners down once data arrives.
  useEffect(() => {
    if (!token || data) return;
    const revalidate = () => {
      if (document.visibilityState === 'visible') refetch();
    };
    window.addEventListener('pageshow', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    const settleId = window.setTimeout(revalidate, 600);
    return () => {
      window.removeEventListener('pageshow', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
      window.clearTimeout(settleId);
    };
  }, [token, data, refetch]);

  if (!token) {
    return <CliffPage />;
  }

  if (isLoading) {
    return <QuoteLoadingState onRetry={() => refetch()} />;
  }

  if (isError || !data) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    return <CliffPage reason={status === 404 ? 'invalid' : 'error'} />;
  }

  const { quote, tenant, customer } = data;
  const isAccepted = quote.status === 'ACCEPTED';
  const isExpired = quote.status === 'EXPIRED';
  const senderName = tenant.displayName ?? t('public.common.theSender');

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10 print:max-w-none print:p-0">
        <TenantBrandingHeader tenant={tenant} />

        {/* Hero card — quote number, status, total. Expiration is the
            secondary line (customers care about "is this still good?"). */}
        <section
          className={`mt-6 rounded-lg border bg-white p-6 shadow-sm print:border-zinc-300 print:shadow-none ${
            isAccepted
              ? 'border-lime-200'
              : isExpired
              ? 'border-amber-200'
              : 'border-zinc-200'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {t('public.quote.label')}
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                #{quote.quoteNumber}
              </p>
            </div>
            <QuoteStatusBadge status={quote.status} />
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {t('public.quote.total')}
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-zinc-900">
              {formatMoney(quote.totalAmount)}
            </p>
            <p
              className={`mt-1 text-sm ${
                isExpired ? 'text-amber-700' : 'text-zinc-600'
              }`}
            >
              {isExpired
                ? t('public.quote.expiredOn', {
                    date: formatDate(quote.expirationDate),
                  })
                : t('public.quote.validThrough', {
                    date: formatDate(quote.expirationDate),
                  })}
            </p>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-zinc-100 pt-4 text-sm">
            <div>
              <dt className="text-zinc-500">{t('public.quote.quotedTo')}</dt>
              <dd className="mt-0.5 text-zinc-900">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t('public.quote.quoteDate')}</dt>
              <dd className="mt-0.5 text-zinc-900">
                {formatDate(quote.quoteDate)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm print:shadow-none">
          <h2 className="border-b border-zinc-100 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t('public.quote.items')}
          </h2>
          <ul className="divide-y divide-zinc-100">
            {quote.lineItems.map((item, idx) => (
              <li
                key={idx}
                className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-zinc-900">{item.description}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {formatQuantity(item.quantity)} × {formatMoney(item.unitPrice)}
                  </p>
                </div>
                <div className="text-sm font-medium text-zinc-900 sm:text-right">
                  {formatMoney(item.lineTotal)}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm print:shadow-none">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-600">{t('public.quote.subtotal')}</dt>
              <dd className="text-zinc-900">{formatMoney(quote.subtotal)}</dd>
            </div>
            {Number(quote.taxAmount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-zinc-600">
                  {Number(quote.taxRate) > 0
                    ? t('public.quote.taxWithRate', { rate: quote.taxRate })
                    : t('public.quote.tax')}
                </dt>
                <dd className="text-zinc-900">{formatMoney(quote.taxAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-200 pt-2 text-base">
              <dt className="font-semibold text-zinc-900">
                {t('public.quote.total')}
              </dt>
              <dd className="font-semibold text-zinc-900">
                {formatMoney(quote.totalAmount)}
              </dd>
            </div>
          </dl>
        </section>

        {quote.notes && quote.notes.trim() && (
          <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm print:shadow-none">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t('public.quote.notes')}
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {quote.notes}
            </p>
          </section>
        )}

        {(tenant.supportPhone || tenant.supportEmail) && (
          <footer className="mt-8 text-center text-sm text-zinc-500 print:mt-4">
            <p>{t('public.quote.questions')}</p>
            <p className="mt-1 text-zinc-700">
              {t('public.quote.contactCta', { tenant: senderName })}
              {tenant.supportPhone
                ? t('public.common.contactPhone', { phone: tenant.supportPhone })
                : ''}
              {tenant.supportEmail ? (
                <>
                  {' · '}
                  <a
                    href={`mailto:${tenant.supportEmail}`}
                    rel="noopener noreferrer"
                    className="text-sky-700 underline"
                  >
                    {tenant.supportEmail}
                  </a>
                </>
              ) : null}
            </p>
          </footer>
        )}
      </div>
    </div>
  );
}
