// The agreements list as CSV: every row the filters match, not just the page
// on screen, read a server page at a time and built in the browser.
import { agreementApi, type AgreementListRow, type ListAgreementsParams } from '../../api/setup';
import { csvLines } from '../reports/csv';

/** The server's page cap. */
const CHUNK = 200;

export async function fetchAllAgreements(params: ListAgreementsParams): Promise<AgreementListRow[]> {
  const rows: AgreementListRow[] = [];
  for (let page = 0; ; page++) {
    const res = await agreementApi.listPage({ ...params, page, size: CHUNK });
    rows.push(...res.content);
    if (page + 1 >= res.totalPages || res.content.length === 0) return rows;
  }
}

export interface CsvHeaders {
  number: string;
  name: string;
  plan: string;
  customer: string;
  status: string;
  locations: string;
  monthly: string;
  billingAmount: string;
  billingCadence: string;
  visitsCompleted: string;
  visitsPlanned: string;
  visitsBehind: string;
  nextVisit: string;
  nextWorkOrder: string;
  termEnd: string;
  autoRenew: string;
  endedOn: string;
}

/** Money columns only go out with the invoice capability, as on screen. */
export function agreementsCsv(
  rows: AgreementListRow[],
  h: CsvHeaders,
  opts: { showMoney: boolean; statusName: (s: AgreementListRow['status']) => string; yes: string; no: string },
): string {
  const money = (cells: (string | number | null)[]) => (opts.showMoney ? cells : []);
  return csvLines([
    [
      h.number,
      h.name,
      h.plan,
      h.customer,
      h.status,
      h.locations,
      ...money([h.monthly, h.billingAmount, h.billingCadence]),
      h.visitsCompleted,
      h.visitsPlanned,
      h.visitsBehind,
      h.nextVisit,
      h.nextWorkOrder,
      h.termEnd,
      h.autoRenew,
      h.endedOn,
    ],
    ...rows.map((a) => [
      a.agreementNumber,
      a.name,
      a.plan?.name ?? '',
      a.customer?.name ?? '',
      opts.statusName(a.status),
      a.coverageLocationCount,
      ...money([
        a.monthlyValue != null ? a.monthlyValue.toFixed(2) : '',
        a.billing ? a.billing.amount.toFixed(2) : '',
        a.billing ? `${a.billing.cadenceInterval} ${a.billing.cadenceUnit}` : '',
      ]),
      a.visitsThisTerm?.completed ?? '',
      a.visitsThisTerm?.planned ?? '',
      a.overdueVisitCount,
      a.nextVisit?.windowStart ?? '',
      a.nextVisit?.workOrderNumber ?? '',
      a.termEnd ?? '',
      a.autoRenew == null ? '' : a.autoRenew ? opts.yes : opts.no,
      a.endedOn ?? '',
    ]),
  ]);
}
