import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  invoicesApi,
  getApiErrorCode,
  getApiErrorMessage,
  type CreateInvoiceRequest,
  type CustomerSearchResult,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { invalidateLocationInvoiceCaches } from '../lib/invalidateFinancialCaches';
import CustomerPicker from './CustomerPicker';
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
import { Textarea } from './catalyst/textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  workOrderNumber: string;
  /**
   * The WO's primary customer (service recipient). Defaults the billing
   * customer in the picker so the common case is one-click. CSR can switch
   * to a different customer (e.g. a BILLING_ONLY warranty company) when
   * billing is routed to a third party.
   */
  defaultCustomer: { id: string; name: string };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const isoPlusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Minimal lump-sum invoice creation dialog (Phase 7 §4.2). CSR enters a
 * single description + amount; backend stores it as one custom line item
 * (no `partId`, quantity 1). Forward-compatible with the inventory rebuild
 * — when the parts catalog ships, this dialog gains an optional line-items
 * table mode (§8.1) while the lump-sum field stays as a primary path.
 *
 * Two save buttons (§4.2):
 *   - Save as Draft  → POST with status DRAFT
 *   - Save & Send    → POST, then POST `/send` (server flips DRAFT → SENT
 *                       atomically per Phase 7 §4.3 step 7; no chained
 *                       status PATCH needed)
 *
 * Tax handling is intentionally out of scope here — `taxRate: 0` is
 * hardcoded. The standalone Invoices page covers tax-aware creation
 * until inventory lands.
 */
