import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { EllipsisVerticalIcon, PlusIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import { taxApi, type TaxClass, type TaxJurisdiction, type TaxJurisdictionRequest } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Checkbox, CheckboxField } from '../../components/catalyst/checkbox';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../../components/catalyst/dialog';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../../components/catalyst/dropdown';
import { Description, Field, Fieldset, Label, Legend } from '../../components/catalyst/fieldset';
import { Input } from '../../components/catalyst/input';
import { Select } from '../../components/catalyst/select';
import IconButton from '../../components/IconButton';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { ListFooter } from '../../components/ui/ListFooter';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { Pill, Tag } from '../../components/ui/Pill';
import { errorCode, extractApiError, showError, showSuccess } from '../../lib/toast';
import { pct } from '../../components/document/documentModel';

const JURISDICTIONS_KEY = ['tax-jurisdictions'] as const;
const SETTINGS_KEY = ['pricing-settings'] as const;

const CLASSES = ['LABOR', 'MATERIALS', 'EQUIPMENT', 'FEE'] as const satisfies readonly TaxClass[];
const FLAG: Record<TaxClass, 'taxesLabor' | 'taxesMaterials' | 'taxesEquipment' | 'taxesFees'> = {
  LABOR: 'taxesLabor',
  MATERIALS: 'taxesMaterials',
  EQUIPMENT: 'taxesEquipment',
  FEE: 'taxesFees',
};

const toRequest = (j: TaxJurisdiction, change: Partial<TaxJurisdictionRequest> = {}): TaxJurisdictionRequest => ({
  name: j.name,
  rate: j.rate,
  taxesLabor: j.taxesLabor,
  taxesMaterials: j.taxesMaterials,
  taxesEquipment: j.taxesEquipment,
  taxesFees: j.taxesFees,
  isDefault: j.isDefault,
  active: j.active,
  ...change,
});

/** Words a tax write failure from its `code`. */
function useTaxError() {
  const { t } = useTranslation();
  return (err: unknown) => {
    const code = errorCode(err);
    switch (code) {
      case 'NAME_TAKEN':
      case 'DEFAULT_REQUIRED':
      case 'DEFAULT_MUST_BE_ACTIVE':
      case 'JURISDICTION_IN_USE':
        return t(`settings.tax.errors.${code}`);
      default:
        return extractApiError(err) ?? t('settings.tax.errors.generic');
    }
  };
}

/**
 * Tax jurisdictions (where tax comes from, its rate, and which kinds of line
 * it taxes) and the class agreement installments are taxed as. Everyone can
 * read them; changing them needs MANAGE_PRICING. Nothing is deleted:
 * jurisdictions are deactivated.
 */
