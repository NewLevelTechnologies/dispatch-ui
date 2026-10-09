import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { CurrencyDollarIcon } from '@heroicons/react/16/solid';
import { useGlossary } from '../../contexts/GlossaryContext';
import { agreementApi } from '../../api/setup';
import { useTenantTimeZone } from '../../hooks/useTenantTimeZone';
import { zonedDate } from '../../lib/boardTime';
import { extractApiError, showSuccess } from '../../lib/toast';
import { agreementBillingQueryOptions, formatCurrency, formatDay } from '../../pages/agreement/agreementShared';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../../components/catalyst/dialog';
import { Button } from '../../components/catalyst/button';
import { Description, Field, FieldGroup, Fieldset, Label } from '../../components/catalyst/fieldset';
import { Input, InputGroup } from '../../components/catalyst/input';
import { cadenceSuffix, defaultRenewalEnd, type RenewableAgreement } from './agreementListModel';

interface Props {
  agreement: RenewableAgreement | null;
  onClose: () => void;
}

// Before term end the renewal is booked and the current term runs out first;
// once it has ended (or from EXPIRED) the new term starts now, dated from the
// old end, and nothing is made up for the windows that closed in between.
export default function RenewAgreementDialog({ agreement, onClose }: Props) {
  const open = Boolean(agreement?.termEnd);
  return (
    <Dialog open={open} onClose={onClose} size="md">
      {open && <RenewForm key={agreement!.id} agreement={agreement!} onClose={onClose} />}
    </Dialog>
  );
}

function RenewForm({ agreement, onClose }: { agreement: RenewableAgreement; onClose: () => void }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const currentEnd = agreement.termEnd!;
  const booked = agreement.status === 'ACTIVE' && currentEnd > today;

  const [termEnd, setTermEnd] = useState(() => agreement.nextTermEnd ?? defaultRenewalEnd(agreement));
  const [amount, setAmount] = useState(() =>
    agreement.nextTermBillingAmount != null ? String(agreement.nextTermBillingAmount) : '',
  );

  const { data: billing } = useQuery(agreementBillingQueryOptions(agreement.id));

  const mutation = useMutation({
    mutationFn: () =>
      agreementApi.renew(agreement.id, {
        termEnd,
        ...(amount.trim() !== '' ? { billingAmount: Number(amount) } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreement.id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showSuccess(
        t(booked ? 'agreements.renew.booked' : 'agreements.renew.renewed', {
          number: agreement.agreementNumber,
          date: formatDay(termEnd),
        }),
      );
      onClose();
    },
  });

  const endError = !termEnd
    ? null
    : termEnd <= currentEnd
      ? t('agreements.renew.endAfterCurrent', { date: formatDay(currentEnd) })
      : !booked && termEnd <= today
        ? t('agreements.renew.endAfterToday')
        : null;
  const amountInvalid = amount.trim() !== '' && !(Number(amount) >= 0);
  const canSubmit = Boolean(termEnd) && !endError && !amountInvalid && !mutation.isPending;
  const errorMessage = mutation.error
    ? (extractApiError(mutation.error) ?? t('agreements.renew.failed', { agreement: getName('agreement').toLowerCase() }))
    : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) mutation.mutate();
  };

  return (
    <>
      <DialogTitle>{t('agreements.renew.title', { number: agreement.agreementNumber })}</DialogTitle>
      <DialogDescription>
        {booked
          ? t('agreements.renew.bookedHint', { date: formatDay(currentEnd) })
          : t(agreement.status === 'EXPIRED' ? 'agreements.renew.expiredHint' : 'agreements.renew.nowHint', {
              date: formatDay(currentEnd),
              workOrders: getName('work_order', true),
            })}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20"
            >
              {errorMessage}
            </div>
          )}
          <Fieldset>
            <FieldGroup className="!space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <Field size="xs">
                  <Label size="xs" required>
                    {t('agreements.renew.termEnd')}
                  </Label>
                  <Input
                    size="xs"
                    type="date"
                    name="termEnd"
                    value={termEnd}
                    min={currentEnd}
                    onChange={(e) => setTermEnd(e.target.value)}
                    invalid={Boolean(endError)}
                    required
                    autoFocus
                  />
                  <Description size="xs" className={endError ? 'text-danger-500' : undefined}>
                    {endError ?? t('agreements.renew.startsOn', { date: formatDay(currentEnd) })}
                  </Description>
                </Field>
                {billing && (
                  <Field size="xs">
                    <Label size="xs">
                      {t('agreements.renew.price', { cadence: cadenceSuffix(billing.cadenceUnit, billing.cadenceInterval) })}
                    </Label>
                    <InputGroup>
                      <CurrencyDollarIcon data-slot="icon" />
                      <Input
                        size="xs"
                        type="number"
                        name="billingAmount"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder={String(billing.amount)}
                        invalid={amountInvalid}
                        className="tabular-nums"
                      />
                    </InputGroup>
                    <Description size="xs">
                      {t('agreements.renew.priceHint', { amount: formatCurrency(billing.amount) })}
                    </Description>
                  </Field>
                )}
              </div>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={mutation.isPending}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="accent" disabled={!canSubmit}>
            {mutation.isPending ? t('common.saving') : t(booked ? 'agreements.renew.submitBooked' : 'agreements.renew.submit')}
          </Button>
        </DialogActions>
      </form>
    </>
  );
}
