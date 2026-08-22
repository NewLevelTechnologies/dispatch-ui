import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  paymentsApi,
  type CreatePaymentRequest,
  type Invoice,
  type PaymentMethod as PaymentMethodType,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
import { invalidateLocationInvoiceCaches } from '../lib/invalidateFinancialCaches';
import { Button } from './catalyst/button';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from './catalyst/dialog';
import {
  Field,
  FieldGroup,
  Fieldset,
  Label,
} from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { Text } from './catalyst/text';
import { Textarea } from './catalyst/textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  workOrderNumber: string;
  customerName: string;
  /**
   * All open invoices on this WO (balanceDue > 0). Used to populate the
   * picker when no specific invoice is locked.
   */
  openInvoices: Invoice[];
  /**
   * When provided, the dialog hides the invoice picker and locks to this
   * invoice. Used by the row-level + Payment entry point — the CSR already
   * specified the target by clicking the row, no need to disambiguate.
   * When absent, the picker is shown (tab-level + Record Payment entry).
   */
  lockedInvoice?: Invoice;
}

// Same set the backend accepts (PaymentMethod union in financialApi).
const METHOD_OPTIONS: PaymentMethodType[] = [
  'CASH',
  'CHECK',
  'CREDIT_CARD',
  'DEBIT_CARD',
  'ACH',
  'WIRE_TRANSFER',
  'OTHER',
];

const todayIso = () => new Date().toISOString().slice(0, 10);

const amt = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * Record-a-payment dialog (Phase 7 §4.4). Two entry points, one component:
 *
 *   - Invoices tab header + Record Payment → `lockedInvoice` absent →
 *     picker visible; covers the "customer on the phone, I'm paying $X
 *     on this job" flow.
 *
 *   - Invoice row expansion + Payment → `lockedInvoice` provided → picker
 *     hidden, shown as read-only context; covers the "looking at this
 *     invoice, recording its payment" flow.
 *
 * Amount auto-fills to the selected invoice's `balanceDue` (pay-in-full
 * is the common case). CSR can override for partial. No validation
 * enforcing `amount ≤ balanceDue` — overpayment is allowed, accounting
 * resolves it.
 */