export default function TaxPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const taxError = useTaxError();
  const [editing, setEditing] = useState<{ jurisdiction: TaxJurisdiction | null } | null>(null);

  const { data: jurisdictions, isLoading, error, refetch } = useQuery({
    queryKey: JURISDICTIONS_KEY,
    queryFn: () => taxApi.getJurisdictions(),
  });
  const list = jurisdictions ?? [];
  const defaultOne = list.find((j) => j.isDefault);

  const update = useMutation({
    mutationFn: ({ id, request }: { id: string; request: TaxJurisdictionRequest }) => taxApi.updateJurisdiction(id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JURISDICTIONS_KEY });
      showSuccess(t('settings.tax.toast.saved'));
    },
    onError: (err) => showError(t('settings.tax.toast.saveFailed'), taxError(err)),
  });

  const classLabel = (c: TaxClass) => t(`settings.tax.class.${c}`);

  return (
    <>
      <PageHead
        title={t('settings.tax.title')}
        sub={
          list.length
            ? t('settings.tax.subtitle', {
                count: list.filter((j) => j.active).length,
                name: defaultOne?.name ?? t('settings.tax.noDefault'),
              })
            : null
        }
        actions={
          canManage && (
            <Button color="accent" size="xs" onClick={() => setEditing({ jurisdiction: null })}>
              <PlusIcon className="size-4" />
              {t('settings.tax.add')}
            </Button>
          )
        }
      />

      <div className="mt-4 flex flex-col gap-4">
        <Card>
          <CardBody flush>
            {isLoading ? (
              <LoadingState label={t('settings.tax.loading')} />
            ) : error ? (
              <ErrorState
                title={t('settings.tax.loadFailed')}
                description={extractApiError(error) ?? (error as Error).message}
                action={
                  <Button outline onClick={() => refetch()}>
                    {t('common.actions.tryAgain')}
                  </Button>
                }
              />
            ) : list.length === 0 ? (
              <EmptyState
                icon={<ReceiptPercentIcon className="size-10 text-fg-dim" />}
                title={t('settings.tax.emptyTitle')}
                description={t('settings.tax.emptyDescription')}
                action={
                  canManage && (
                    <Button color="accent" onClick={() => setEditing({ jurisdiction: null })}>
                      {t('settings.tax.add')}
                    </Button>
                  )
                }
              />
            ) : (
              <>
                <DenseTable>
                  <DenseTHead>
                    <tr>
                      <th>{t('settings.tax.col.name')}</th>
                      <th className="right">{t('settings.tax.col.rate')}</th>
                      <th>{t('settings.tax.col.taxes')}</th>
                      <th>{t('settings.tax.col.status')}</th>
                      {canManage && <th style={{ width: 40 }} />}
                    </tr>
                  </DenseTHead>
                  <tbody>
                    {list.map((j) => {
                      const taxed = CLASSES.filter((c) => j[FLAG[c]]);
                      return (
                        <DenseRow key={j.id} className={j.active ? undefined : 'opacity-55'}>
                          <td className="strong">
                            <span className="flex items-center gap-2">
                              {j.name}
                              {j.isDefault && <Tag word>{t('settings.tax.default')}</Tag>}
                            </span>
                          </td>
                          <td className="right num" data-label={t('settings.tax.col.rate')}>
                            {j.rate == null ? (
                              <Pill tone="warning">{t('settings.tax.rateNotSet')}</Pill>
                            ) : (
                              pct(j.rate)
                            )}
                          </td>
                          <td data-label={t('settings.tax.col.taxes')}>
                            {taxed.length ? taxed.map(classLabel).join(', ') : <span className="text-fg-muted">{t('settings.tax.taxesNothing')}</span>}
                          </td>
                          <td>
                            {j.active ? (
                              <Pill tone="success" dot>
                                {t('common.active')}
                              </Pill>
                            ) : (
                              <Pill tone="neutral" dot>
                                {t('common.inactive')}
                              </Pill>
                            )}
                          </td>
                          {canManage && (
                            <td className="right">
                              <Dropdown>
                                <DropdownButton as={IconButton} aria-label={t('settings.tax.actionsFor', { name: j.name })}>
                                  <EllipsisVerticalIcon className="size-4" />
                                </DropdownButton>
                                <DropdownMenu anchor="bottom end">
                                  <DropdownItem onClick={() => setEditing({ jurisdiction: j })}>
                                    <DropdownLabel>{t('common.edit')}</DropdownLabel>
                                  </DropdownItem>
                                  {j.active && !j.isDefault && (
                                    <DropdownItem onClick={() => update.mutate({ id: j.id, request: toRequest(j, { isDefault: true }) })}>
                                      <DropdownLabel>{t('settings.tax.makeDefault')}</DropdownLabel>
                                    </DropdownItem>
                                  )}
                                  {!j.isDefault && (
                                    <DropdownItem onClick={() => update.mutate({ id: j.id, request: toRequest(j, { active: !j.active }) })}>
                                      <DropdownLabel>{j.active ? t('settings.tax.deactivate') : t('settings.tax.activate')}</DropdownLabel>
                                    </DropdownItem>
                                  )}
                                </DropdownMenu>
                              </Dropdown>
                            </td>
                          )}
                        </DenseRow>
                      );
                    })}
                  </tbody>
                </DenseTable>
                <ListFooter left={t('settings.tax.footer')} />
              </>
            )}
          </CardBody>
        </Card>

        <AgreementFeeTaxCard canManage={canManage} />
      </div>

      <JurisdictionDialog
        state={editing}
        onClose={() => setEditing(null)}
        hasDefault={!!defaultOne}
      />
    </>
  );
}