export default function InvoiceDialog({
  open,
  onClose,
  workOrderId,
  workOrderNumber,
  defaultCustomer,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const invoiceLabel = getName('invoice');
  const customerLabel = getName('customer');
  const workOrderLabel = getName('work_order');
  const queryClient = useQueryClient();

  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(isoPlusDays(30));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [billingCustomer, setBillingCustomer] =
    useState<CustomerSearchResult | null>(null);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- standard form-init pattern */
    setInvoiceDate(todayIso());
    setDueDate(isoPlusDays(30));
    setDescription('');
    setAmount('');
    setNotes('');
    setError(null);
    // Default to the WO's customer. Only seed the picker when we actually
    // have an id — otherwise leave it null so the user must explicitly
    // pick (caught by validate() before submit). Prevents silent
    // `customerId: undefined` submissions when the parent's default is
    // empty for any reason.
    setBillingCustomer(
      defaultCustomer.id
        ? {
            id: defaultCustomer.id,
            name: defaultCustomer.name,
            type: 'STANDARD',
            category: 'COMMERCIAL',
          }
        : null,
    );
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, defaultCustomer]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['workOrderInvoices', workOrderId] });
    queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
    invalidateLocationInvoiceCaches(queryClient);
  };

  const createMutation = useMutation({
    mutationFn: async ({ send }: { send: boolean }) => {
      const numeric = parseFloat(amount.replace(/[$,\s]/g, ''));
      const request: CreateInvoiceRequest = {
        workOrderId,
        // Bill-to customer — defaults to the WO's customer (service
        // recipient) but the CSR can pick a different one in the picker
        // (e.g. a BILLING_ONLY warranty co). The WO's customer remains
        // the service recipient regardless; only the invoice's
        // customerId changes.
        customerId: billingCustomer!.id,
        // Business dates are LocalDate (yyyy-MM-dd) on the wire — only
        // audit fields (createdAt/updatedAt) are Instant. Pass the date
        // input value through raw. Earlier this dialog appended T00:00:00Z
        // because the contract was misread; corrected per backend's wire
        // -types reference (refactor: business dates use LocalDate).
        invoiceDate,
        dueDate,
        // Lump-sum: a single custom line item, no partId. Backend stores
        // it as-is per ask #6's contract confirmation.
        taxRate: 0,
        notes: notes.trim() || undefined,
        lineItems: [
          {
            description: description.trim(),
            quantity: 1,
            unitPrice: numeric,
          },
        ],
      };
      const created = await invoicesApi.create(request);
      if (send) {
        // Server flips DRAFT → SENT atomically in the same transaction
        // that publishes the NotificationRequestedEvent (§4.3 step 7), so
        // we no longer need a chained `updateStatus(SENT)` call here.
        await invoicesApi.send(created.id);
      }
      return created;
    },
    onSuccess: () => {
      invalidate();
      onClose();
    },
    onError: (e: unknown) => {
      // Branch on the structured error code for the most common send
      // failure — bill-to customer has no email on file — so the CSR
      // gets actionable copy instead of the backend's bare message.
      const code = getApiErrorCode(e);
      if (code === 'NO_RECIPIENT') {
        setError(
          t('workOrders.financialDrawer.invoiceDialog.errorNoRecipient', {
            entity: invoiceLabel,
          }),
        );
        return;
      }
      const msg = getApiErrorMessage(e);
      setError(
        msg ??
          t('workOrders.financialDrawer.invoiceDialog.errorCreate', {
            entity: invoiceLabel,
          }),
      );
    },
  });

  const validate = (): boolean => {
    if (!billingCustomer || !billingCustomer.id) {
      setError(
        t('workOrders.financialDrawer.invoiceDialog.customerRequired', {
          entity: customerLabel,
        }),
      );
      return false;
    }
    if (!description.trim()) {
      setError(t('workOrders.financialDrawer.invoiceDialog.descriptionRequired'));
      return false;
    }
    const numeric = parseFloat(amount.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError(t('workOrders.financialDrawer.invoiceDialog.invalidAmount'));
      return false;
    }
    if (!invoiceDate || !dueDate) {
      setError(t('workOrders.financialDrawer.invoiceDialog.datesRequired'));
      return false;
    }
    return true;
  };

  const handleSubmit = (send: boolean) => {
    setError(null);
    if (!validate()) return;
    createMutation.mutate({ send });
  };

  const submitting = createMutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>
        {t('workOrders.financialDrawer.invoiceDialog.title', {
          entity: invoiceLabel,
        })}
      </DialogTitle>
      <DialogBody>
        {/* Locked context strip (§4.1). Identifies the WO + its service
            customer. The bill-to customer (which may differ — warranty,
            insurance, etc.) is the picker field below, not this strip. */}
        <div className="mb-3 rounded-md bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
          {t('workOrders.financialDrawer.invoiceDialog.contextStrip', {
            workOrder: workOrderLabel,
            number: workOrderNumber,
            customer: defaultCustomer.name,
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(false);
          }}
        >
          <Fieldset>
            {/* Tighter vertical rhythm than Catalyst's default space-y-8
                — CSR forms favor density (memory: feedback_form_density). */}
            <FieldGroup className="!space-y-3">
              <Field>
                <Label>
                  {t('workOrders.financialDrawer.invoiceDialog.billTo')}
                </Label>
                <CustomerPicker
                  value={billingCustomer}
                  onChange={setBillingCustomer}
                  ariaLabel={t(
                    'workOrders.financialDrawer.invoiceDialog.billTo',
                  )}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>
                    {t('workOrders.financialDrawer.invoiceDialog.invoiceDate', {
                      entity: invoiceLabel,
                    })}
                  </Label>
                  <Input
                    name="invoiceDate"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <Label>
                    {t('workOrders.financialDrawer.invoiceDialog.dueDate')}
                  </Label>
                  <Input
                    name="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field>
                <Label>
                  {t('workOrders.financialDrawer.invoiceDialog.description')}
                </Label>
                <Textarea
                  name="description"
                  rows={1}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    'workOrders.financialDrawer.invoiceDialog.descriptionPlaceholder',
                    { entity: invoiceLabel },
                  )}
                  required
                />
              </Field>

              <Field>
                <Label>
                  {t('workOrders.financialDrawer.invoiceDialog.amount')}
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
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button outline onClick={() => handleSubmit(false)} disabled={submitting}>
          {t('workOrders.financialDrawer.invoiceDialog.saveAsDraft')}
        </Button>
        <Button
          color="dark/zinc"
          onClick={() => handleSubmit(true)}
          disabled={submitting}
        >
          {submitting
            ? t('common.saving')
            : t('workOrders.financialDrawer.invoiceDialog.saveAndSend')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
