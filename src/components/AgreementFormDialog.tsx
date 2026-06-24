import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import {
  agreementApi,
  agreementPlanApi,
  type AgreementResponse,
  type AgreementClassification,
  type UpdateAgreementRequest,
} from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Description, Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { Select } from './catalyst/select';
import { extractApiError, showSuccess } from '../lib/toast';

// term length is a plan default (months); the form uses explicit dates, so a
// chosen plan derives termEnd from the start the user picks.
function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

interface AgreementFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  // Edit mode — pass the agreement. Create mode — pass customerId instead.
  agreement?: AgreementResponse;
  customerId?: string;
  // Edit-where-you-see-it: scope the edit to the card that opened it. 'identity'
  // (header) edits the name; 'term' (Term card) edits term dates + renewal.
  // Omitted on create → the full form. Ignored in create mode.
  section?: 'identity' | 'term';
}

// Dual create/edit. Create lands a DRAFT (kind VISIT / classification CONTRACT —
// the only v1 values) and routes to its detail page so the user can configure
// visit templates + coverage and then activate. Edits are scoped to the card
// they open from (see `section`) so no two Edit buttons open the same fields.
export default function AgreementFormDialog({ isOpen, onClose, agreement, customerId, section }: AgreementFormDialogProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const isEdit = Boolean(agreement);
  // Create shows the whole form; edit shows only the opening card's fields.
  const showIdentity = !isEdit || section === 'identity';
  const showTerm = !isEdit || section === 'term';

  const [name, setName] = useState('');
  const [termStart, setTermStart] = useState('');
  const [termEnd, setTermEnd] = useState('');
  const [autoRenew, setAutoRenew] = useState(false);
  const [renewalTermMonths, setRenewalTermMonths] = useState('');
  const [renewalAlertDays, setRenewalAlertDays] = useState('');
  // Sell-from-plan (create only). '' = Custom (bespoke). classification rides
  // from the plan (or CONTRACT). planTermMonths derives termEnd from termStart.
  const [planId, setPlanId] = useState('');
  const [classification, setClassification] = useState<AgreementClassification>('CONTRACT');
  const [planTermMonths, setPlanTermMonths] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active plans to sell from (create only). Shares the panel's cache key.
  const { data: activePlans } = useQuery({
    queryKey: ['agreement-plans', false],
    queryFn: () => agreementPlanApi.getAll(false),
    enabled: isOpen && !isEdit,
  });

  /* eslint-disable react-hooks/set-state-in-effect -- form initialization on open */
  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setName(agreement?.name ?? '');
    setTermStart(agreement?.termStart ?? '');
    setTermEnd(agreement?.termEnd ?? '');
    setAutoRenew(agreement?.autoRenew ?? false);
    setRenewalTermMonths(agreement?.renewalTermMonths != null ? String(agreement.renewalTermMonths) : '');
    setRenewalAlertDays(agreement?.renewalAlertDays != null ? String(agreement.renewalAlertDays) : '');
    setPlanId(agreement?.planId ?? '');
    setClassification(agreement?.classification ?? 'CONTRACT');
    setPlanTermMonths(null);
  }, [isOpen, agreement]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Choose a plan → pre-fill term + renewal + classification (all overridable);
  // benefits + billing defaults aren't shown here (benefits snapshot server-side
  // from planId; billing defaults pre-fill the later billing-setup step).
  const handlePlanChange = (id: string) => {
    setPlanId(id);
    const plan = activePlans?.find((p) => p.id === id);
    if (!plan) {
      setClassification('CONTRACT');
      setPlanTermMonths(null);
      return;
    }
    setClassification(plan.classification);
    setAutoRenew(plan.defaultAutoRenew);
    setRenewalTermMonths(plan.defaultRenewalTermMonths != null ? String(plan.defaultRenewalTermMonths) : '');
    setRenewalAlertDays(plan.defaultRenewalAlertDays != null ? String(plan.defaultRenewalAlertDays) : '');
    setPlanTermMonths(plan.defaultTermMonths ?? null);
    if (termStart && plan.defaultTermMonths != null) setTermEnd(addMonths(termStart, plan.defaultTermMonths));
  };

  // Picking a start date re-derives the end from the plan's term length.
  const handleTermStartChange = (value: string) => {
    setTermStart(value);
    if (value && planTermMonths != null) setTermEnd(addMonths(value, planTermMonths));
  };

  const createMutation = useMutation({
    mutationFn: () =>
      agreementApi.create({
        customerId: customerId!,
        name: name.trim(),
        kind: 'VISIT',
        classification,
        termStart: termStart || null,
        termEnd: termEnd || null,
        autoRenew,
        renewalTermMonths: autoRenew && renewalTermMonths ? Number(renewalTermMonths) : null,
        renewalAlertDays: autoRenew && renewalAlertDays ? Number(renewalAlertDays) : null,
        // Provenance; omit benefits so the BE snapshots the plan's. '' = bespoke.
        planId: planId || null,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showSuccess(t('common.form.successCreate', { entity: getName('agreement'), defaultValue: `${getName('agreement')} created` }));
      onClose();
      // Land on the new DRAFT so the user can configure + activate it.
      navigate(`/agreements/${created.id}?from=customer`);
    },
    onError: (err) =>
      setErrorMessage(extractApiError(err) ?? t('common.form.errorCreate', { entity: getName('agreement') })),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateAgreementRequest) => agreementApi.update(agreement!.id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agreement', agreement!.id] });
      queryClient.invalidateQueries({ queryKey: ['agreements'] });
      showSuccess(t('common.form.successUpdate', { entity: getName('agreement'), defaultValue: 'Changes saved' }));
      onClose();
    },
    onError: (err) =>
      setErrorMessage(extractApiError(err) ?? t('common.form.errorUpdate', { entity: getName('agreement') })),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const trimmedName = name.trim();
  // Name is required wherever it's shown (create + identity edit), not on the
  // term-only edit.
  const canSubmit = (!showIdentity || trimmedName.length > 0) && !isSaving;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (showIdentity && !trimmedName) return;
    if (!isEdit) {
      createMutation.mutate();
      return;
    }
    // Scoped edit — PATCH only the opening card's fields (partial update; omitted
    // keys stay unchanged). renewal* clear when auto-renew is off.
    if (section === 'identity') {
      updateMutation.mutate({ name: trimmedName });
    } else {
      updateMutation.mutate({
        autoRenew,
        termStart: termStart || null,
        termEnd: termEnd || null,
        renewalTermMonths: autoRenew && renewalTermMonths ? Number(renewalTermMonths) : null,
        renewalAlertDays: autoRenew && renewalAlertDays ? Number(renewalAlertDays) : null,
      });
    }
  };

  const editTitle =
    section === 'term'
      ? t('agreements.editTerm', { defaultValue: 'Edit term' })
      : t('agreements.editName', { defaultValue: 'Edit name' });

  return (
    <Dialog open={isOpen} onClose={onClose} size="lg">
      <DialogTitle>
        {isEdit ? editTitle : t('common.actions.add', { entity: getName('agreement') })}
      </DialogTitle>
      <DialogDescription>
        {isEdit
          ? `${agreement!.agreementNumber} · ${agreement!.customer.name}`
          : t('agreements.createHint', {
              defaultValue: 'Creates a draft. Add visit templates + coverage, then activate it to start generating work.',
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
              {!isEdit && (activePlans?.length ?? 0) > 0 && (
                <Field size="xs">
                  <Label size="xs">{t('agreements.plan', { defaultValue: 'Plan' })}</Label>
                  <Select value={planId} onChange={(e) => handlePlanChange(e.target.value)}>
                    <option value="">{t('agreements.planCustom', { defaultValue: 'Custom (no plan)' })}</option>
                    {activePlans!.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </Select>
                  <Description size="xs">
                    {t('agreements.planHint', {
                      defaultValue: "Pre-fills the term from the plan (overridable). The plan's member benefits apply to this sale.",
                    })}
                  </Description>
                </Field>
              )}

              {showIdentity && (
                <Field size="xs">
                  <Label size="xs" required>{t('common.form.name', { defaultValue: 'Name' })}</Label>
                  <Input
                    size="xs"
                    name="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={255}
                    required
                    autoFocus
                  />
                </Field>
              )}

              {showTerm && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <Field size="xs">
                    <Label size="xs">{t('common.form.termStart', { defaultValue: 'Term start' })}</Label>
                    <Input size="xs" type="date" name="termStart" value={termStart} onChange={(e) => handleTermStartChange(e.target.value)} autoFocus={!showIdentity} />
                  </Field>
                  <Field size="xs">
                    <Label size="xs">{t('common.form.termEnd', { defaultValue: 'Term end' })}</Label>
                    <Input size="xs" type="date" name="termEnd" value={termEnd} onChange={(e) => setTermEnd(e.target.value)} />
                  </Field>
                </div>
              )}

              {showTerm && (
                <CheckboxField>
                  <Checkbox color="accent" checked={autoRenew} onChange={setAutoRenew} />
                  <Label>{t('common.form.autoRenew', { defaultValue: 'Auto-renew at term' })}</Label>
                  <Description>{t('common.form.autoRenewHint', { defaultValue: 'Renews automatically unless cancelled before term end.' })}</Description>
                </CheckboxField>
              )}

              {showTerm && autoRenew && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <Field size="xs">
                    <Label size="xs">{t('common.form.renewalTerm', { defaultValue: 'Renewal term (months)' })}</Label>
                    <Input
                      size="xs"
                      type="number"
                      min={1}
                      name="renewalTermMonths"
                      value={renewalTermMonths}
                      onChange={(e) => setRenewalTermMonths(e.target.value)}
                    />
                  </Field>
                  <Field size="xs">
                    <Label size="xs">{t('common.form.renewalAlert', { defaultValue: 'Renewal alert (days prior)' })}</Label>
                    <Input
                      size="xs"
                      type="number"
                      min={0}
                      name="renewalAlertDays"
                      value={renewalAlertDays}
                      onChange={(e) => setRenewalAlertDays(e.target.value)}
                    />
                  </Field>
                </div>
              )}
            </FieldGroup>
          </Fieldset>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={onClose} disabled={isSaving}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" color="accent" disabled={!canSubmit}>
            {isSaving ? t('common.saving') : isEdit ? t('common.update') : t('common.create')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