function AgreementFeeTaxCard({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => taxApi.getPricingSettings() });
  const [choice, setChoice] = useState<TaxClass | null>(null);
  const current = choice ?? data?.agreementFeeTaxClass ?? null;
  const save = useMutation({
    mutationFn: (c: TaxClass) => taxApi.updatePricingSettings(c),
    onSuccess: (next) => {
      queryClient.setQueryData(SETTINGS_KEY, next);
      setChoice(null);
      showSuccess(t('settings.tax.toast.saved'));
    },
    onError: (err) => showError(t('settings.tax.toast.saveFailed'), extractApiError(err)),
  });
  if (!data) return null;
  const agreements = getName('agreement', true).toLowerCase();

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('settings.tax.agreementFee.title', { agreement: getName('agreement') })}</CardTitle>
        <CardSub>{t('settings.tax.agreementFee.sub', { agreements })}</CardSub>
      </CardHead>
      <CardBody>
        <div className="flex flex-wrap items-end gap-2">
          <Field className="w-56">
            <Label>{t('settings.tax.agreementFee.label')}</Label>
            <Select value={current ?? ''} disabled={!canManage} onChange={(e) => setChoice(e.target.value as TaxClass)}>
              {CLASSES.map((c) => (
                <option key={c} value={c}>
                  {t(`settings.tax.class.${c}`)}
                </option>
              ))}
            </Select>
          </Field>
          {canManage && choice && choice !== data.agreementFeeTaxClass && (
            <Button color="dark/zinc" disabled={save.isPending} onClick={() => save.mutate(choice)}>
              {t('settings.saveChanges')}
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function JurisdictionDialog({
  state,
  onClose,
  hasDefault,
}: {
  state: { jurisdiction: TaxJurisdiction | null } | null;
  onClose: () => void;
  hasDefault: boolean;
}) {
  return (
    <Dialog open={state != null} onClose={onClose} size="lg">
      {state && <JurisdictionForm jurisdiction={state.jurisdiction} onClose={onClose} hasDefault={hasDefault} />}
    </Dialog>
  );
}

function JurisdictionForm({
  jurisdiction,
  onClose,
  hasDefault,
}: {
  jurisdiction: TaxJurisdiction | null;
  onClose: () => void;
  hasDefault: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const taxError = useTaxError();
  const [name, setName] = useState(jurisdiction?.name ?? '');
  const [rate, setRate] = useState(jurisdiction?.rate != null ? String(parseFloat((jurisdiction.rate * 100).toFixed(4))) : '');
  const [flags, setFlags] = useState({
    taxesLabor: jurisdiction?.taxesLabor ?? false,
    taxesMaterials: jurisdiction?.taxesMaterials ?? true,
    taxesEquipment: jurisdiction?.taxesEquipment ?? true,
    taxesFees: jurisdiction?.taxesFees ?? false,
  });
  // The first jurisdiction becomes the default; the server needs one.
  const [isDefault, setIsDefault] = useState(jurisdiction?.isDefault ?? !hasDefault);
  const rateNum = Number(rate);
  const rateOk = rate.trim() === '' || (Number.isFinite(rateNum) && rateNum >= 0 && rateNum < 100);
  const ready = name.trim() !== '' && rateOk;

  const save = useMutation({
    mutationFn: () => {
      const request: TaxJurisdictionRequest = {
        name: name.trim(),
        rate: rate.trim() === '' ? null : Math.round(rateNum * 10000) / 1000000,
        ...flags,
        isDefault,
        active: jurisdiction?.active ?? true,
      };
      return jurisdiction ? taxApi.updateJurisdiction(jurisdiction.id, request) : taxApi.createJurisdiction(request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JURISDICTIONS_KEY });
      showSuccess(t('settings.tax.toast.saved'));
      onClose();
    },
    onError: (err) => showError(t('settings.tax.toast.saveFailed'), taxError(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !save.isPending) save.mutate();
  };

  return (
    <form onSubmit={submit}>
      <DialogTitle>{jurisdiction ? t('settings.tax.form.editTitle', { name: jurisdiction.name }) : t('settings.tax.add')}</DialogTitle>
      <DialogDescription>{t('settings.tax.form.description')}</DialogDescription>
      <DialogBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
          <Field>
            <Label>{t('settings.tax.form.name')}</Label>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.tax.form.namePlaceholder')} />
          </Field>
          <Field>
            <Label>{t('settings.tax.form.rate')}</Label>
            <Input
              inputMode="decimal"
              value={rate}
              invalid={!rateOk}
              onChange={(e) => setRate(e.target.value)}
              placeholder={t('settings.tax.form.ratePlaceholder')}
              className="[&_input]:text-right"
            />
          </Field>
        </div>
        <p className="mt-1 text-[11.5px] text-fg-muted">{t('settings.tax.form.rateHint')}</p>
        <Fieldset className="mt-4">
          <Legend className="!text-[13px]">{t('settings.tax.form.taxes')}</Legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CLASSES.map((c) => (
              <CheckboxField key={c}>
                <Checkbox checked={flags[FLAG[c]]} onChange={(v) => setFlags((f) => ({ ...f, [FLAG[c]]: v }))} />
                <Label>{t(`settings.tax.class.${c}`)}</Label>
              </CheckboxField>
            ))}
          </div>
        </Fieldset>
        <CheckboxField className="mt-4">
          <Checkbox checked={isDefault} disabled={!!jurisdiction?.isDefault} onChange={setIsDefault} />
          <Label>{t('settings.tax.form.default')}</Label>
          <Description>
            {jurisdiction?.isDefault ? t('settings.tax.form.defaultLocked') : t('settings.tax.form.defaultHint')}
          </Description>
        </CheckboxField>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={save.isPending}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!ready || save.isPending}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </form>
  );
}
