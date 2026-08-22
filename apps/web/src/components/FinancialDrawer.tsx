import { useTranslation } from '@dispatch/i18n';
import { XMarkIcon } from '@heroicons/react/24/outline';
import FinancialInvoicesTab from './FinancialInvoicesTab';
import FinancialQuotesTab from './FinancialQuotesTab';
import { useGlossary } from '../contexts/GlossaryContext';
import { Button } from './catalyst/button';
import { SlideOver } from './catalyst/slideover';
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from './catalyst/tabs';
import { Text } from './catalyst/text';

export type FinancialTab = 'quotes' | 'purchaseOrders' | 'invoices';

// Chronological order matching WO lifecycle (§3.1):
//   1. Quote     — estimate-before-work (sometimes)
//   2. PO        — mid-job procurement (sometimes)
//   3. Invoice   — bill after work (always)
// Payments are NOT a sibling tab — per §3.3 they nest under each invoice's
// row expansion (1:N child relationship; recording-from-CSR-context flows
// through the invoice). The earlier 4-tab design with a Payments sibling
// was folded out 2026-05-14 to align with the structural model.
const TAB_ORDER: FinancialTab[] = ['quotes', 'purchaseOrders', 'invoices'];

interface Props {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  workOrderNumber: string;
  /**
   * Customer id required by the create-invoice POST body (§4.2). Lives on
   * the parent because the WO already has it; threading it down keeps the
   * tab components from re-fetching customer state.
   */
  customerId: string;
  /**
   * Customer name for the locked-context strip in the Payment / Invoice
   * dialogs (§4.1) — read-only contextual header, not a field.
   */
  customerName: string;
  /**
   * Tab to land on when the drawer opens. Chip-row click handlers set this
   * based on which chip was clicked (§3.2 routing). Defaults to `invoices` —
   * the live billable surface in 7a.
   *
   * Implemented via `key` remounting (not controlled `selectedIndex`) so the
   * user can switch tabs inside the drawer without parent re-renders fighting
   * the local selection. Each new value of `initialTab` from the parent
   * remounts the TabGroup with that tab as the default.
   */
  initialTab?: FinancialTab;
  /**
   * Monotonic signal: each increment triggers the Invoices tab to auto-open
   * its create dialog. Used by the chip-row `[+ Invoice]` ghost so a single
   * click both opens the drawer at the Invoices tab AND opens the create
   * dialog.
   */
  openInvoiceCreateSignal?: number;
  /**
   * Same signal pattern for the Quotes tab. Driven by the chip-row
   * `[+ Quote]` ghost.
   */
  openQuoteCreateSignal?: number;
}

/**
 * Right-edge slide-over (~800px) that hosts the WO's financial documents in
 * four tabs in WO-lifecycle order: Quotes · POs · Invoices · Payments.
 *
 * Tab content fills in as backend asks land:
 *   - Invoices read    → backend ask #2 (live)
 *   - Invoice create   → backend ask #6 (still pending; tab header CTA later)
 *   - Payments         → backend asks #3, #4 (pending)
 *   - Quotes           → 7b (backend asks #7–#10)
 *   - POs              → 7c (deferred)
 *
 * The `initialTab` prop lets the chip row land on the matching tab in one
 * click (e.g. `$ invoiced` → invoices, `$ paid` → payments).
 */
export default function FinancialDrawer({
  open,
  onClose,
  workOrderId,
  workOrderNumber,
  customerId,
  customerName,
  initialTab = 'invoices',
  openInvoiceCreateSignal,
  openQuoteCreateSignal,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const invoicesLabel = getName('invoice', true);
  const quotesLabel = getName('quote', true);
  const workOrderLabel = getName('work_order');

  return (
    <SlideOver open={open} onClose={onClose} className="!max-w-[960px]">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-950 dark:text-white">
          {t('workOrders.financialDrawer.title', {
            workOrder: workOrderLabel,
            number: workOrderNumber,
          })}
        </h2>
        <Button plain onClick={onClose} aria-label={t('common.close')}>
          <XMarkIcon className="size-5" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <TabGroup
          // Remount on initialTab change so the next chip click lands on the
          // requested tab without fighting any user-driven tab selection.
          key={initialTab}
          defaultIndex={TAB_ORDER.indexOf(initialTab)}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <TabList className="!gap-4 px-4">
            <Tab>{quotesLabel}</Tab>
            <Tab>{t('workOrders.financialDrawer.tabs.purchaseOrders')}</Tab>
            <Tab>{invoicesLabel}</Tab>
          </TabList>

          <TabPanels className="!mt-0 flex-1 overflow-y-auto p-4">
            <TabPanel>
              <FinancialQuotesTab
                workOrderId={workOrderId}
                workOrderNumber={workOrderNumber}
                customerId={customerId}
                customerName={customerName}
                openQuoteCreateSignal={openQuoteCreateSignal}
              />
            </TabPanel>
            <TabPanel>
              <ComingSoon
                tabLabel={t('workOrders.financialDrawer.tabs.purchaseOrders')}
                blockers={t('workOrders.financialDrawer.stubBlockers.purchaseOrders')}
              />
            </TabPanel>
            <TabPanel>
              <FinancialInvoicesTab
                workOrderId={workOrderId}
                workOrderNumber={workOrderNumber}
                customerId={customerId}
                customerName={customerName}
                openInvoiceCreateSignal={openInvoiceCreateSignal}
              />
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </div>
    </SlideOver>
  );
}

interface ComingSoonProps {
  tabLabel: string;
  blockers: string;
}

/**
 * Stub state for a tab whose data path hasn't landed yet. Honest copy ("not
 * built yet") beats a fake table or placeholder rows — see [[no-workaround
 * -recipes]]. The blockers line names the specific backend ask each tab
 * waits on, so a CSR who navigates here understands the timeline.
 */
function ComingSoon({ tabLabel, blockers }: ComingSoonProps) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
      <Text className="!text-base !font-medium !text-zinc-700 dark:!text-zinc-300">
        {tabLabel} — {t('workOrders.financialDrawer.comingSoon')}
      </Text>
      <Text className="!text-sm !text-zinc-500">{blockers}</Text>
    </div>
  );
}
