import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useGlossary } from '../contexts/GlossaryContext';
import { agreementApi, type AgreementResponse, type UpdateAgreementRequest } from '../api';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from './catalyst/dialog';
import { Button } from './catalyst/button';
import { Checkbox, CheckboxField } from './catalyst/checkbox';
import { Description, Field, FieldGroup, Fieldset, Label } from './catalyst/fieldset';
import { Input } from './catalyst/input';
import { extractApiError, showSuccess } from '../lib/toast';

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  }, [isOpen, agreement]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const createMutation = useMutation({
    mutationFn: () =>
      agreementApi.create({
        customerId: customerId!,
        name: name.trim(),
        kind: 'VISIT',
        classification: 'CONTRACT',
        termStart: termStart || null,
        termEnd: termEnd || null,
        autoRenew,
        renewalTermMonths: autoRenew && renewalTermMonths ? Number(renewalTermMonths) : null,
        renewalAlertDays: autoRenew && renewalAlertDays ? Number(renewalAlertDays) : null,
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
                    <Input size="xs" type="date" name="termStart" value={termStart} onChange={(e) => setTermStart(e.target.value)} autoFocus={!showIdentity} />
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
