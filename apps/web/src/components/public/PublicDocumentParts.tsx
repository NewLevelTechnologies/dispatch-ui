import { useTranslation } from '@dispatch/i18n';
import type { PublicAdjustment, PublicLineItem, PublicPricing } from '../../api/setup';
import { CheckIcon } from '@heroicons/react/16/solid';

const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const formatPublicMoney = (value: number | string | null | undefined): string =>
  currencyFormatter.format(Number(value ?? 0) || 0);

const num = (value: string | number | null | undefined) => Number(value ?? 0) || 0;

const formatQuantity = (value: string | number): string => {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : String(value);
};

/** "Waived · Member", "15% off · Promotion", "$25.00 off · Courtesy". */
function useAdjustmentLabel() {
  const { t } = useTranslation();
  return (a: PublicAdjustment) => {
    const figure =
      a.kind === 'WAIVE'
        ? t('public.document.adjustment.waived')
        : a.kind === 'PERCENT'
          ? t('public.document.adjustment.percentOff', { percent: `${Math.round(num(a.value) * 1000) / 10}%` })
          : t('public.document.adjustment.amountOff', { amount: formatPublicMoney(a.value) });
    return `${figure} · ${t(`public.document.reason.${a.reasonCode}`)}`;
  };
}

/**
 * The document's lines as the customer sees them. A line with a saving shows
 * its list amount struck through, the amount after it, and why.
 */
export function PublicLineItems({ title, items }: { title: string; items: PublicLineItem[] }) {
  const label = useAdjustmentLabel();
  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm print:shadow-none">
      <h2 className="border-b border-zinc-100 px-6 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <ul className="divide-y divide-zinc-100">
        {items.map((item, idx) => {
          const saved = num(item.adjustmentAmount) > 0;
          const pres = item.presentation;
          const main = pres?.photos[0];
          return (
            <li key={idx} className="flex flex-col gap-1 px-6 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              {main && (
                <a href={main.url} target="_blank" rel="noreferrer" className="shrink-0">
                  <img src={main.thumbnailUrl} alt="" className="size-20 rounded-md border border-zinc-200 object-cover" />
                </a>
              )}
              <div className="min-w-0 flex-1">
                <p className={pres ? 'text-sm font-semibold text-zinc-900' : 'text-sm text-zinc-900'}>
                  {pres?.customerName || item.description}
                </p>
                {pres?.description && <p className="mt-1 text-sm text-zinc-600">{pres.description}</p>}
                {pres && pres.highlights.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-sm text-zinc-700">
                    {pres.highlights.map((h, i) => (
                      <li key={i} className="flex gap-1.5">
                        <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
                {pres && pres.photos.length > 1 && (
                  <div className="mt-2 flex gap-1.5">
                    {pres.photos.slice(1).map((ph, i) => (
                      <a key={i} href={ph.url} target="_blank" rel="noreferrer">
                        <img src={ph.thumbnailUrl} alt="" className="size-12 rounded border border-zinc-200 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatQuantity(item.quantity)} × {formatPublicMoney(item.unitPrice)}
                </p>
                {(item.adjustments ?? []).map((a, i) => (
                  <p key={i} className="mt-0.5 text-xs font-medium text-emerald-700">
                    {label(a)}
                  </p>
                ))}
              </div>
              <div className="text-sm sm:text-right">
                {saved && <div className="text-xs text-zinc-400 line-through">{formatPublicMoney(item.lineTotal)}</div>}
                <div className="font-medium text-zinc-900">
                  {formatPublicMoney(saved ? (item.netAmount ?? item.lineTotal) : item.lineTotal)}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Subtotal, savings and tax rows for the totals card, above its Total row.
 * The subtotal is the list total when there are savings, so the rows add up.
 */
export function PublicPricingRows({
  doc,
  subtotalLabel,
}: {
  doc: PublicPricing & { subtotal: string | null; taxAmount: string | null };
  subtotalLabel: string;
}) {
  const { t } = useTranslation();
  const label = useAdjustmentLabel();
  const saved = num(doc.adjustmentTotal);
  const taxLabel = doc.taxExempt
    ? t('public.document.taxExempt')
    : doc.taxJurisdictionName
      ? t('public.document.taxNamed', { name: doc.taxJurisdictionName })
      : t('public.document.tax');
  return (
    <>
      <div className="flex justify-between">
        <dt className="text-zinc-600">{subtotalLabel}</dt>
        <dd className="text-zinc-900">{formatPublicMoney(saved > 0 ? (doc.grossSubtotal ?? doc.subtotal) : doc.subtotal)}</dd>
      </div>
      {saved > 0 && (
        <div className="flex justify-between">
          <dt className="text-emerald-700">
            {t('public.document.youSave')}
            {(doc.documentAdjustments ?? []).map((a, i) => (
              <span key={i} className="block text-xs text-zinc-500">
                {`${label(a)} · −${formatPublicMoney(a.amount)}`}
              </span>
            ))}
          </dt>
          <dd className="font-medium text-emerald-700">−{formatPublicMoney(saved)}</dd>
        </div>
      )}
      {(num(doc.taxAmount) > 0 || doc.taxExempt) && (
        <div className="flex justify-between">
          <dt className="text-zinc-600">{taxLabel}</dt>
          <dd className="text-zinc-900">{formatPublicMoney(doc.taxAmount)}</dd>
        </div>
      )}
    </>
  );
}
