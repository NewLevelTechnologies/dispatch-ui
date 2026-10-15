import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { XMarkIcon } from '@heroicons/react/16/solid';
import { laborRatesApi, ratePlansApi, type PlanLaborRate, type RatePlan, type RatePlanRequest } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Checkbox, CheckboxField } from '../../components/catalyst/checkbox';
import { Description, Field, Label } from '../../components/catalyst/fieldset';
import { Heading } from '../../components/catalyst/heading';
import { Input } from '../../components/catalyst/input';
import { Radio, RadioField, RadioGroup } from '../../components/catalyst/radio';
import { Select } from '../../components/catalyst/select';
import { Text } from '../../components/catalyst/text';
import { FormSection, ViewOnlyNotice } from '../../components/settings/PricingPageParts';
import {
  adjustmentPercent,
  multiplierFrom,
  rowsToTiers,
  tiersToRows,
  tiersValid,
  type TierRow,
} from '../../components/pricebook/ratePlanModel';
import { RATE_PLANS_KEY, useRatePlanError } from '../../components/pricebook/ratePlanRequests';
import { PlanAccountsSection } from '../../components/pricebook/PlanAccountsSection';
import { Card } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { useEntityNames } from '../../hooks/useEntityNames';

/** The worked example under the adjustment. */
const EXAMPLE_PRICE = 120;
/** A new plan's starting tiers, when parts are switched to cost + markup. */
const STARTER_TIERS: TierRow[] = [
  { upTo: '50', markup: '60' },
  { upTo: '', markup: '35' },
];

interface FormState {
  name: string;
  description: string;
  /** Rate type id → typed bill rate; absent = Standard. */
  labor: Record<string, string>;
  parts: 'catalog' | 'tiers';
  tiers: TierRow[];
  adjust: string;
  memberBenefitsStack: boolean;
}

function fromPlan(plan: RatePlan, copy: boolean): FormState {
  return {
    name: copy ? `${plan.name} (copy)` : plan.name,
    description: plan.description ?? '',
    labor: Object.fromEntries(plan.laborRates.map((l) => [l.laborRateTypeId, String(l.billRate)])),
    parts: plan.markupTiers.length ? 'tiers' : 'catalog',
    tiers: plan.markupTiers.length ? tiersToRows(plan.markupTiers) : STARTER_TIERS,
    adjust: String(adjustmentPercent(plan.priceMultiplier)),
    memberBenefitsStack: plan.memberBenefitsStack,
  };
}

const BLANK: FormState = { name: '', description: '', labor: {}, parts: 'catalog', tiers: STARTER_TIERS, adjust: '0', memberBenefitsStack: true };

/**
 * Create or edit a rate plan: labor rates, how parts are priced, an overall
 * adjustment and whether member discounts apply on top. A form page
 * because it has sections. Opens read-only without MANAGE_PRICING.
 * `/settings/rate-plans/new?from=<id>` starts from a copy.
 */
export default function RatePlanPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params] = useSearchParams();
  const sourceId = id ?? params.get('from');
  const { data: source, isLoading, error } = useQuery({
    queryKey: [...RATE_PLANS_KEY, 'one', sourceId],
    queryFn: () => ratePlansApi.get(sourceId!),
    enabled: !!sourceId,
  });

  if (sourceId && isLoading) return <LoadingState label={t('settings.ratePlans.loadingPlan')} />;
  if (sourceId && (error || !source)) {
    return <ErrorState title={t('settings.ratePlans.loadPlanFailed')} description={error ? extractApiError(error) : undefined} />;
  }
  return (
    <PlanForm
      key={`${id ?? 'new'}-${source?.updatedAt ?? ''}`}
      plan={id ? (source ?? null) : null}
      copiedFrom={id ? null : (source ?? null)}
      initial={source ? fromPlan(source, !id) : BLANK}
    />
  );
}

