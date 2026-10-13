import { useState, type FormEvent } from 'react';
import clsx from 'clsx';
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
import { Text } from '../../components/catalyst/text';
import { InactiveToggle, SetupIssues, ViewOnlyNotice } from '../../components/settings/PricingPageParts';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
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
  const [showInactive, setShowInactive] = useState(false);

  const { data: jurisdictions, isLoading, error, refetch } = useQuery({
    queryKey: JURISDICTIONS_KEY,
    queryFn: () => taxApi.getJurisdictions(),
  });
  const list = jurisdictions ?? [];
  const rows = list.filter((j) => j.active || showInactive);
  const defaultOne = list.find((j) => j.isDefault);
  const noRate = list.filter((j) => j.active && j.rate == null);

  const update = useMutation({
    mutationFn: ({ id, request }: { id: string; request: TaxJurisdictionRequest }) => taxApi.updateJurisdiction(id, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JURISDICTIONS_KEY });
      showSuccess(t('settings.tax.toast.saved'));
    },
    onError: (err) => showError(t('settings.tax.toast.saveFailed'), taxError(err)),
  });

  return (
    <>
      <PageHead
        title={t('settings.tax.title')}
        sub={t('settings.tax.description')}
        actions={
          canManage && (
            <Button color="accent" size="xs" onClick={() => setEditing({ jurisdiction: null })}>
              <PlusIcon className="size-4" />
              {t('settings.tax.add')}
            </Button>
          )
        }
      />
      {!canManage && <ViewOnlyNotice />}
      <SetupIssues
        issues={noRate.map((j) => ({
          key: j.id,
          text: t('settings.tax.issueNoRate', { name: j.name }),
          action: canManage ? { label: t('settings.tax.setRate'), onClick: () => setEditing({ jurisdiction: j }) } : undefined,
        }))}
      />

      <div className="flex flex-col gap-3">
        <Card>
          <CardHead>
            <CardTitle>{t('settings.tax.cardTitle')}</CardTitle>
            {list.length > 0 && <CardSub>{rows.length}</CardSub>}
            <span className="flex-1" />
            <InactiveToggle count={list.length - list.filter((j) => j.active).length} shown={showInactive} onToggle={() => setShowInactive((s) => !s)} />
          </CardHead>
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
              <DenseTable className="min-w-[640px]">
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
                  {rows.map((j) => (
                    <DenseRow
                      key={j.id}
                      onClick={canManage ? () => setEditing({ jurisdiction: j }) : undefined}
                      className={j.active ? undefined : 'opacity-55'}
                    >
                      <td>
                        <span className="flex items-center gap-2 font-semibold text-fg-strong">
                          {j.name}
                          {j.isDefault && <Tag word>{t('settings.tax.default')}</Tag>}
                        </span>
                      </td>
                      <td className="right num" data-label={t('settings.tax.col.rate')}>
                        {j.rate == null ? (
                          <Pill tone="warning">{t('settings.tax.rateNotSet')}</Pill>
                        ) : (
                          <span className="font-semibold text-fg-strong">{pct(j.rate)}</span>
                        )}
                      </td>
                      <td data-label={t('settings.tax.col.taxes')}>
                        <TaxedClasses jurisdiction={j} />
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
                        <td className="right" onClick={(e) => e.stopPropagation()}>
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
                              <DropdownItem
                                disabled={j.isDefault}
                                title={j.isDefault ? t('settings.tax.defaultCantDeactivate') : undefined}
                                onClick={() => update.mutate({ id: j.id, request: toRequest(j, { active: !j.active }) })}
                              >
                                <DropdownLabel>{j.active ? t('settings.tax.deactivate') : t('settings.tax.activate')}</DropdownLabel>
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </td>
                      )}
                    </DenseRow>
                  ))}
                </tbody>
              </DenseTable>
            )}
          </CardBody>
        </Card>

        <LineSourceTaxCard canManage={canManage} />
      </div>

      <JurisdictionDialog
        state={editing}
        onClose={() => setEditing(null)}
        defaultName={defaultOne?.name ?? null}
      />
    </>
  );
}

