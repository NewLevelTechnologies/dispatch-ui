/* eslint-disable i18next/no-literal-string -- dense settings admin form; entity names go through getName(), "Plan" + field/benefit labels stay literal (no glossary key for plan; same convention as CompanyProfilePanel). */
import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CurrencyDollarIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import {
  agreementPlanApi,
  type AgreementPlanResponse,
  type CadenceUnit,
  type AgreementClassification,
} from '../api';
import { useGlossary } from '../contexts/GlossaryContext';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Field, FieldGroup, Fieldset, Label, Description } from './catalyst/fieldset';
import { Input, InputGroup } from './catalyst/input';
import { Select } from './catalyst/select';
import { Switch } from './catalyst/switch';
import { extractApiError, showSuccess } from '../lib/toast';

interface AgreementPlanFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  plan?: AgreementPlanResponse;
}

const CADENCE_UNITS: CadenceUnit[] = ['WEEK', 'MONTH', 'QUARTER', 'YEAR'];
const CLASSIFICATIONS: AgreementClassification[] = ['CONTRACT', 'INTERNAL'];

// "Quarter" / "Quarters" — pluralized by the interval so "Every [n] [unit]"
// reads as one phrase (matches the visit-template form).
const cadenceUnitLabel = (u: CadenceUnit, interval: number): string => {
  const singular = u.charAt(0) + u.slice(1).toLowerCase();
  return interval === 1 ? singular : `${singular}s`;
};

// number-string → number | null (blank/invalid = null, so the BE takes its default).
const num = (v: string): number | null => {
  const n = Number(v);
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};

const SectionLabel = ({ children }: { children: string }) => (
  <div className="text-[10px] font-semibold uppercase tracking-wider text-fg-muted">{children}</div>
);