function PlanForm({ plan, copiedFrom, initial }: { plan: RatePlan | null; copiedFrom: RatePlan | null; initial: FormState }) {
  const names = useEntityNames();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const readOnly = !canManage;
  const planError = useRatePlanError();
  const [f, setF] = useState(initial);
  const set = (patch: Partial<FormState>) => setF((x) => ({ ...x, ...patch }));

  const { data: rates = [] } = useQuery({ queryKey: ['labor-rates'], queryFn: () => laborRatesApi.getAll() });
  const activeRates = rates.filter((r) => r.active);
  const activeIds = new Set(activeRates.map((r) => r.id));

  const adjust = f.adjust.trim() === '' ? 0 : Number(f.adjust);
  const adjustOk = Number.isFinite(adjust) && adjust > -100;
  const laborOk = Object.values(f.labor).every((v) => v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0);
  const tiersOk = f.parts === 'catalog' || tiersValid(f.tiers);
  const ready = f.name.trim() !== '' && adjustOk && laborOk && tiersOk;

  const save = useMutation({
    mutationFn: () => {
      const source = plan ?? copiedFrom;
      // Overrides for rate types since deactivated aren't shown, so they're kept as they were.
      const hidden: PlanLaborRate[] = (source?.laborRates ?? []).filter((l) => !activeIds.has(l.laborRateTypeId));
      const request: RatePlanRequest = {
        name: f.name.trim(),
        description: f.description.trim() || null,
        isDefault: plan?.isDefault ?? false,
        priceMultiplier: multiplierFrom(adjust),
        memberBenefitsStack: f.memberBenefitsStack,
        active: plan?.active ?? true,
        laborRates: [
          ...Object.entries(f.labor)
            .filter(([rateId]) => activeIds.has(rateId))
            .map(([laborRateTypeId, v]) => ({ laborRateTypeId, billRate: Number(v) })),
          ...hidden,
        ],
        markupTiers: f.parts === 'tiers' ? rowsToTiers(f.tiers) : [],
        // Not edited here; a save keeps them.
        categoryMultipliers: source?.categoryMultipliers ?? [],
      };
      return plan ? ratePlansApi.update(plan.id, request) : ratePlansApi.create(request);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: RATE_PLANS_KEY });
      showSuccess(t('settings.ratePlans.toast.saved', { name: saved.name }));
      navigate('/settings/rate-plans');
    },
    onError: (err) => showError(t('settings.ratePlans.toast.saveFailed'), planError(err)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !save.isPending && !readOnly) save.mutate();
  };

  const setTier = (i: number, patch: Partial<TierRow>) => set({ tiers: f.tiers.map((r, k) => (k === i ? { ...r, ...patch } : r)) });
  const addTier = () => {
    // A new range goes in before "and up", starting where the last bounded one ended.
    const rows = [...f.tiers];
    const last = rows.pop()!;
    const floor = rows.length ? Number(rows[rows.length - 1].upTo) || 0 : 0;
    set({ tiers: [...rows, { upTo: String(floor + 250), markup: last.markup }, last] });
  };
  const removeTier = (i: number) => {
    const rows = f.tiers.filter((_, k) => k !== i);
    rows[rows.length - 1] = { ...rows[rows.length - 1], upTo: '' };
    set({ tiers: rows });
  };

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100svh-52px)] min-h-0 flex-col max-lg:-mx-4 max-lg:-my-4">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-7 pb-6 pt-5 max-lg:px-4">
          <div className="max-w-[880px]">
            <Link to="/settings/rate-plans" className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong">
              ← {t('settings.ratePlans.title')}
            </Link>
            <Heading level={1} size="page-md" className="m-0">
              {plan ? plan.name : t('settings.ratePlans.form.newTitle')}
            </Heading>
            {plan?.isDefault && (
              <Text size="sm" tone="muted" className="mt-0.5">
                {t('settings.ratePlans.form.defaultNote')}
              </Text>
            )}
            <div className="mt-3.5">{readOnly && <ViewOnlyNotice />}</div>

            <Card className="px-5 py-1">
              <fieldset disabled={readOnly} className="contents">
                <FormSection title={t('settings.ratePlans.form.details')}>
                  <Field className="max-w-[420px]">
                    <Label>{t('settings.ratePlans.form.name')}</Label>
                    <Input
                      autoFocus={!plan && !readOnly}
                      value={f.name}
                      onChange={(e) => set({ name: e.target.value })}
                      placeholder={t('settings.ratePlans.form.namePlaceholder')}
                    />
                  </Field>
                  <Field>
                    <Label>{t('settings.ratePlans.form.description')}</Label>
                    <Input
                      value={f.description}
                      maxLength={500}
                      onChange={(e) => set({ description: e.target.value })}
                      placeholder={t('settings.ratePlans.form.optional')}
                    />
                    <Description>{t('settings.ratePlans.form.descriptionHint')}</Description>
                  </Field>
                </FormSection>

                <FormSection title={t('settings.ratePlans.form.labor')} description={t('settings.ratePlans.form.laborHint')}>
                  <div className="overflow-hidden rounded-md border border-border">
                    <DenseTable>
                      <DenseTHead>
                        <tr>
                          <th>{t('settings.ratePlans.form.rate')}</th>
                          <th className="right">{t('settings.ratePlans.form.standard')}</th>
                          <th style={{ width: 230 }}>{t('settings.ratePlans.form.thisPlan')}</th>
                        </tr>
                      </DenseTHead>
                      <tbody>
                        {activeRates.map((r) => {
                          const custom = f.labor[r.id] !== undefined;
                          return (
                            <DenseRow key={r.id}>
                              <td className="font-medium text-fg-strong">{r.name}</td>
                              <td className="right num text-fg-muted">
                                {r.billRate == null
                                  ? t('settings.ratePlans.form.notSet')
                                  : t('settings.laborRates.perHour', { amount: formatCurrency(r.billRate) })}
                              </td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <Select
                                    size="xs"
                                    aria-label={t('settings.ratePlans.form.rateChoice', { name: r.name })}
                                    value={custom ? 'custom' : 'standard'}
                                    onChange={(e) => {
                                      const labor = { ...f.labor };
                                      if (e.target.value === 'standard') delete labor[r.id];
                                      else labor[r.id] = r.billRate == null ? '' : String(r.billRate);
                                      set({ labor });
                                    }}
                                    className="!w-[104px]"
                                  >
                                    <option value="standard">{t('settings.ratePlans.form.standard')}</option>
                                    <option value="custom">{t('settings.ratePlans.form.custom')}</option>
                                  </Select>
                                  {custom && (
                                    <Input
                                      size="xs"
                                      inputMode="decimal"
                                      aria-label={t('settings.ratePlans.form.customRate', { name: r.name })}
                                      value={f.labor[r.id]}
                                      invalid={!(f.labor[r.id].trim() !== '' && Number(f.labor[r.id]) >= 0)}
                                      onChange={(e) => set({ labor: { ...f.labor, [r.id]: e.target.value } })}
                                      className="!w-[100px] [&_input]:text-right"
                                    />
                                  )}
                                </div>
                              </td>
                            </DenseRow>
                          );
                        })}
                      </tbody>
                    </DenseTable>
                  </div>
                </FormSection>

                <FormSection title={t('settings.ratePlans.form.parts')} description={t('settings.ratePlans.form.partsHint', names)}>
                  <RadioGroup value={f.parts} onChange={(v) => set({ parts: v as FormState['parts'] })} aria-label={t('settings.ratePlans.form.parts')}>
                    <RadioField>
                      <Radio value="catalog" disabled={readOnly} />
                      <Label>{t('settings.ratePlans.form.partsCatalog')}</Label>
                      <Description>{t('settings.ratePlans.form.partsCatalogHint')}</Description>
                    </RadioField>
                    <RadioField>
                      <Radio value="tiers" disabled={readOnly} />
                      <Label>{t('settings.ratePlans.form.partsTiers')}</Label>
                      <Description>{t('settings.ratePlans.form.partsTiersHint')}</Description>
                    </RadioField>
                  </RadioGroup>
                  {f.parts === 'tiers' && (
                    <div className="overflow-hidden rounded-md border border-border">
                      <DenseTable>
                        <DenseTHead>
                          <tr>
                            <th>{t('settings.ratePlans.form.unitCost')}</th>
                            <th style={{ width: 130 }}>{t('settings.ratePlans.form.markup')}</th>
                            <th className="right">{t('settings.ratePlans.form.example')}</th>
                            <th style={{ width: 40 }} />
                          </tr>
                        </DenseTHead>
                        <tbody>
                          {f.tiers.map((row, i) => {
                            const last = i === f.tiers.length - 1;
                            const lo = i === 0 ? 0 : Number(f.tiers[i - 1].upTo) || 0;
                            const hi = Number(row.upTo) || 0;
                            const sample = last ? Math.max(lo * 2, 400) : Math.round((lo + hi) / 2);
                            const markup = Number(row.markup) || 0;
                            return (
                              <DenseRow key={i}>
                                <td>
                                  <div className="flex items-center gap-1.5 tabular-nums">
                                    <span className="text-fg-muted">{formatCurrency(lo)} –</span>
                                    {last ? (
                                      <span>{t('settings.ratePlans.form.andUp')}</span>
                                    ) : (
                                      <Input
                                        size="xs"
                                        inputMode="decimal"
                                        aria-label={t('settings.ratePlans.form.upTo', { n: i + 1 })}
                                        value={row.upTo}
                                        onChange={(e) => setTier(i, { upTo: e.target.value })}
                                        className="!w-[100px] [&_input]:text-right"
                                      />
                                    )}
                                  </div>
                                </td>
                                <td>
                                  <Input
                                    size="xs"
                                    inputMode="decimal"
                                    aria-label={t('settings.ratePlans.form.tierMarkup', { n: i + 1 })}
                                    value={row.markup}
                                    onChange={(e) => setTier(i, { markup: e.target.value })}
                                    className="!w-[90px] [&_input]:text-right"
                                  />
                                </td>
                                <td className="right num text-fg-muted">
                                  {formatCurrency(sample)} →{' '}
                                  <span className="font-semibold text-fg-strong">{formatCurrency(Math.round(sample * (1 + markup / 100) * 100) / 100)}</span>
                                </td>
                                <td className="right">
                                  {!readOnly && !last && (
                                    <Button plain size="xs" aria-label={t('settings.ratePlans.form.removeTier', { n: i + 1 })} onClick={() => removeTier(i)}>
                                      <XMarkIcon />
                                    </Button>
                                  )}
                                </td>
                              </DenseRow>
                            );
                          })}
                        </tbody>
                      </DenseTable>
                      {!readOnly && (
                        <div className="flex items-center gap-3 border-t border-border-soft px-3 py-2">
                          <Button plain size="xs" onClick={addTier}>
                            {t('settings.ratePlans.form.addTier')}
                          </Button>
                          {!tiersOk && <span className="text-[11.5px] text-warning-fg">{t('settings.ratePlans.form.tiersInvalid')}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </FormSection>

                <FormSection title={t('settings.ratePlans.form.adjustment')} description={t('settings.ratePlans.form.adjustmentHint')}>
                  <div className="flex flex-wrap items-end gap-3">
                    <Field className="w-32">
                      <Label>{t('settings.ratePlans.form.adjustmentLabel')}</Label>
                      <Input
                        inputMode="decimal"
                        value={f.adjust}
                        invalid={!adjustOk}
                        onChange={(e) => set({ adjust: e.target.value })}
                        className="[&_input]:text-right"
                      />
                    </Field>
                    <p className="pb-2 text-[12px] tabular-nums text-fg-muted">
                      {t('settings.ratePlans.form.adjustmentExample', { price: formatCurrency(EXAMPLE_PRICE) })}{' '}
                      <span className="font-semibold text-fg-strong">
                        {formatCurrency(adjustOk ? Math.round(EXAMPLE_PRICE * (1 + adjust / 100) * 100) / 100 : EXAMPLE_PRICE)}
                      </span>
                      . {t('settings.ratePlans.form.adjustmentNegative')}
                    </p>
                  </div>
                </FormSection>

                <FormSection title={t('settings.ratePlans.form.members')} description={t('settings.ratePlans.form.membersHint', names)}>
                  <CheckboxField>
                    <Checkbox checked={f.memberBenefitsStack} onChange={(v) => set({ memberBenefitsStack: v })} disabled={readOnly} />
                    <Label>{t('settings.ratePlans.form.membersStack')}</Label>
                    <Description>{t('settings.ratePlans.form.membersStackHint')}</Description>
                  </CheckboxField>
                </FormSection>
              </fieldset>
              {plan && !plan.isDefault && (
                <FormSection title={t('settings.ratePlans.form.accounts')} description={t('settings.ratePlans.form.accountsHint', names)}>
                  <PlanAccountsSection planId={plan.id} planName={plan.name} canManage={canManage} />
                </FormSection>
              )}
            </Card>
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border bg-bg-elev px-7 py-3 max-lg:px-4">
            <Text size="sm" tone="muted" className="max-sm:basis-full">
              {t('settings.ratePlans.form.keepPrices', names)}
            </Text>
            <span className="flex-1" />
            <Button href="/settings/rate-plans" plain size="xs">
              {t('common.cancel')}
            </Button>
            <Button type="submit" color="accent" size="xs" disabled={!ready || save.isPending}>
              {plan ? t('settings.saveChanges') : t('settings.ratePlans.form.create')}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
