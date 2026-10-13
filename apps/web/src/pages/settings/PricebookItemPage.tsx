import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import {
  laborRatesApi,
  pricebookApi,
  type FeeRole,
  type PricebookItem,
  type PricebookItemRequest,
  type PricebookItemType,
  type PricingMode,
  type TaxClass,
} from '../../api/setup';
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
  DEFAULT_TAX_CLASS,
  ITEM_TYPES,
  categoryTree,
  computedPrice,
  fromPercent,
  itemMargin,
  markupPrice,
  toPercent,
} from '../../components/pricebook/pricebookModel';
import { CATEGORIES_KEY, ITEMS_KEY, usePricebookError } from '../../components/pricebook/pricebookRequests';
import { Callout } from '../../components/ui/Callout';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { Tag } from '../../components/ui/Pill';
import { ToggleGroup, ToggleGroupOption } from '../../components/ui/ToggleGroup';
import { errorCode, extractApiError, showError, showSuccess } from '../../lib/toast';

const TAX_CLASSES: TaxClass[] = ['LABOR', 'MATERIALS', 'EQUIPMENT', 'FEE'];
const FEE_ROLES: FeeRole[] = ['TRIP', 'DIAGNOSTIC', 'AFTER_HOURS', 'DISPOSAL', 'OTHER'];
const UNITS = ['ea', 'hr', 'lb', 'ft', 'gal', 'job'];

/** The pricing modes an item type allows; computed is for services only, fees are a fixed price. */
const MODES: Record<PricebookItemType, PricingMode[]> = {
  SERVICE: ['FIXED', 'COMPUTED'],
  MATERIAL: ['FIXED', 'MARKUP'],
  EQUIPMENT: ['FIXED', 'MARKUP'],
  FEE: ['FIXED'],
};

interface FormState {
  itemType: PricebookItemType;
  feeRole: FeeRole | '';
  name: string;
  sku: string;
  categoryId: string;
  unit: string;
  taxClass: TaxClass;
  pricingMode: PricingMode;
  unitPrice: string;
  unitCost: string;
  markup: string;
  laborHours: string;
  materialsCost: string;
  active: boolean;
}

const str = (n: number | null | undefined) => (n == null ? '' : String(n));

function fromItem(item: PricebookItem, copy: boolean): FormState {
  return {
    itemType: item.itemType,
    feeRole: item.feeRole ?? '',
    name: copy ? `${item.name} (copy)` : item.name,
    sku: copy ? '' : (item.sku ?? ''),
    categoryId: item.categoryId ?? '',
    unit: item.unit,
    taxClass: item.taxClass,
    pricingMode: item.pricingMode,
    unitPrice: item.pricingMode === 'FIXED' ? str(item.unitPrice) : '',
    unitCost: str(item.unitCost),
    markup: str(toPercent(item.markupPct)),
    laborHours: str(item.laborHours),
    materialsCost: str(item.materialsCost),
    active: copy ? true : item.active,
  };
}

const blank = (categoryId: string): FormState => ({
  itemType: 'SERVICE',
  feeRole: '',
  name: '',
  sku: '',
  categoryId,
  unit: 'ea',
  taxClass: 'LABOR',
  pricingMode: 'FIXED',
  unitPrice: '',
  unitCost: '',
  markup: '',
  laborHours: '1',
  materialsCost: '',
  active: true,
});

/**
 * Create or edit a pricebook item: a form page because it has sections
 * (item, pricing, tax, status). Opens read-only without MANAGE_PRICING.
 * `/settings/pricebook/new?from=<id>` starts from a copy; `?category=`
 * preselects the category.
 */
export default function PricebookItemPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [params] = useSearchParams();
  const fromId = id ? null : params.get('from');
  const sourceId = id ?? fromId;
  const { data: source, isLoading, error } = useQuery({
    queryKey: [...ITEMS_KEY, 'one', sourceId],
    queryFn: () => pricebookApi.getItem(sourceId!),
    enabled: !!sourceId,
  });

  if (sourceId && isLoading) return <LoadingState label={t('settings.pricebook.loadingItem')} />;
  if (sourceId && (error || !source)) {
    return <ErrorState title={t('settings.pricebook.loadItemFailed')} description={error ? extractApiError(error) : undefined} />;
  }
  // Keyed so a different item (or a fresh copy) starts a fresh form.
  return (
    <ItemForm
      key={`${id ?? 'new'}-${source?.version ?? ''}`}
      item={id ? (source ?? null) : null}
      initial={source ? fromItem(source, !id) : blank(params.get('category') ?? '')}
    />
  );
}

