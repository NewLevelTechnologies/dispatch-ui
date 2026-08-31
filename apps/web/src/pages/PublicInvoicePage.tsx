import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import axios from 'axios';
import {
  publicFinancialApi,
  type PublicInvoiceResponse,
  type PublicInvoiceStatus,
  type PublicPaymentMethod,
} from '../api/setup';
import TenantBrandingHeader from '../components/TenantBrandingHeader';
import CliffPage from '../components/CliffPage';
import { Badge } from '../components/catalyst/badge';
import { useScopedReferrerPolicy } from '../hooks/useScopedReferrerPolicy';

/**
 * Customer-facing read-only invoice view, rendered when a customer clicks
 * the `View Invoice` link from a send email. Route: `/p/invoice/:token`.
 *
 * Design: card-style mobile-first hosted invoice (Phase 7 §6.1). Big
 * "Amount Due" hero, status badge, billed-to, line items, totals, sender
 * footer. `@media print` rules collapse the cards into a paper-style
 * document so customers can browser-print until v2 ships a real PDF
 * endpoint (§10 out-of-scope).
 *
 * Outside `AppLayout` and `GlossaryProvider` — this page is unauthenticated
 * and viewers don't share the tenant's glossary customization context.
 * Entity labels here are customer-facing and translated via i18n, not via
 * glossary (which is tenant-internal naming).
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

/**
 * Format a BigDecimal quantity string for display. Trim trailing zeros so
 * "1.00" reads as "1" and "1.50" as "1.5"; preserves meaningful precision
 * like "1.75". Customer-facing — they shouldn't see padding noise.
 */
const formatQuantity = (value: string | number): string => {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Number.isInteger(n) ? String(n) : String(n);
};

type InvoiceBadgeProps = { status: PublicInvoiceStatus };

const InvoiceStatusBadge = ({ status }: InvoiceBadgeProps) => {
  const { t } = useTranslation();
  switch (status) {
    case 'PAID':
      return <Badge color="lime">{t('public.invoice.status.paid')}</Badge>;
    case 'PARTIALLY_PAID':
      return (
        <Badge color="amber">{t('public.invoice.status.partiallyPaid')}</Badge>
      );
    case 'OVERDUE':
      return <Badge color="rose">{t('public.invoice.status.pastDue')}</Badge>;
    case 'CANCELLED':
      return <Badge color="zinc">{t('public.invoice.status.cancelled')}</Badge>;
    case 'SENT':
      return <Badge color="sky">{t('public.invoice.status.outstanding')}</Badge>;
    case 'DRAFT':
      return <Badge color="zinc">{t('public.invoice.status.draft')}</Badge>;
    case 'VOID':
      // Voided invoices show the loud full-width banner instead of a pill.
      return null;
    default:
      return null;
  }
};

type PaymentMethodProps = { method: PublicPaymentMethod };

const PaymentMethodLabel = ({ method }: PaymentMethodProps) => {
  const { t } = useTranslation();
  // i18n keys mirror the enum exactly so adding a new method on the
  // backend surfaces as a missing-key warning instead of silently falling
  // through to the raw `OTHER` literal.
  return <>{t(`public.invoice.paymentMethod.${method}`)}</>;
};

/**
 * Loading screen for the public invoice. After ~5s with no result it
 * surfaces a "taking longer than usual" note plus a manual retry, so a
 * viewer who hits a hard network stall on mobile has an escape hatch
 * instead of an indefinitely dead "Loading invoice…" screen.
 */
