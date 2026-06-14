// Attention-strip rules shared by the MULTI + SINGLE customer overviews. Pure
// logic (no JSX) so both can import without tripping react-refresh's
// component-only-export rule. The AttentionStrip *component* lives in
// MultiOverviewTab and is exported from there.
import type {
  AgreementSummaryResponse,
  CustomerArSummaryResponse,
  CustomerAgreementSummaryResponse,
} from '../../api';
import { formatDateShort, formatMoney } from './format';

export type AttentionItem = { key: string; title: string; sub: string; action: string; to: string };

// Whole days from now to a YYYY-MM-DD (or ISO) date. App-runtime clock is fine.
export function daysUntil(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

// Three rules, most-urgent first: AR 91+ past due (FIN-1), overdue PM visits
// (AG-1), then agreement renewals within 30 days (from the agreements list's
// termEnd). Quiet (returns []) when nothing fires — healthy accounts get a
// clean page, not a "nothing to do" stub. The summaries may be undefined while
// their queries load; those rules simply don't fire until the data arrives.
export function buildAttentionItems(
  agreements: AgreementSummaryResponse[],
  ar: CustomerArSummaryResponse | undefined,
  agreementSummary: CustomerAgreementSummaryResponse | undefined,
  customerId: string,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (ar && ar.days91Plus.amount > 0) {
    const n = ar.days91Plus.count;
    items.push({
      key: 'ar-91',
      title: `${formatMoney(ar.days91Plus.amount)} ${n === 1 ? 'invoice' : 'invoices'} 91+ days past due`,
      sub: ar.oldestPastDueInvoiceDate ? `oldest ${formatDateShort(ar.oldestPastDueInvoiceDate)}` : `${n} past due`,
      action: 'View',
      to: `/customers/${customerId}?tab=invoices`,
    });
  }

  if (agreementSummary && agreementSummary.overdueVisitCount > 0) {
    const n = agreementSummary.overdueVisitCount;
    items.push({
      key: 'overdue-visits',
      title: `${n} ${n === 1 ? 'visit' : 'visits'} overdue`,
      sub: 'PM obligations past due',
      action: 'View',
      to: `/customers/${customerId}?tab=agreements`,
    });
  }

  for (const a of agreements) {
    if (a.status !== 'ACTIVE' || !a.termEnd) continue;
    const days = daysUntil(a.termEnd);
    if (days != null && days > 0 && days < 30) {
      items.push({
        key: `renew-${a.id}`,
        title: `${a.name} renews in ${days} ${days === 1 ? 'day' : 'days'}`,
        sub: a.agreementNumber,
        action: 'Review',
        to: `/agreements/${a.id}?from=customer`,
      });
    }
  }
  return items;
}