function ItemForm({ item, initial }: { item: PricebookItem | null; initial: FormState }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const readOnly = !canManage;
  const pricebookError = usePricebookError();
  const [f, setF] = useState(initial);
  const set = (patch: Partial<FormState>) => setF((x) => ({ ...x, ...patch }));

  const { data: categories = [] } = useQuery({ queryKey: CATEGORIES_KEY, queryFn: () => pricebookApi.getCategories() });
  const { data: rates = [] } = useQuery({ queryKey: ['labor-rates'], queryFn: () => laborRatesApi.getAll() });
  const regular = rates.find((r) => r.role === 'REGULAR') ?? null;
  const categoryOptions = categoryTree(categories.filter((c) => c.active || c.id === f.categoryId));

  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const valid = (n: number | null) => n == null || (Number.isFinite(n) && n >= 0);
  const price = num(f.unitPrice);
  const cost = num(f.unitCost);
  const markup = num(f.markup);
  const hours = num(f.laborHours);
  const materials = num(f.materialsCost);
  const computed =
    f.pricingMode === 'COMPUTED' ? computedPrice(hours ?? 0, regular?.billRate ?? null, materials ?? 0, fromPercent(markup ?? 0)) : null;
  const shownPrice =
    f.pricingMode === 'FIXED' ? price : f.pricingMode === 'MARKUP' ? (cost != null ? markupPrice(cost, fromPercent(markup ?? 0)) : null) : (computed?.price ?? null);
  // A computed item's cost is its parts; labor cost isn't known per item.
  const shownCost = f.pricingMode === 'COMPUTED' ? materials : cost;
  const margin = itemMargin(shownPrice, shownCost);

  const pricingReady =
    f.pricingMode === 'FIXED'
      ? price != null && valid(price) && valid(cost)
      : f.pricingMode === 'MARKUP'
        ? cost != null && valid(cost) && markup != null && valid(markup)
        : hours != null && hours > 0 && valid(materials) && valid(markup);
  const ready = f.name.trim() !== '' && (f.itemType !== 'FEE' || f.feeRole !== '') && pricingReady;

  const changeType = (itemType: PricebookItemType) =>
    set({
      itemType,
      taxClass: DEFAULT_TAX_CLASS[itemType],
      pricingMode: 'FIXED',
      feeRole: itemType === 'FEE' ? f.feeRole : '',
      unit: itemType === 'SERVICE' || itemType === 'FEE' ? 'ea' : f.unit,
    });

  const save = useMutation({
    mutationFn: () => {
      const request: PricebookItemRequest = {
        ...(item ? { version: item.version } : {}),
        itemType: f.itemType,
        feeRole: f.itemType === 'FEE' && f.feeRole ? f.feeRole : null,
        name: f.name.trim(),
        sku: f.sku.trim() || null,
        categoryId: f.categoryId || null,
        unit: f.unit.trim() || null,
        taxClass: f.taxClass,
        pricingMode: f.pricingMode,
        unitPrice: f.pricingMode === 'FIXED' ? price : null,
        unitCost: f.pricingMode === 'COMPUTED' ? null : cost,
        markupPct: f.pricingMode === 'FIXED' || markup == null ? null : fromPercent(markup),
        laborHours: f.pricingMode === 'COMPUTED' ? hours : null,
        materialsCost: f.pricingMode === 'COMPUTED' ? materials : null,
        active: f.active,
      };
      return item ? pricebookApi.updateItem(item.id, request) : pricebookApi.createItem(request);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
      showSuccess(t('settings.pricebook.toast.saved', { name: saved.name }));
      navigate('/settings/pricebook');
    },
    onError: (err) => {
      showError(t('settings.pricebook.toast.saveFailed'), pricebookError(err));
      if (errorCode(err) === 'STALE_VERSION') queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !save.isPending && !readOnly) save.mutate();
  };

  const typeLabel = (it: PricebookItemType) => t(`settings.pricebook.type.${it}`);
  const defaultClass = DEFAULT_TAX_CLASS[f.itemType];

  return (
    <div className="-mx-6 -my-6 flex h-[calc(100svh-52px)] min-h-0 flex-col max-lg:-mx-4 max-lg:-my-4">
      <form id="pricebook-item-form" onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-7 pb-6 pt-5 max-lg:px-4">
          <div className="max-w-[880px]">
            <Link to="/settings/pricebook" className="mb-2.5 inline-flex items-center gap-1 text-[11.5px] text-fg-muted hover:text-fg-strong">
              ← {t('settings.pricebook.title')}
            </Link>
            <Heading level={1} size="page-md" className="m-0 mb-3.5">
              {item ? item.name : t('settings.pricebook.form.newTitle')}
            </Heading>
            {readOnly && <ViewOnlyNotice />}

            <Card className="px-5 py-1">
              <fieldset disabled={readOnly} className="contents">
                <FormSection title={t('settings.pricebook.form.itemSection')} description={t('settings.pricebook.form.itemSectionHint')}>
                  <Field>
                    <Label>{t('settings.pricebook.form.type')}</Label>
                    <div className="mt-1.5">
                      <ToggleGroup value={f.itemType} onChange={changeType} size="sm" aria-label={t('settings.pricebook.form.type')}>
                        {ITEM_TYPES.map((it) => (
                          <ToggleGroupOption key={it} value={it} disabled={readOnly || !!item}>
                            {typeLabel(it)}
                          </ToggleGroupOption>
                        ))}
                      </ToggleGroup>
                    </div>
                    {item && <Description>{t('settings.pricebook.form.typeLocked')}</Description>}
                  </Field>
                  {f.itemType === 'FEE' && (
                    <Field className="max-w-60">
                      <Label>{t('settings.pricebook.form.feeRole')}</Label>
                      <Select value={f.feeRole} onChange={(e) => set({ feeRole: e.target.value as FeeRole })} invalid={f.feeRole === ''}>
                        <option value="" disabled>
                          {t('settings.pricebook.form.feeRolePick')}
                        </option>
                        {FEE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t(`settings.pricebook.feeRole.${r}`)}
                          </option>
                        ))}
                      </Select>
                      <Description>{t('settings.pricebook.form.feeRoleHint')}</Description>
                    </Field>
                  )}
                  <Field>
                    <Label>{t('settings.pricebook.form.name')}</Label>
                    <Input autoFocus={!item && !readOnly} value={f.name} onChange={(e) => set({ name: e.target.value })} />
                    <Description>{t('settings.pricebook.form.nameHint')}</Description>
                  </Field>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field>
                      <Label>{t('settings.pricebook.form.sku')}</Label>
                      <Input value={f.sku} onChange={(e) => set({ sku: e.target.value.toUpperCase() })} className="[&_input]:font-mono" />
                    </Field>
                    <Field>
                      <Label>{t('settings.pricebook.form.category')}</Label>
                      <Select value={f.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
                        <option value="">{t('settings.pricebook.form.noCategory')}</option>
                        {categoryOptions.map(({ category, level }) => (
                          <option key={category.id} value={category.id}>
                            {'  '.repeat(level)}
                            {category.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field>
                      <Label>{t('settings.pricebook.form.unit')}</Label>
                      <Input list="pricebook-units" value={f.unit} onChange={(e) => set({ unit: e.target.value })} />
                      <datalist id="pricebook-units">
                        {UNITS.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </Field>
                  </div>
                </FormSection>

                <FormSection
                  title={t('settings.pricebook.form.pricingSection')}
                  description={
                    f.itemType === 'SERVICE'
                      ? t('settings.pricebook.form.pricingHintService')
                      : f.itemType === 'FEE'
                        ? undefined
                        : t('settings.pricebook.form.pricingHintGoods')
                  }
                >
                  {MODES[f.itemType].length > 1 && (
                    <RadioGroup
                      value={f.pricingMode}
                      onChange={(v) => set({ pricingMode: v as PricingMode })}
                      aria-label={t('settings.pricebook.form.pricingSection')}
                    >
                      {MODES[f.itemType].map((m) => (
                        <RadioField key={m}>
                          <Radio value={m} disabled={readOnly} />
                          <Label>{t(`settings.pricebook.form.mode.${f.itemType === 'SERVICE' ? 'service' : 'goods'}.${m}`)}</Label>
                        </RadioField>
                      ))}
                    </RadioGroup>
                  )}

                  {f.pricingMode === 'COMPUTED' ? (
                    <div className="flex flex-col gap-3 rounded-md border border-border p-3.5">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <MoneyField label={t('settings.pricebook.form.laborHours')} value={f.laborHours} onChange={(v) => set({ laborHours: v })} />
                        <Field>
                          <Label>{t('settings.pricebook.form.rate')}</Label>
                          <div className="mt-2 text-[12.5px] text-fg">
                            {regular?.billRate != null
                              ? t('settings.pricebook.form.regularRate', { name: regular.name, rate: formatCurrency(regular.billRate) })
                              : <span className="font-semibold text-warning-fg">{t('settings.pricebook.form.regularNotSet')}</span>}
                          </div>
                        </Field>
                        <MoneyField label={t('settings.pricebook.form.partsCost')} value={f.materialsCost} onChange={(v) => set({ materialsCost: v })} />
                        <MoneyField label={t('settings.pricebook.form.partsMarkup')} value={f.markup} onChange={(v) => set({ markup: v })} />
                      </div>
                      {computed ? (
                        <dl className="grid max-w-[360px] grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[12.5px] tabular-nums text-fg-muted">
                          <dt>{t('settings.pricebook.form.calcLabor', { hours: hours ?? 0, rate: formatCurrency(regular?.billRate ?? 0) })}</dt>
                          <dd className="text-right text-fg">{formatCurrency(computed.labor)}</dd>
                          <dt>{t('settings.pricebook.form.calcParts', { cost: formatCurrency(materials ?? 0), markup: markup ?? 0 })}</dt>
                          <dd className="text-right text-fg">{formatCurrency(computed.materials)}</dd>
                          <dt className="border-t border-border-soft pt-1.5 font-bold text-fg-strong">{t('settings.pricebook.form.price')}</dt>
                          <dd className="border-t border-border-soft pt-1.5 text-right font-bold text-fg-strong">{formatCurrency(computed.price)}</dd>
                        </dl>
                      ) : (
                        <Callout kind="warning" action={<Button outline size="xs" href="/settings/labor-rates">{t('settings.pricebook.form.setRegular')}</Button>}>
                          {t('settings.pricebook.form.computedUnpriced')}
                        </Callout>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(3,minmax(0,180px))]">
                      {f.pricingMode === 'FIXED' && (
                        <MoneyField label={t('settings.pricebook.form.priceUnit', { unit: f.unit || 'ea' })} value={f.unitPrice} onChange={(v) => set({ unitPrice: v })} />
                      )}
                      <MoneyField
                        label={
                          <span className="inline-flex items-center gap-1.5">
                            {t('settings.pricebook.form.cost')} <Tag word>{t('settings.pricebook.internal')}</Tag>
                          </span>
                        }
                        value={f.unitCost}
                        onChange={(v) => set({ unitCost: v })}
                        hint={f.pricingMode === 'FIXED' ? t('settings.pricebook.form.costOptional') : undefined}
                      />
                      {f.pricingMode === 'MARKUP' && (
                        <MoneyField label={t('settings.pricebook.form.markup')} value={f.markup} onChange={(v) => set({ markup: v })} />
                      )}
                    </div>
                  )}
                  <p className="text-[12px] tabular-nums text-fg-muted">
                    {f.pricingMode === 'MARKUP' && shownPrice != null && (
                      <>
                        {t('settings.pricebook.form.price')}{' '}
                        <span className="font-semibold text-fg-strong">{formatCurrency(shownPrice)}</span>
                        {' · '}
                      </>
                    )}
                    {t('settings.pricebook.form.margin')}{' '}
                    {margin == null ? '—' : <span className="font-semibold text-fg-strong">{margin}%</span>}
                    {shownCost == null && shownPrice ? ` · ${t('settings.pricebook.form.costUnknown')}` : ''}
                  </p>
                </FormSection>

                <FormSection title={t('settings.pricebook.form.taxSection')}>
                  <Field className="max-w-60">
                    <Label>{t('settings.pricebook.form.taxClass')}</Label>
                    <Select value={f.taxClass} onChange={(e) => set({ taxClass: e.target.value as TaxClass })}>
                      {TAX_CLASSES.map((c) => (
                        <option key={c} value={c}>
                          {t(`settings.tax.class.${c}`)}
                        </option>
                      ))}
                    </Select>
                    <Description>
                      {f.taxClass === defaultClass
                        ? t('settings.pricebook.form.taxDefault', { type: typeLabel(f.itemType).toLowerCase() })
                        : t('settings.pricebook.form.taxOverride', { type: typeLabel(f.itemType).toLowerCase(), class: t(`settings.tax.class.${defaultClass}`) })}
                    </Description>
                  </Field>
                </FormSection>

                <FormSection title={t('settings.pricebook.form.statusSection')}>
                  <CheckboxField>
                    <Checkbox checked={f.active} onChange={(v) => set({ active: v })} disabled={readOnly} />
                    <Label>{t('common.active')}</Label>
                    <Description>{t('settings.pricebook.form.activeHint')}</Description>
                  </CheckboxField>
                </FormSection>
              </fieldset>
            </Card>
          </div>
        </div>

        {!readOnly && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-t border-border bg-bg-elev px-7 py-3 max-lg:px-4">
            <Text size="sm" tone="muted" className="max-sm:basis-full">
              {t('settings.pricebook.form.keepPrices')}
            </Text>
            <span className="flex-1" />
            <Button href="/settings/pricebook" plain size="xs">
              {t('common.cancel')}
            </Button>
            <Button type="submit" color="accent" size="xs" disabled={!ready || save.isPending}>
              {item ? t('settings.saveChanges') : t('settings.pricebook.form.create')}
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const n = value.trim() === '' ? null : Number(value);
  return (
    <Field>
      <Label>{label}</Label>
      <Input
        inputMode="decimal"
        value={value}
        invalid={n != null && !(Number.isFinite(n) && n >= 0)}
        onChange={(e) => onChange(e.target.value)}
        className="[&_input]:text-right"
      />
      {hint && <Description>{hint}</Description>}
    </Field>
  );
}
