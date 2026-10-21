// Compact overview — Money rail card. The payer + the same Accepted /
// Collected / Balance rollup as the Detailed layout, then the job's documents
// tabbed in one place: quotes, invoices, POs, and (cost-visible users only) the
// job's direct cost and margin.
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { ReceiptPercentIcon } from '@heroicons/react/16/solid';
import {
  laborRatesApi,
  type DispatchBoardRow,
  type Invoice,
  type PurchaseOrderListItem,
  type Quote,
  type WorkOrder,
  type WorkOrderFinancialSummary,
} from '../../../api/setup';
import { useGlossary } from '../../../contexts/GlossaryContext';
import { Card, CardBody, CardHead, CardTitle } from '../../../components/ui/Card';
import { Avatar } from '../../../components/ui/Avatar';
import { Pill, Tag } from '../../../components/ui/Pill';
import { Tabs } from '../../../components/ui/Tabs';
import { localDate } from '../../../components/work-items/format';
import { formatDocDate } from '../../../components/document/documentModel';
import { RollupStat } from '../WorkOrderOverview';
import { deriveJobCost, money, num } from '../overviewModel';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';
type MoneyTab = 'quotes' | 'invoices' | 'pos' | 'cost';

// Same tones as the Quotes & invoices tab and the Purchasing tab.
const QUOTE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'warning',
};
const INVOICE_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
  VOID: 'neutral',
};
const PO_TONE: Record<string, Tone> = {
  DRAFT: 'neutral',
  ORDERED: 'warning',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  BILLED: 'success',
  CANCELLED: 'neutral',
};

interface Props {
  workOrder: WorkOrder;
  summary?: WorkOrderFinancialSummary;
  quotes: Quote[];
  invoices: Invoice[];
  purchaseOrders: PurchaseOrderListItem[];
  /** Non-cancelled visits — on-site time feeds the labor cost. */
  visits: DispatchBoardRow[];
  /** Internal cost + margin (the Cost tab). */
  canSeeCost: boolean;
  onOpenDocuments: (tab: 'invoices' | 'quotes') => void;
}