/** All four classes: taxed ones solid, untaxed ones dashed and struck through, so what isn't taxed shows too. */
function TaxedClasses({ jurisdiction }: { jurisdiction: TaxJurisdiction }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-wrap gap-1">
      {CLASSES.map((c) => {
        const on = jurisdiction[FLAG[c]];
        const name = t(`settings.tax.class.${c}`);
        return (
          <span
            key={c}
            title={on ? t('settings.tax.classTaxed', { name }) : t('settings.tax.classNotTaxed', { name })}
            className={clsx(
              'rounded-full px-1.5 py-px text-[11px] font-semibold',
              on
                ? 'border border-[color-mix(in_oklch,var(--accent-500)_35%,var(--border))] bg-[color-mix(in_oklch,var(--accent-500)_10%,transparent)] text-fg-strong'
                : 'border border-dashed border-border-strong text-fg-muted line-through decoration-border-strong',
            )}
          >
            <span className="sr-only">{on ? t('settings.tax.taxedPrefix') : t('settings.tax.notTaxedPrefix')}</span>
            {name}
          </span>
        );
      })}
    </span>
  );
}

/** Which tax class each kind of line is taxed as; only agreement installments are a setting. */
function LineSourceTaxCard({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const { getName } = useGlossary();
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => taxApi.getPricingSettings() });
  const save = useMutation({
    mutationFn: (c: TaxClass) => taxApi.updatePricingSettings(c),
    onSuccess: (next) => {
      queryClient.setQueryData(SETTINGS_KEY, next);
      showSuccess(t('settings.tax.lineSource.saved', { agreement: getName('agreement') }));
    },
    onError: (err) => showError(t('settings.tax.toast.saveFailed'), extractApiError(err)),
  });
  if (!data) return null;
  const classLabel = (c: TaxClass) => t(`settings.tax.class.${c}`);

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('settings.tax.lineSource.title')}</CardTitle>
      </CardHead>
      <CardBody flush>
        <DenseTable>
          <DenseTHead>
            <tr>
              <th>{t('settings.tax.lineSource.col.source')}</th>
              <th>{t('settings.tax.lineSource.col.class')}</th>
              <th>{t('settings.tax.lineSource.col.notes')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            <DenseRow>
              <td className="font-semibold text-fg-strong">{t('settings.tax.lineSource.pricebook')}</td>
              <td>{t('settings.tax.lineSource.perItem')}</td>
              <td className="text-fg-muted">{t('settings.tax.lineSource.pricebookNote')}</td>
            </DenseRow>
            <DenseRow>
              <td className="font-semibold text-fg-strong">{t('settings.tax.lineSource.labor')}</td>
              <td>{classLabel('LABOR')}</td>
              <td className="text-fg-muted">{t('settings.tax.lineSource.fixed')}</td>
            </DenseRow>
            <DenseRow>
              <td className="font-semibold text-fg-strong">{t('settings.tax.lineSource.agreement', { agreement: getName('agreement') })}</td>
              <td>
                {canManage ? (
                  <Select
                    aria-label={t('settings.tax.lineSource.agreementLabel', { agreement: getName('agreement') })}
                    value={data.agreementFeeTaxClass}
                    disabled={save.isPending}
                    onChange={(e) => save.mutate(e.target.value as TaxClass)}
                    className="!w-40"
                  >
                    {CLASSES.map((c) => (
                      <option key={c} value={c}>
                        {classLabel(c)}
                      </option>
                    ))}
                  </Select>
                ) : (
                  classLabel(data.agreementFeeTaxClass)
                )}
              </td>
              <td className="text-fg-muted">{t('settings.tax.lineSource.agreementNote')}</td>
            </DenseRow>
          </tbody>
        </DenseTable>
      </CardBody>
    </Card>
  );
}

function JurisdictionDialog({
  state,
  onClose,
  defaultName,
}: {
  state: { jurisdiction: TaxJurisdiction | null } | null;
  onClose: () => void;
  defaultName: string | null;
}) {
  return (
    <Dialog open={state != null} onClose={onClose} size="lg">
      {state && <JurisdictionForm jurisdiction={state.jurisdiction} onClose={onClose} defaultName={defaultName} />}
    </Dialog>
  );
}

function JurisdictionForm({
  jurisdiction,
  onClose,
  defaultName,
}: {
  jurisdiction: TaxJurisdiction | null;
  onClose: () => void;
  defaultName: string | null;
}) {
  const hasDefault = defaultName != null;
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
          <Text size="sm" tone="muted" className="mt-0.5">{t('settings.tax.form.taxesHint')}</Text>
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
            {jurisdiction?.isDefault
              ? t('settings.tax.form.defaultLocked')
              : hasDefault
                ? t('settings.tax.form.defaultHint', { name: defaultName })
                : t('settings.tax.form.defaultHintFirst')}
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
