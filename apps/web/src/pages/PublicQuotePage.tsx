import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import axios from 'axios';
import {
  publicFinancialApi,
  type PublicQuoteResponse,
  type PublicQuoteStatus,
} from '../api/setup';
import TenantBrandingHeader from '../components/TenantBrandingHeader';
import { publicNames } from '../components/public/publicNames';
import PublicPreviewBanner from '../components/PublicPreviewBanner';
import CliffPage from '../components/CliffPage';
import { Badge } from '../components/catalyst/badge';
import { PublicLineItems, PublicPricingRows } from '../components/public/PublicDocumentParts';
import { useScopedReferrerPolicy } from '../hooks/useScopedReferrerPolicy';

/**
 * Customer-facing read-only quote view, rendered when a customer clicks
 * the `View Quote` link from a send email. Route: `/p/quote/:token`.
 *
 * Mirrors `PublicInvoicePage` structure with a quote-shaped hero (total
 * amount + expiration date instead of balance + due date) and no payments
 * section. DECLINED / EXPIRED render with muted styling; ACCEPTED gets a
 * lime accent. A SENT quote can be approved here, for the revision shown.
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

type QuoteBadgeProps = { status: PublicQuoteStatus };

const QuoteStatusBadge = ({ status }: QuoteBadgeProps) => {
  const { t } = useTranslation();
  switch (status) {
    case 'ACCEPTED':
      return <Badge color="lime">{t('public.quote.status.accepted')}</Badge>;
    case 'DECLINED':
    case 'REJECTED':
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
  const names = publicNames();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-50 px-4 text-center">
      <div className="text-zinc-500">{t('public.quote.loading', names)}</div>
      {slow && (
        <>
          <div className="text-sm text-zinc-400">{t('public.common.slowLoad')}</div>
          <button
            type="button"
            onClick={onRetry}
            className="!text-sm !font-medium text-zinc-700 underline underline-offset-2 hover:text-zinc-900"
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
  const names = publicNames(data?.tenant);

  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // The customer signs by typing their name and confirming; the name is kept with the approval.
  const [approverName, setApproverName] = useState('');
  const [consent, setConsent] = useState(false);
  const approve = useMutation({
    mutationFn: () => publicFinancialApi.approveQuote(token, data?.quote.revision, approverName.trim()),
    onSuccess: (next) => {
      setConfirming(false);
      queryClient.setQueryData(['publicQuote', token], next);
    },
    onError: (err) => {
      setConfirming(false);
      const code = axios.isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
      const sender = data?.tenant.displayName ?? t('public.common.theSender');
      if (code === 'QUOTE_REVISION_STALE') setNotice(t('public.quote.revisionStale', names));
      else if (code === 'QUOTE_NOT_APPROVABLE') setNotice(t('public.quote.notApprovable', { ...names, tenant: sender }));
      else setNotice(t('public.quote.approveError'));
      if (code === 'QUOTE_REVISION_STALE' || code === 'QUOTE_NOT_APPROVABLE') void refetch();
    },
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
  const isDeclined = quote.status === 'DECLINED';
  const canSign = approverName.trim().length > 0 && approverName.trim().length <= 120 && consent;
  const senderName = tenant.displayName ?? t('public.common.theSender');
  // The office's preview shows the page but never takes an approval.
  const approvable = quote.status === 'SENT' && !quote.beingUpdated && !data.preview;

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      {data.preview && <PublicPreviewBanner customer={customer.name} />}
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10 print:max-w-none print:p-0">
        <TenantBrandingHeader tenant={tenant} />

        {/* While the office revises a sent quote the server withholds the
            money and lines; nothing here can be approved until it's re-sent. */}
        {quote.beingUpdated ? (
          <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm print:shadow-none">
            <p className="text-xs uppercase tracking-wide text-zinc-500">{t('public.quote.label', names)}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">#{quote.quoteNumber}</p>
            <p className="mt-6 text-base font-semibold text-zinc-900">{t('public.quote.beingUpdated', names)}</p>
            <p className="mt-1 text-sm text-zinc-600">
              {t('public.quote.beingUpdatedBody', { ...names, tenant: senderName })}
            </p>
          </section>
        ) : (
          <>
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
                {t('public.quote.label', names)}
              </p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">
                #{quote.quoteNumber}
              </p>
              {quote.title && <p className="mt-0.5 text-sm text-zinc-700">{quote.title}</p>}
            </div>
            <QuoteStatusBadge status={data.preview && quote.status === 'DRAFT' ? 'SENT' : quote.status} />
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-zinc-500">
              {t('public.quote.total')}
            </p>
            {/* An expired quote's amounts stay readable but muted: they may no longer hold. */}
            <p className={`mt-1 text-4xl font-bold tracking-tight ${isExpired ? 'text-zinc-400' : 'text-zinc-900'}`}>
              {formatMoney(quote.totalAmount)}
            </p>
            {!isAccepted && !isDeclined && !isExpired && (
              <p className="mt-1 text-sm text-zinc-600">
                {t('public.quote.validThrough', { date: formatDate(quote.expirationDate) })}
              </p>
            )}
          </div>
          {isExpired && (
            <div className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {t('public.quote.expiredBody', { ...names, date: formatDate(quote.expirationDate), tenant: senderName })}
            </div>
          )}
          {isDeclined && (
            <div className="mt-4 rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-700">
              <p className="font-semibold">
                {quote.decidedAt ? t('public.quote.declinedOn', { date: formatDate(quote.decidedAt) }) : t('public.quote.declined')}
              </p>
              <p className="mt-0.5">{t('public.quote.declinedBody', { tenant: senderName })}</p>
            </div>
          )}

          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-zinc-100 pt-4 text-sm">
            <div>
              <dt className="text-zinc-500">{t('public.quote.quotedTo')}</dt>
              <dd className="mt-0.5 text-zinc-900">{customer.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">{t('public.quote.quoteDate', names)}</dt>
              <dd className="mt-0.5 text-zinc-900">
                {formatDate(quote.quoteDate)}
              </dd>
            </div>
          </dl>

          {notice && (
            <p role="status" className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {notice}
            </p>
          )}
          {isAccepted && (
            <div className="mt-4 rounded-md bg-lime-50 px-3 py-2 text-sm text-lime-900">
              <p className="font-semibold">
                {quote.decidedAt && quote.approvedByName
                  ? t('public.quote.approvedOnBy', { date: formatDate(quote.decidedAt), name: quote.approvedByName })
                  : quote.decidedAt
                    ? t('public.quote.approvedOn', { date: formatDate(quote.decidedAt) })
                    : t('public.quote.approved', names)}
              </p>
              <p className="mt-0.5">{t('public.quote.approvedBody', { tenant: senderName })}</p>
            </div>
          )}
          {approvable && (
            <div className="mt-5 print:hidden">
              {confirming ? (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-semibold text-zinc-900">
                    {t('public.quote.approveTitle', { ...names, number: quote.quoteNumber, total: formatMoney(quote.totalAmount) })}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600">{t('public.quote.approveBody', { tenant: senderName })}</p>
                  <label className="mt-3 block text-sm font-medium text-zinc-900" htmlFor="approver-name">
                    {t('public.quote.approverName')}
                  </label>
                  <input
                    id="approver-name"
                    autoFocus
                    autoComplete="name"
                    maxLength={120}
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    placeholder={t('public.quote.approverNamePlaceholder')}
                    className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 !text-base text-zinc-900 focus:border-zinc-500 focus:outline-none sm:!text-sm"
                  />
                  <label className="mt-3 flex items-start gap-2 text-sm text-zinc-800">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5 size-4 rounded border-zinc-300"
                    />
                    <span>{t('public.quote.approveConsent', { ...names, number: quote.quoteNumber, total: formatMoney(quote.totalAmount) })}</span>
                  </label>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={approve.isPending || !canSign}
                      onClick={() => approve.mutate()}
                      className="rounded-md bg-zinc-900 px-4 py-2 !text-sm !font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
                    >
                      {approve.isPending ? t('public.quote.approving') : t('public.quote.approveConfirm')}
                    </button>
                    <button
                      type="button"
                      disabled={approve.isPending}
                      onClick={() => setConfirming(false)}
                      className="rounded-md px-4 py-2 !text-sm !font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      {t('public.quote.approveCancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setConfirming(true);
                  }}
                  className="w-full rounded-md bg-zinc-900 px-4 py-3 !text-base !font-semibold text-white hover:bg-zinc-800 sm:w-auto"
                >
                  {t('public.quote.approve', names)}
                </button>
              )}
            </div>
          )}
        </section>

        <PublicLineItems title={t('public.quote.items')} items={quote.lineItems} />

        <section className="mt-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm print:shadow-none">
          <dl className="space-y-2 text-sm">
            <PublicPricingRows doc={quote} subtotalLabel={t('public.quote.subtotal')} />
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
          </>
        )}

        {(tenant.supportPhone || tenant.supportEmail) && (
          <footer className="mt-8 text-center text-sm text-zinc-500 print:mt-4">
            <p>{t('public.quote.questions', names)}</p>
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
