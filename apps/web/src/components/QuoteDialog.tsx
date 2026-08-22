import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import {
  quotesApi,
  QuoteStatus,
  type CreateQuoteRequest,
  type CustomerSearchResult,
} from '../api/setup';
import { useGlossary } from '../contexts/GlossaryContext';
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
  defaultCustomer: { id: string; name: string };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const isoPlusDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/**
 * Minimal lump-sum quote creation dialog (Phase 7 §4.3). Mirror of the
 * invoice dialog — same single-line-item shape on the backend, only the
 * date pair differs (Quote Date / Expires instead of Invoice Date / Due
 * Date) and Save & Send moves the quote to SENT status (pre-billing,
 * no payment chain).
 */
export default function QuoteDialog({
  open,
  onClose,
  workOrderId,
  workOrderNumber,
  defaultCustomer,
}: Props) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const quoteLabel = getName('quote');
  const customerLabel = getName('customer');
  const workOrderLabel = getName('work_order');
  const queryClient = useQueryClient();

  const [quoteDate, setQuoteDate] = useState(todayIso());
  const [expirationDate, setExpirationDate] = useState(isoPlusDays(30));
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [billingCustomer, setBillingCustomer] =
    useState<CustomerSearchResult | null>(null);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect -- standard form-init pattern */
    setQuoteDate(todayIso());
    setExpirationDate(isoPlusDays(30));
    setDescription('');
    setAmount('');
    setNotes('');
    setError(null);
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
    queryClient.invalidateQueries({ queryKey: ['workOrderQuotes', workOrderId] });
    queryClient.invalidateQueries({ queryKey: ['financialSummary', workOrderId] });
  };

  const createMutation = useMutation({
    mutationFn: async ({ send }: { send: boolean }) => {
      const numeric = parseFloat(amount.replace(/[$,\s]/g, ''));
      const request: CreateQuoteRequest = {
        workOrderId,
        customerId: billingCustomer!.id,
        // Quote dates are LocalDate (yyyy-MM-dd), not Instant — different
        // from the invoice dialog, which DOES need T00:00:00Z. Pass the
        // date-input value through raw.
        quoteDate,
        expirationDate,
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
      const created = await quotesApi.create(request);
      if (send) {
        await quotesApi.updateStatus(created.id, {
          status: QuoteStatus.SENT,
        });
      }
      return created;
    },
    onSuccess: () => {
      invalidate();
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
          t('workOrders.financialDrawer.quoteDialog.errorCreate', {
            entity: quoteLabel,
          }),
      );
    },
  });

  const validate = (): boolean => {
    if (!billingCustomer || !billingCustomer.id) {
      setError(
        t('workOrders.financialDrawer.quoteDialog.customerRequired', {
          entity: customerLabel,
        }),
      );
      return false;
    }
    if (!description.trim()) {
      setError(t('workOrders.financialDrawer.quoteDialog.descriptionRequired'));
      return false;
    }
    const numeric = parseFloat(amount.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError(t('workOrders.financialDrawer.quoteDialog.invalidAmount'));
      return false;
    }
    if (!quoteDate || !expirationDate) {
      setError(t('workOrders.financialDrawer.quoteDialog.datesRequired'));
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
        {t('workOrders.financialDrawer.quoteDialog.title', {
          entity: quoteLabel,
        })}
      </DialogTitle>
      <DialogBody>
        <div className="mb-3 rounded-md bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-300">
          {t('workOrders.financialDrawer.quoteDialog.contextStrip', {
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
            <FieldGroup className="!space-y-3">
              <Field>
                <Label>
                  {t('workOrders.financialDrawer.quoteDialog.billTo')}
                </Label>
                <CustomerPicker
                  value={billingCustomer}
                  onChange={setBillingCustomer}
                  ariaLabel={t(
                    'workOrders.financialDrawer.quoteDialog.billTo',
                  )}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label>
                    {t('workOrders.financialDrawer.quoteDialog.quoteDate', {
                      entity: quoteLabel,
                    })}
                  </Label>
                  <Input
                    name="quoteDate"
                    type="date"
                    value={quoteDate}
                    onChange={(e) => setQuoteDate(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <Label>
                    {t('workOrders.financialDrawer.quoteDialog.expirationDate')}
                  </Label>
                  <Input
                    name="expirationDate"
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    required
                  />
                </Field>
              </div>

              <Field>
                <Label>
                  {t('workOrders.financialDrawer.quoteDialog.description')}
                </Label>
                <Textarea
                  name="description"
                  rows={1}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t(
                    'workOrders.financialDrawer.quoteDialog.descriptionPlaceholder',
                    { entity: quoteLabel },
                  )}
                  required
                />
              </Field>

              <Field>
                <Label>
                  {t('workOrders.financialDrawer.quoteDialog.amount')}
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
          {t('workOrders.financialDrawer.quoteDialog.saveAsDraft')}
        </Button>
        <Button
          color="dark/zinc"
          onClick={() => handleSubmit(true)}
          disabled={submitting}
        >
          {submitting
            ? t('common.saving')
            : t('workOrders.financialDrawer.quoteDialog.saveAndSend')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