export default function PaymentDialog({
  open,
  onClose,
  workOrderId,
  workOrderNumber,
  customerName,
  openInvoices,
  lockedInvoice,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const paymentLabel = getName('payment');
  const invoiceLabel = getName('invoice');
  const invoicesLabel = getName('invoice', true);
  const workOrderLabel = getName('work_order');
  const queryClient = useQueryClient();

  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethodType>('CHECK');
  const [amount, setAmount] = useState<string>('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever the dialog opens. State that needs to depend on
  // the locked invoice / first picker option is set after the open flips.
  useEffect(() => {
    if (!open) return;
    const target = lockedInvoice ?? openInvoices[0];
    /* eslint-disable react-hooks/set-state-in-effect -- standard form-init pattern */
    setSelectedInvoiceId(target?.id ?? '');
    setPaymentDate(todayIso());
    setMethod('CHECK');
    setAmount(target ? String(amt(target.balanceDue)) : '');
    setReferenceNumber('');
    setNotes('');
    setError(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, lockedInvoice, openInvoices]);

  // When the picker changes invoice, re-fill amount to that invoice's
  // balance (pay-in-full default).
  const handleInvoiceChange = (id: string) => {
    setSelectedInvoiceId(id);
    const inv = openInvoices.find((i) => i.id === id);
    if (inv) setAmount(String(amt(inv.balanceDue)));
  };

  const createMutation = useMutation({
    mutationFn: (request: CreatePaymentRequest) => paymentsApi.create(request),
    onSuccess: () => {
      // The nested-payments fold (ask #2 extended) means the invoice list
      // query carries payments now — invalidate both that and the summary.
      queryClient.invalidateQueries({ queryKey: ['workOrderInvoices', workOrderId] });
      queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
      invalidateLocationInvoiceCaches(queryClient);
      onClose();
    },
    onError: (e: unknown) => {
      const msg =
        e instanceof Error && 'response' in e
          ? (e as { response?: { data?: { message?: string } } }).response?.data
              ?.message
          : undefined;
      setError(
        msg ??
          t('workOrders.financialDrawer.paymentDialog.errorCreate', {
            entity: paymentLabel,
          }),
      );
    },
  });

  const activeInvoice =
    lockedInvoice ?? openInvoices.find((i) => i.id === selectedInvoiceId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInvoice) {
      setError(
        t('workOrders.financialDrawer.paymentDialog.noInvoiceSelected', {
          entity: invoiceLabel,
          payment: paymentLabel,
        }),
      );
      return;
    }
    const numeric = parseFloat(amount.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError(t('workOrders.financialDrawer.paymentDialog.invalidAmount'));
      return;
    }
    createMutation.mutate({
      // Bill-to customer comes from the invoice being paid — invoices can
      // be billed to a third party (warranty co, insurance) so the WO's
      // primary customer isn't always the right source. The future
      // dedicated payment-apply UI will source this the same way.
      customerId: activeInvoice.customerId,
      amount: numeric,
      // LocalDate (YYYY-MM-DD) per backend contract — not Instant.
      paymentDate,
      paymentMethod: method,
      referenceNumber: referenceNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      // Single application — full amount applied to the chosen invoice.
      // Backend supports N applications for split payments; the dialog
      // only constructs one for v1.
      applications: [
        { invoiceId: activeInvoice.id, amountApplied: numeric },
      ],
    });
  };

  const submitting = createMutation.isPending;
  const hasOpenInvoices = openInvoices.length > 0 || !!lockedInvoice;

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>
        {t('workOrders.financialDrawer.paymentDialog.title', {
          entity: paymentLabel,
        })}
      </DialogTitle>
      <DialogBody>
        {/* Locked context strip (§4.1 layout principle). Read-only context
            for the CSR, not a field. */}
        <div className="mb-3 rounded-md bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
          {t('workOrders.financialDrawer.paymentDialog.contextStrip', {
            workOrder: workOrderLabel,
            number: workOrderNumber,
            customer: customerName,
          })}
        </div>

        {!hasOpenInvoices ? (
          <Text className="!text-sm !text-zinc-500">
            {t('workOrders.financialDrawer.paymentDialog.noOpenInvoices', {
              entities: invoicesLabel,
              workOrder: workOrderLabel,
            })}
          </Text>
        ) : (
          <form onSubmit={handleSubmit}>
            <Fieldset>
              {/* Tighter vertical rhythm than Catalyst's default space-y-8
                  — CSR forms favor density (memory: feedback_form_density). */}
              <FieldGroup className="!space-y-3">
                {/* Invoice slot — picker when no lockedInvoice; read-only
                    line when locked. Same dialog, two entry-point modes. */}
                {lockedInvoice ? (
                  <Field>
                    <Label>
                      {t('workOrders.financialDrawer.paymentDialog.invoice', {
                        entity: invoiceLabel,
                      })}
                    </Label>
                    <div className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                      {lockedInvoice.invoiceNumber} ·{' '}
                      {t('workOrders.financialDrawer.paymentDialog.balanceLabel', {
                        amount: currencyFormatter.format(amt(lockedInvoice.balanceDue)),
                      })}
                    </div>
                  </Field>
                ) : (
                  <Field>
                    <Label>
                      {t('workOrders.financialDrawer.paymentDialog.invoice', {
                        entity: invoiceLabel,
                      })}
                    </Label>
                    <Select
                      name="invoice"
                      value={selectedInvoiceId}
                      onChange={(e) => handleInvoiceChange(e.target.value)}
                      required
                    >
                      {openInvoices.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.invoiceNumber} ·{' '}
                          {t(
                            'workOrders.financialDrawer.paymentDialog.balanceLabel',
                            {
                              amount: currencyFormatter.format(amt(inv.balanceDue)),
                            },
                          )}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>
                      {t('workOrders.financialDrawer.paymentDialog.paymentDate', {
                        entity: paymentLabel,
                      })}
                    </Label>
                    <Input
                      name="paymentDate"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      required
                    />
                  </Field>
                  <Field>
                    <Label>
                      {t('workOrders.financialDrawer.paymentDialog.method')}
                    </Label>
                    <Select
                      name="method"
                      value={method}
                      onChange={(e) => setMethod(e.target.value as PaymentMethodType)}
                      required
                    >
                      {METHOD_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {t(`workOrders.financialDrawer.paymentDialog.methods.${m}`)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field>
                  <Label>
                    {t('workOrders.financialDrawer.paymentDialog.amount')}
                  </Label>
                  <Input
                    name="amount"
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </Field>

                <Field>
                  <Label>
                    {t('workOrders.financialDrawer.paymentDialog.referenceNumber')}
                  </Label>
                  <Input
                    name="referenceNumber"
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    placeholder={t(
                      'workOrders.financialDrawer.paymentDialog.referencePlaceholder',
                    )}
                  />
                </Field>

                <Field>
                  <Label>{t('common.form.notes')}</Label>
                  <Textarea
                    name="notes"
                    rows={1}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </Field>
              </FieldGroup>
            </Fieldset>

            {error && (
              <div className="mt-3 text-sm text-rose-600 dark:text-rose-400">
                {error}
              </div>
            )}
          </form>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button
          color="dark/zinc"
          onClick={handleSubmit}
          disabled={!hasOpenInvoices || submitting}
        >
          {submitting
            ? t('common.saving')
            : t('workOrders.financialDrawer.paymentDialog.submit', {
                entity: paymentLabel,
              })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