const InvoiceLoadingState = ({ onRetry }: { onRetry: () => void }) => {
  const { t } = useTranslation();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 px-4 text-center">
      <div className="text-zinc-500">{t('public.invoice.loading')}</div>
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

export default function PublicInvoicePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams<{ token: string }>();
  useScopedReferrerPolicy();

  const { data, isLoading, isError, error, refetch } = useQuery<
    PublicInvoiceResponse,
    unknown
  >({
    queryKey: ['publicInvoice', token],
    queryFn: ({ signal }) => publicFinancialApi.getInvoiceByToken(token, signal),
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
    return <InvoiceLoadingState onRetry={() => refetch()} />;
  }

  // 404 from the public endpoint (token not found / revoked / expired) is
  // the cliff. Any other error is surfaced as cliff too — leaking server
  // error details to a customer-facing page is worse than a friendly
  // "contact us" message.
  if (isError || !data) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    return <CliffPage reason={status === 404 ? 'invalid' : 'error'} />;
  }

  const { invoice, tenant, customer } = data;
  const isVoid = invoice.status === 'VOID';
  const isPaid = invoice.status === 'PAID';
  const isPastDue = invoice.status === 'OVERDUE';

  // "Contact <tenant>" / void subline both want a sender name. When the
  // tenant hasn't configured branding, fall through to a neutral phrase.
  const senderName = tenant.displayName ?? t('public.common.theSender');

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      {isVoid && (
        <div className="bg-rose-600 px-4 py-4 text-center text-white print:bg-white print:text-rose-700">
          <p className="text-lg font-semibold sm:text-xl">
            {t('public.invoice.voidedHeadline')}
          </p>
          <p className="mt-0.5 text-sm text-rose-100 print:text-rose-700">
            {t('public.invoice.voidedSubline', { tenant: senderName })}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10 print:max-w-none print:p-0">
        <TenantBrandingHeader tenant={tenant} />

        {/* Hero card — invoice number, status, amount due, due date.
            The single most-asked question gets the most prominent answer. */}
        <section
          className={`mt-6 rounded-lg border bg-white p-6 shadow-sm print:border-zinc-300 print:shadow-none ${
            isPastDue
              ? 'border-rose-200'
              : isPaid
              ? 'border-lime-200'
              : 'border-zinc-200'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">
                {t('public.invoice.label')}
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                #{invoice.invoiceNumber}
              </p>
            </div>
            <InvoiceStatusBadge status={invoice.status} />
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {isPaid
                ? t('public.invoice.amountPaid')
                : t('public.invoice.amountDue')}
            </p>
            <p
              className={`mt-1 text-4xl font-bold tracking-tight ${
                isPastDue ? 'text-rose-700' : 'text-zinc-900'
              }`}
            >
              {isPaid
                ? formatMoney(invoice.totalAmount)
                : formatMoney(invoice.balanceDue)}
            </p>
            {!isPaid && (
              <p
                className={`mt-1 text-sm ${
                  isPastDue ? 'text-rose-700' : 'text-zinc-600'
                }`}
              >
                {t('public.invoice.dueOn', {
                  date: formatDate(invoice.dueDate),
                })}
              </p>
            )}
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-zinc-100 pt-4 text-sm">
            <div>
              <dt className="text-zinc-500">{t('public.invoice.billedTo')}</dt>
              <dd className="mt-0.5 text-zinc-900">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">
                {t('public.invoice.invoiceDate')}
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {formatDate(invoice.invoiceDate)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Line items. Mobile collapses the table into stacked rows via
            per-row flex; desktop uses a real table. */}
        <section className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm print:shadow-none">
          <h2 className="border-b border-zinc-100 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {t('public.invoice.items')}
          </h2>
          <ul className="divide-y divide-zinc-100">
            {invoice.lineItems.map((item, idx) => (
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

        {/* Totals card. Right-aligned values, balance bolded. */}
        <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm print:shadow-none">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-600">{t('public.invoice.subtotal')}</dt>
              <dd className="text-zinc-900">{formatMoney(invoice.subtotal)}</dd>
            </div>
            {Number(invoice.taxAmount) > 0 && (
              <div className="flex justify-between">
                <dt className="text-zinc-600">
                  {Number(invoice.taxRate) > 0
                    ? t('public.invoice.taxWithRate', { rate: invoice.taxRate })
                    : t('public.invoice.tax')}
                </dt>
                <dd className="text-zinc-900">{formatMoney(invoice.taxAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-100 pt-2">
              <dt className="font-medium text-zinc-900">
                {t('public.invoice.total')}
              </dt>
              <dd className="font-medium text-zinc-900">
                {formatMoney(invoice.totalAmount)}
              </dd>
            </div>
            {Number(invoice.amountPaid) > 0 && (
              <div className="flex justify-between">
                <dt className="text-zinc-600">{t('public.invoice.paid')}</dt>
                <dd className="text-zinc-900">
                  −{formatMoney(invoice.amountPaid)}
                </dd>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-200 pt-2 text-base">
              <dt className="font-semibold text-zinc-900">
                {t('public.invoice.balanceDue')}
              </dt>
              <dd
                className={`font-semibold ${
                  isPastDue ? 'text-rose-700' : 'text-zinc-900'
                }`}
              >
                {formatMoney(invoice.balanceDue)}
              </dd>
            </div>
          </dl>
        </section>

        {/* Optional notes from the CSR. Hide section entirely when blank. */}
        {invoice.notes && invoice.notes.trim() && (
          <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm print:shadow-none">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t('public.invoice.notes')}
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">
              {invoice.notes}
            </p>
          </section>
        )}

        {/* Payment history — shown only when payments exist. Voided rows
            stay visible (audit transparency) but get both a muted/struck
            row AND an explicit "Voided" pill — strikethrough alone is
            unreliable for color-blind viewers and on print. */}
        {invoice.payments.length > 0 && (
          <section className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm print:shadow-none">
            <h2 className="border-b border-zinc-100 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t('public.invoice.paymentsReceived')}
            </h2>
            <ul className="divide-y divide-zinc-100">
              {invoice.payments.map((payment, idx) => {
                const isVoidedPayment = payment.status === 'VOID';
                return (
                  <li
                    key={idx}
                    className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6"
                  >
                    <div
                      className={`min-w-0 flex-1 ${
                        isVoidedPayment ? 'text-zinc-400 line-through' : ''
                      }`}
                    >
                      <p className="text-sm">{formatDate(payment.paymentDate)}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        <PaymentMethodLabel method={payment.method} />
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <div
                        className={`text-sm sm:text-right ${
                          isVoidedPayment ? 'text-zinc-400 line-through' : ''
                        }`}
                      >
                        {formatMoney(payment.amount)}
                      </div>
                      {isVoidedPayment && (
                        <Badge color="zinc">
                          {t('public.invoice.paymentVoided')}
                        </Badge>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Footer — questions / contact. Same info as the header so customers
            don't have to scroll back up to find the phone number. Hide the
            whole block when the tenant has no contact info at all. */}
        {(tenant.supportPhone || tenant.supportEmail) && (
          <footer className="mt-8 text-center text-sm text-zinc-500 print:mt-4">
            <p>{t('public.invoice.questions')}</p>
            <p className="mt-1 text-zinc-700">
              {t('public.invoice.contactCta', { tenant: senderName })}
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