// Create/edit a plan template. A plan carries member benefits (snapshotted onto
// agreements at sale) plus billing/term defaults (pre-fill only). kind is locked
// to VISIT for v1; billingMode defaults FIXED_SCHEDULE on the BE.
export default function AgreementPlanFormDialog({ isOpen, onClose, plan }: AgreementPlanFormDialogProps) {
  const queryClient = useQueryClient();
  const { getName } = useGlossary();
  const isEdit = Boolean(plan);

  const [name, setName] = useState('');
  const [classification, setClassification] = useState<AgreementClassification>('CONTRACT');
  const [amount, setAmount] = useState('');
  const [cadenceUnit, setCadenceUnit] = useState<CadenceUnit>('QUARTER');
  const [cadenceInterval, setCadenceInterval] = useState('1');
  const [netDays, setNetDays] = useState('30');
  const [termMonths, setTermMonths] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [renewalTermMonths, setRenewalTermMonths] = useState('');
  const [renewalAlertDays, setRenewalAlertDays] = useState('');
  // Member benefits
  const [coveredPmVisits, setCoveredPmVisits] = useState('');
  const [tripFeeWaived, setTripFeeWaived] = useState(false);
  const [laborDiscountPct, setLaborDiscountPct] = useState('');
  const [partsDiscountPct, setPartsDiscountPct] = useState('');
  const [priorityDispatch, setPriorityDispatch] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- form initialization on open */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setName(plan?.name ?? '');
    setClassification(plan?.classification ?? 'CONTRACT');
    setAmount(plan?.defaultAmount != null ? String(plan.defaultAmount) : '');
    setCadenceUnit(plan?.defaultCadenceUnit ?? 'QUARTER');
    setCadenceInterval(plan?.defaultCadenceInterval != null ? String(plan.defaultCadenceInterval) : '1');
    setNetDays(plan?.defaultNetDays != null ? String(plan.defaultNetDays) : '30');
    setTermMonths(plan?.defaultTermMonths != null ? String(plan.defaultTermMonths) : '');
    setAutoRenew(plan?.defaultAutoRenew ?? false);
    setRenewalTermMonths(plan?.defaultRenewalTermMonths != null ? String(plan.defaultRenewalTermMonths) : '');
    setRenewalAlertDays(plan?.defaultRenewalAlertDays != null ? String(plan.defaultRenewalAlertDays) : '');
    const b = plan?.benefits;
    setCoveredPmVisits(b?.coveredPmVisits != null ? String(b.coveredPmVisits) : '');
    setTripFeeWaived(b?.tripFeeWaived ?? false);
    setLaborDiscountPct(b?.laborDiscountPct != null ? String(b.laborDiscountPct) : '');
    setPartsDiscountPct(b?.partsDiscountPct != null ? String(b.partsDiscountPct) : '');
    setPriorityDispatch(b?.priorityDispatch ?? false);
  }, [isOpen, plan]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const buildPayload = () => ({
    name: name.trim(),
    kind: 'VISIT' as const,
    classification,
    defaultAmount: num(amount),
    defaultCadenceUnit: cadenceUnit,
    defaultCadenceInterval: num(cadenceInterval) ?? 1,
    defaultNetDays: num(netDays) ?? 30,
    defaultTermMonths: num(termMonths),
    defaultAutoRenew: autoRenew,
    defaultRenewalTermMonths: autoRenew ? num(renewalTermMonths) : null,
    defaultRenewalAlertDays: autoRenew ? num(renewalAlertDays) : null,
    benefits: {
      coveredPmVisits: num(coveredPmVisits),
      tripFeeWaived,
      laborDiscountPct: num(laborDiscountPct),
      partsDiscountPct: num(partsDiscountPct),
      priorityDispatch,
    },
  });

  const createMutation = useMutation({
    mutationFn: () => agreementPlanApi.create(buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-plans'] });
      showSuccess('Plan added');
      onClose();
    },
    onError: (err) => setErrorMessage(extractApiError(err) ?? 'Failed to add plan'),
  });

  const updateMutation = useMutation({
    mutationFn: () => agreementPlanApi.update(plan!.id, buildPayload()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement-plans'] });
      showSuccess('Plan updated');
      onClose();
    },
    onError: (err) => setErrorMessage(extractApiError(err) ?? 'Failed to update plan'),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canSubmit = name.trim().length > 0 && !isSaving;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!canSubmit) return;
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} size="2xl">
      <DialogTitle>{isEdit ? 'Edit plan' : 'New plan'}</DialogTitle>
      <DialogDescription>
        {`A reusable template. Member benefits snapshot onto an ${getName('agreement').toLowerCase()} at sale; billing and term defaults pre-fill the create form (overridable per sale).`}
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody>
          {errorMessage && (
            <div role="alert" className="mb-4 rounded-lg bg-danger-100 p-3 text-[12.5px] text-danger-500 ring-1 ring-danger-500/20">
              {errorMessage}
            </div>
          )}
          <Fieldset>
            <FieldGroup className="!space-y-4">
              {/* Identity */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end sm:gap-4">
                <Field size="xs">
                  <Label size="xs" required>Plan name</Label>
                  <Input size="xs" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Comfort Club — Residential" maxLength={255} required autoFocus />
                </Field>
                <Field size="xs">
                  <Label size="xs">Classification</Label>
                  <Select value={classification} onChange={(e) => setClassification(e.target.value as AgreementClassification)}>
                    {CLASSIFICATIONS.map((c) => (
                      <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>
                    ))}
                  </Select>
                </Field>
                <Field size="xs">
                  <Label size="xs">Type</Label>
                  {/* Locked to VISIT for v1 — shown as informational, not a
                      greyed dropdown, so it reads as "fixed" not "broken". */}
                  <div className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-bg-active px-2.5 text-[12.5px] text-fg-muted" aria-label="Plan type (locked)">
                    <LockClosedIcon className="size-3.5 text-fg-dim" />
                    {`${getName('work_order')}-based`}
                  </div>
                </Field>
              </div>

              {/* Billing defaults (pre-fill only) */}
              <div>
                <SectionLabel>Billing defaults · pre-fill only</SectionLabel>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                  <Field size="xs">
                    <Label size="xs">Amount / period</Label>
                    <InputGroup>
                      <CurrencyDollarIcon data-slot="icon" />
                      <Input size="xs" type="number" min={0} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="300" className="tabular-nums" />
                    </InputGroup>
                  </Field>
                  <Field size="xs">
                    <Label size="xs">Every</Label>
                    <Input size="xs" type="number" min={1} value={cadenceInterval} onChange={(e) => setCadenceInterval(e.target.value)} />
                  </Field>
                  <Field size="xs">
                    <Label size="xs">Cadence</Label>
                    <Select value={cadenceUnit} onChange={(e) => setCadenceUnit(e.target.value as CadenceUnit)}>
                      {CADENCE_UNITS.map((u) => (
                        <option key={u} value={u}>{cadenceUnitLabel(u, Number(cadenceInterval) || 1)}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field size="xs">
                    <Label size="xs">Net days</Label>
                    <Input size="xs" type="number" min={0} value={netDays} onChange={(e) => setNetDays(e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Term defaults (pre-fill only) */}
              <div>
                <SectionLabel>Term defaults · pre-fill only</SectionLabel>
                <div className="mt-2 flex flex-wrap items-end gap-4">
                  <Field size="xs" className="w-32">
                    <Label size="xs">Term length (months)</Label>
                    <Input size="xs" type="number" min={1} value={termMonths} onChange={(e) => setTermMonths(e.target.value)} placeholder="12" />
                  </Field>
                  <div className="flex items-center gap-2 pb-1.5">
                    <Switch checked={autoRenew} onChange={setAutoRenew} aria-label="Auto-renew" />
                    <span className="text-[12.5px] text-fg-strong">Auto-renew</span>
                  </div>
                  {autoRenew && (
                    <>
                      <Field size="xs" className="w-32">
                        <Label size="xs">Renewal term (months)</Label>
                        <Input size="xs" type="number" min={1} value={renewalTermMonths} onChange={(e) => setRenewalTermMonths(e.target.value)} placeholder="12" />
                      </Field>
                      <Field size="xs" className="w-32">
                        <Label size="xs">Renewal alert (days)</Label>
                        <Input size="xs" type="number" min={0} value={renewalAlertDays} onChange={(e) => setRenewalAlertDays(e.target.value)} placeholder="90" />
                      </Field>
                    </>
                  )}
                </div>
              </div>

              {/* Member benefits (snapshotted at sale) */}
              <div>
                <SectionLabel>Member benefits · included terms</SectionLabel>
                <Description size="xs" className="mt-1">
                  Stated entitlements, not auto-applied discounts. A human applies them at billing time.
                </Description>
                <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-3">
                  <Field size="xs" className="w-36">
                    <Label size="xs">PM visits covered</Label>
                    {/* Blank = not specified (null), distinct from 0 — neutral placeholder. */}
                    <Input size="xs" type="number" min={0} value={coveredPmVisits} onChange={(e) => setCoveredPmVisits(e.target.value)} placeholder="Any" />
                  </Field>
                  <Field size="xs" className="w-32">
                    <Label size="xs">Labor discount %</Label>
                    <Input size="xs" type="number" min={0} max={100} step="0.01" value={laborDiscountPct} onChange={(e) => setLaborDiscountPct(e.target.value)} placeholder="0" />
                  </Field>
                  <Field size="xs" className="w-32">
                    <Label size="xs">Parts discount %</Label>
                    <Input size="xs" type="number" min={0} max={100} step="0.01" value={partsDiscountPct} onChange={(e) => setPartsDiscountPct(e.target.value)} placeholder="0" />
                  </Field>
                  <div className="flex items-center gap-2 pb-1.5">
                    <Switch checked={tripFeeWaived} onChange={setTripFeeWaived} aria-label="Trip fee waived" />
                    <span className="text-[12.5px] text-fg-strong">Trip fee waived</span>
                  </div>
                  <div className="flex items-center gap-2 pb-1.5">
                    <Switch checked={priorityDispatch} onChange={setPriorityDispatch} aria-label="Priority dispatch" />
                    <span className="text-[12.5px] text-fg-strong">Priority dispatch</span>
                  </div>
                </div>
              </div>
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" color="accent" disabled={!canSubmit}>
            {isSaving ? 'Saving…' : isEdit ? 'Save changes' : 'Add plan'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