export default function MoneyRailCard({
  workOrder,
  summary,
  quotes,
  invoices,
  purchaseOrders,
  visits,
  canSeeCost,
  onOpenDocuments,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const [tab, setTab] = useState<MoneyTab>(invoices.length > 0 ? 'invoices' : 'quotes');
  const customer = workOrder.customer;

  const tabs: { id: MoneyTab; label: string; count?: number }[] = [
    { id: 'quotes', label: getName('quote', true), count: quotes.length },
    { id: 'invoices', label: getName('invoice', true), count: invoices.length },
    { id: 'pos', label: t('workOrders.detail.compact.pos'), count: purchaseOrders.length },
  ];
  if (canSeeCost) tabs.push({ id: 'cost', label: t('workOrders.detail.compact.cost') });
  const active = tabs.some((x) => x.id === tab) ? tab : 'quotes';

  const empty =
    (active === 'quotes' && quotes.length === 0) ||
    (active === 'invoices' && invoices.length === 0) ||
    (active === 'pos' && purchaseOrders.length === 0);

  return (
    <Card>
      <CardHead>
        <CardTitle icon={<ReceiptPercentIcon className="size-3.5" />}>{t('workOrders.detail.overview.money')}</CardTitle>
        <span className="flex-1" />
        <button type="button" className="card-action" onClick={() => onOpenDocuments(active === 'quotes' ? 'quotes' : 'invoices')}>
          {t('workOrders.detail.compact.allDocuments')}
        </button>
      </CardHead>
      <CardBody>
        {customer && (
          <div className="mb-2.5 flex items-center gap-2.5 border-b border-border-soft pb-2.5">
            <Avatar name={customer.name} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="label-tiny">{t('workOrders.detail.overview.billsTo')}</div>
              <Link to={`/customers/${customer.id}`} className="block truncate text-[12.5px] font-semibold text-fg-strong hover:text-fg-accent">
                {customer.name}
              </Link>
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-1.5">
          <RollupStat
            label={t('workOrders.detail.overview.acceptedQuotes', { quotes: getName('quote', true) })}
            value={money(num(summary?.quotedAccepted))}
          />
          <RollupStat label={t('workOrders.detail.overview.collected')} value={money(num(summary?.paid))} tone="success" />
          <RollupStat label={t('workOrders.detail.money.balance')} value={money(num(summary?.balance))} emphasis />
        </div>
      </CardBody>

      <Tabs className="ovc-moneytabs" value={active} onChange={(id) => setTab(id as MoneyTab)} tabs={tabs} />

      <CardBody flush>
        {active === 'quotes' &&
          quotes.map((q) => (
            <DocRow
              key={q.id}
              href={`/quotes/${q.id}`}
              number={q.quoteNumber}
              status={<Pill tone={QUOTE_TONE[q.status] ?? 'neutral'} dot>{t(`quotes.status.${q.status.toLowerCase()}`)}</Pill>}
              amount={money(num(q.totalAmount))}
              sub={
                q.title ||
                (q.expirationDate
                  ? t('workOrders.detail.compact.expires', { date: formatDocDate(q.expirationDate, false) })
                  : null)
              }
            />
          ))}
        {active === 'invoices' &&
          invoices.map((i) => (
            <DocRow
              key={i.id}
              href={`/invoices/${i.id}`}
              number={i.invoiceNumber}
              status={<Pill tone={INVOICE_TONE[i.status] ?? 'neutral'} dot>{t(`invoices.status.${i.status.toLowerCase()}`)}</Pill>}
              amount={t('workOrders.detail.compact.due', { amount: money(num(i.balanceDue)) })}
              sub={t('workOrders.detail.compact.paidOf', {
                paid: money(num(i.amountPaid)),
                total: money(num(i.totalAmount)),
              })}
            />
          ))}
        {active === 'pos' &&
          purchaseOrders.map((po) => (
            <DocRow
              key={po.id}
              href={`/purchase-orders/${po.id}`}
              number={po.poNumber}
              status={<Pill tone={PO_TONE[po.status] ?? 'neutral'} dot>{t(`workOrders.workItems.poStatus.${po.status}`)}</Pill>}
              amount={money(num(po.totalCost))}
              sub={[
                po.vendorName,
                po.eta && t('workOrders.workItems.steps.eta', { date: localDate(po.eta) }),
              ]
                .filter(Boolean)
                .join(' · ')}
            />
          ))}
        {empty && <div className="px-3.5 py-3 text-[12px] text-fg-muted">{t('workOrders.workItems.noneYet')}</div>}
        {active === 'cost' && canSeeCost && (
          <CostBody visits={visits} purchaseOrders={purchaseOrders} invoices={invoices} />
        )}
      </CardBody>
    </Card>
  );
}

function DocRow({
  href,
  number,
  status,
  amount,
  sub,
}: {
  href: string;
  number: string;
  status: ReactNode;
  amount: string;
  sub?: string | null;
}) {
  return (
    <Link to={href} className="ovc-doc">
      <span className="font-mono text-[11.5px] font-semibold text-fg-strong">{number}</span>
      {status}
      <span />
      <span className="text-[12.5px] font-bold tabular-nums text-fg-strong">{amount}</span>
      {sub && <span className="ovc-docsub truncate">{sub}</span>}
    </Link>
  );
}

function CostBody({
  visits,
  purchaseOrders,
  invoices,
}: {
  visits: DispatchBoardRow[];
  purchaseOrders: PurchaseOrderListItem[];
  invoices: Invoice[];
}) {
  const { t } = useTranslation();
  // Loaded cost of a Regular hour (Pricing settings → Labor rates), else the
  // first active rate that has one.
  const { data: rates = [] } = useQuery({
    queryKey: ['labor-rates'],
    queryFn: () => laborRatesApi.getAll(),
  });
  const costed = rates.filter((r) => r.active && r.costRate != null);
  const rate = (costed.find((r) => r.role === 'REGULAR') ?? costed[0])?.costRate ?? null;
  const cost = deriveJobCost({ visits, laborCostRate: rate, purchaseOrders, invoices });
  const hours = Number(cost.hours.toFixed(1));

  return (
    <div className="px-3.5 pb-2.5 pt-1">
      <div className="flex items-center gap-1.5 pb-0.5 pt-1.5">
        <span className="card-sub">{t('workOrders.detail.compact.jobCostToDate')}</span>
        <Tag>{t('workOrders.detail.compact.internal')}</Tag>
      </div>
      <CostRow
        label={t('workOrders.detail.compact.laborHours', { hours })}
        sub={cost.labor == null ? t('workOrders.detail.compact.noCostRate') : undefined}
        value={cost.labor == null ? '—' : money(cost.labor)}
      />
      <CostRow label={t('workOrders.detail.compact.partsUsed')} value={money(cost.parts)} />
      <CostRow label={t('workOrders.detail.compact.directCost')} value={money(cost.direct)} strong />
      <CostRow label={t('workOrders.detail.compact.invoiced')} value={money(cost.invoiced)} />
      {cost.margin != null && (
        <div className="ovc-margin">
          <span>{t('workOrders.detail.compact.grossMargin')}</span>
          <span className="flex-1" />
          <span className={`font-bold tabular-nums ${cost.margin >= 50 ? 'text-success-500' : 'text-warning-fg'}`}>
            {cost.margin}%
          </span>
        </div>
      )}
    </div>
  );
}

function CostRow({ label, sub, value, strong }: { label: string; sub?: string; value: string; strong?: boolean }) {
  return (
    <div className="ovc-cost">
      <span className="min-w-0">
        <span className={`block ${strong ? 'font-semibold text-fg-strong' : 'text-fg'}`}>{label}</span>
        {sub && <span className="block text-[10.5px] text-fg-muted">{sub}</span>}
      </span>
      <span className={`tabular-nums text-fg-strong ${strong ? 'font-bold' : 'font-medium'}`}>{value}</span>
    </div>
  );
}
