/* eslint-disable i18next/no-literal-string -- dense billing config form; short operational labels stay literal, same convention as the agreement detail surfaces. */
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDaysIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import {
  agreementApi,
  type AgreementPlanResponse,
  type BillingMode,
  type BillingScheduleResponse,
  type CadenceUnit,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input, InputGroup } from './catalyst/input';
import { Select } from './catalyst/select';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { extractApiError, showSuccess } from '../lib/toast';
import { cadenceLabel, formatCurrency, periodsPerYear } from '../pages/agreement/agreementShared';

interface BillingSetupDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agreementId: string;
  /** Existing schedule → edit mode (prefills); absent → create mode. */
  billing?: BillingScheduleResponse;
  /** Sensible default for the anchor date in create mode (usually term start). */
  defaultAnchorDate?: string | null;
  /**
   * Plan the agreement was sold from (if any). In create mode its billing
   * *defaults* pre-fill the form — amount/cadence/net-days — all overridable.
   * Defaults only; the schedule itself is still written via this dialog's PUT.
   */
  plan?: AgreementPlanResponse | null;
}

const CADENCE_UNITS: CadenceUnit[] = ['WEEK', 'MONTH', 'QUARTER', 'YEAR'];

// Create / edit the agreement's billing schedule. Fields map 1:1 to
// UpsertBillingScheduleRequest — no plan/collection/member-pricing fields
// (those backends don't exist yet). Saving an active FIXED_SCHEDULE begins
// generating installment invoices on the backend.
export default function BillingSetupDialog({
  isOpen,
  onClose,
  agreementId,
  billing,
  defaultAnchorDate,
  plan,
}: BillingSetupDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(billing);

  const [amount, setAmount] = useState('');
  const [cadenceUnit, setCadenceUnit] = useState<CadenceUnit>('QUARTER');
  const [cadenceInterval, setCadenceInterval] = useState('1');
  const [anchorDate, setAnchorDate] = useState('');
  const [netDays, setNetDays] = useState('30');
  const [billingMode, setBillingMode] = useState<BillingMode>('FIXED_SCHEDULE');
  const [active, setActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- form initialization on open */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    if (billing) {
      // Edit — prefill from the existing schedule.
      setAmount(billing.amount != null ? String(billing.amount) : '');
      setCadenceUnit(billing.cadenceUnit ?? 'QUARTER');
      setCadenceInterval(billing.cadenceInterval != null ? String(billing.cadenceInterval) : '1');
      setAnchorDate(billing.anchorDate ?? defaultAnchorDate ?? '');
      setNetDays(billing.netDays != null ? String(billing.netDays) : '30');
      setBillingMode(billing.billingMode ?? 'FIXED_SCHEDULE');
      setActive(billing.active ?? true);
    } else {
      // Create — prefill from the plan's billing defaults when sold from a plan
      // (defaults only; all overridable). No plan ⇒ blank/standard defaults.
      setAmount(plan?.defaultAmount != null ? String(plan.defaultAmount) : '');
      setCadenceUnit(plan?.defaultCadenceUnit ?? 'QUARTER');
      setCadenceInterval(plan?.defaultCadenceInterval != null ? String(plan.defaultCadenceInterval) : '1');
      setAnchorDate(defaultAnchorDate ?? '');
      setNetDays(plan?.defaultNetDays != null ? String(plan.defaultNetDays) : '30');
      setBillingMode(plan?.defaultBillingMode ?? 'FIXED_SCHEDULE');
      setActive(true);
    }
  }, [isOpen, billing, defaultAnchorDate, plan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const amountNum = Number(amount);
  const intervalNum = Number(cadenceInterval) || 1;

  const upsertMutation = useMutation({
    mutationFn: () =>
      agreementApi.upsertBillingSchedule(agreementId, {
        amount: amountNum,
        cadenceUnit,
        cadenceInterval: intervalNum,
        anchorDate,
        netDays: Number(netDays) || 0,
        billingMode,
        active,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId, 'billing-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['agreement', agreementId] });
      showSuccess(isEdit ? 'Billing schedule updated' : 'Billing set up');
      onClose();
    },
    onError: (err) => setErrorMessage(extractApiError(err) ?? 'Failed to save billing schedule'),
  });

  const canSubmit =
    amountNum > 0 && intervalNum >= 1 && anchorDate.length > 0 && !upsertMutation.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (canSubmit) upsertMutation.mutate();
  };

  // Live preview — derived, not stored: ARR = per-period amount × periods/yr.
  const perYear = periodsPerYear(cadenceUnit, intervalNum);
  const arr = billingMode === 'FIXED_SCHEDULE' && amountNum > 0 ? amountNum * perYear : null;

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg">
      <DialogTitle>{isEdit ? 'Edit billing schedule' : 'Set up billing'}</DialogTitle>
      <DialogDescription>
        Set the contract value and how it&rsquo;s invoiced. An active schedule generates installment
        invoices automatically and flows into the Invoices tab.
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {!isEdit && plan && (
            <div className="mb-3 rounded-md bg-accent-500/10 px-2.5 py-1.5 text-[11.5px] text-fg-accent ring-1 ring-accent-500/20">
              Pre-filled from {plan.name} — adjust as needed.
            </div>
          )}
          {errorMessage && (
            <div role="alert" className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20">
              {errorMessage}
            </div>
          )}
          <Fieldset>
            <FieldGroup className="!space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[150px_1fr_110px] sm:gap-4">
                <Field size="xs">
                  <Label size="xs" required>Amount / invoice</Label>
                  <InputGroup>
                    <CurrencyDollarIcon data-slot="icon" />
                    <Input
                      size="xs"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="300"
                      required
                      autoFocus
                      className="tabular-nums"
                    />
                  </InputGroup>
                </Field>
                <Field size="xs">
                  <Label size="xs" required>Cadence</Label>
                  <Select value={cadenceUnit} onChange={(e) => setCadenceUnit(e.target.value as CadenceUnit)}>
                    {CADENCE_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u.charAt(0) + u.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field size="xs">
                  <Label size="xs">Every</Label>
                  <Input
                    size="xs"
                    type="number"
                    min={1}
                    value={cadenceInterval}
                    onChange={(e) => setCadenceInterval(e.target.value)}
                    className="tabular-nums"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                <Field size="xs">
                  <Label size="xs" required>Starts</Label>
                  <Input size="xs" type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} required />
                </Field>
                <Field size="xs">
                  <Label size="xs">Net terms (days)</Label>
                  <Input
                    size="xs"
                    type="number"
                    min={0}
                    value={netDays}
                    onChange={(e) => setNetDays(e.target.value)}
                    className="tabular-nums"
                  />
                </Field>
                <Field size="xs">
                  <Label size="xs">Billing mode</Label>
                  <Select value={billingMode} onChange={(e) => setBillingMode(e.target.value as BillingMode)}>
                    <option value="FIXED_SCHEDULE">Fixed schedule</option>
                    {/* PER_VISIT exists in the enum but isn't implemented backend-side. */}
                    <option value="PER_VISIT" disabled>Per visit (not available)</option>
                  </Select>
                </Field>
              </div>

              {/* Live preview of the generated schedule — derived, labeled. */}
              <div className="rounded-[var(--r-md)] border border-border-soft bg-bg-elev-2 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <CalendarDaysIcon className="size-4 shrink-0 text-fg-accent" />
                  <span className="text-[12.5px] text-fg">
                    {amountNum > 0 ? (
                      billingMode === 'FIXED_SCHEDULE' ? (
                        <>
                          Generates <strong className="font-semibold">{perYear}</strong> invoice
                          {perYear === 1 ? '' : 's'}/yr of{' '}
                          <strong className="font-semibold tabular-nums">{formatCurrency(amountNum)}</strong> —{' '}
                          {cadenceLabel(cadenceUnit, intervalNum).toLowerCase()}.
                          {arr != null && (
                            <span className="text-fg-muted">
                              {' '}≈ <span className="tabular-nums">{formatCurrency(arr)}</span>/yr.
                            </span>
                          )}
                        </>
                      ) : (
                        <>Billed per completed visit.</>
                      )
                    ) : (
                      <span className="text-fg-muted">Enter an amount to preview the schedule.</span>
                    )}
                  </span>
                </div>
                <div className="mt-1 pl-6 text-[11px] text-fg-dim">Preview — actual invoices appear in the Invoices tab.</div>
              </div>

              <CheckboxField>
                <Checkbox name="active" checked={active} onChange={setActive} />
                <Label>Active</Label>
              </CheckboxField>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={upsertMutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" color="accent" disabled={!canSubmit}>
            {upsertMutation.isPending ? 'Saving…' : 'Save billing'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
