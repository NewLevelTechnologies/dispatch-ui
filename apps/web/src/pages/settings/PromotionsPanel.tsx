// Settings → Promotions: dated offers that come off proposals on their own
// ("Fall Comfort Event — $500 off a new system"), with what they cover and a
// minimum. No delete: a promotion is switched off. Writing needs MANAGE_PRICING.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency } from '@dispatch/utils';
import { PlusIcon } from '@heroicons/react/16/solid';
import { pricebookApi, promotionsApi, type Promotion, type PromotionRequest } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Checkbox, CheckboxField } from '../../components/catalyst/checkbox';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../../components/catalyst/dialog';
import { Description, Field, Label } from '../../components/catalyst/fieldset';
import { Input } from '../../components/catalyst/input';
import { Radio, RadioField, RadioGroup } from '../../components/catalyst/radio';
import { Switch, SwitchField } from '../../components/catalyst/switch';
import { ViewOnlyNotice } from '../../components/settings/PricingPageParts';
import { Card, CardBody } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { Pill, Tag } from '../../components/ui/Pill';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { useEntityNames } from '../../hooks/useEntityNames';
import { CATEGORIES_KEY } from '../../components/pricebook/pricebookRequests';

const KEY = ['promotions'] as const;

const day = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const offerText = (p: Pick<Promotion, 'kind' | 'value'>) =>
  p.kind === 'PERCENT' ? `${Math.round(p.value * 1000) / 10}%` : formatCurrency(p.value);

const toRequest = (p: Promotion): PromotionRequest => ({
  name: p.name,
  customerCopy: p.customerCopy ?? null,
  startsOn: p.startsOn,
  endsOn: p.endsOn,
  kind: p.kind,
  value: p.value,
  minAmount: p.minAmount ?? null,
  itemIds: p.itemIds,
  categoryIds: p.categoryIds,
  autoApply: p.autoApply,
  active: p.active,
});

export default function PromotionsPanel() {
  const { t } = useTranslation();
  const names = useEntityNames();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const [editing, setEditing] = useState<{ promotion: Promotion | null } | null>(null);
  const query = useQuery({ queryKey: KEY, queryFn: () => promotionsApi.getAll() });
  const { data: categories = [] } = useQuery({ queryKey: CATEGORIES_KEY, queryFn: () => pricebookApi.getCategories() });
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—';
  const rows = query.data ?? [];

  let body;
  if (query.isLoading) body = <LoadingState />;
  else if (query.isError)
    body = (
      <ErrorState
        title={t('settings.promotions.loadFailed')}
        action={
          <Button outline size="xs" onClick={() => void query.refetch()}>
            {t('common.actions.tryAgain')}
          </Button>
        }
      />
    );
  else if (rows.length === 0)
    body = <EmptyState title={t('settings.promotions.empty.title')} description={t('settings.promotions.empty.body', names)} />;
  else
    body = (
      <div className="overflow-x-auto">
        <DenseTable className="min-w-[760px]">
          <DenseTHead>
            <tr>
              <th>{t('settings.promotions.col.name')}</th>
              <th>{t('settings.promotions.col.dates')}</th>
              <th className="right">{t('settings.promotions.col.offer')}</th>
              <th>{t('settings.promotions.col.covers')}</th>
              <th>{t('settings.promotions.col.status')}</th>
            </tr>
          </DenseTHead>
          <tbody>
            {rows.map((p) => (
              <DenseRow
                key={p.id}
                data-testid="promotion-row"
                onClick={canManage ? () => setEditing({ promotion: p }) : undefined}
              >
                <td>
                  <div className="font-semibold text-fg-strong">{p.name}</div>
                  {p.customerCopy && <div className="text-[11.5px] text-fg-muted">{p.customerCopy}</div>}
                </td>
                <td className="num muted-cell">{`${day(p.startsOn)} – ${day(p.endsOn)}`}</td>
                <td className="right num">
                  {offerText(p)}
                  {p.minAmount ? <div className="text-[11px] text-fg-muted">{t('settings.promotions.over', { amount: formatCurrency(p.minAmount) })}</div> : null}
                </td>
                <td className="muted-cell">
                  {p.categoryIds.length || p.itemIds.length
                    ? [
                        ...p.categoryIds.map(categoryName),
                        ...(p.itemIds.length ? [t('settings.promotions.items', { count: p.itemIds.length })] : []),
                      ].join(', ')
                    : t('settings.promotions.everything')}
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {!p.active ? (
                      <Pill tone="neutral">{t('settings.promotions.status.off')}</Pill>
                    ) : p.onOffer ? (
                      <Pill tone="success" dot>
                        {t('settings.promotions.status.onOffer')}
                      </Pill>
                    ) : (
                      <Pill tone="neutral">{t('settings.promotions.status.notInWindow')}</Pill>
                    )}
                    {p.autoApply && <Tag word>{t('settings.promotions.auto')}</Tag>}
                  </div>
                </td>
              </DenseRow>
            ))}
          </tbody>
        </DenseTable>
      </div>
    );

  return (
    <>
      <PageHead
        title={t('settings.promotions.title')}
        sub={t('settings.promotions.description', names)}
        actions={
          canManage && (
            <Button color="dark/zinc" size="xs" onClick={() => setEditing({ promotion: null })}>
              <PlusIcon data-slot="icon" />
              {t('settings.promotions.add')}
            </Button>
          )
        }
      />
      {!canManage && <ViewOnlyNotice />}
      <Card>
        <CardBody flush>{body}</CardBody>
      </Card>
      <Dialog open={editing != null} onClose={() => setEditing(null)} size="lg">
        {editing && <PromotionForm promotion={editing.promotion} categories={categories} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function PromotionForm({
  promotion,
  categories,
  onDone,
}: {
  promotion: Promotion | null;
  categories: { id: string; name: string; active?: boolean }[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PromotionRequest>(
    promotion
      ? toRequest(promotion)
      : { name: '', customerCopy: '', startsOn: '', endsOn: '', kind: 'AMOUNT', value: 0, minAmount: null, itemIds: [], categoryIds: [], autoApply: true, active: true },
  );
  // Percent is typed as a percent and sent as a fraction.
  const [value, setValue] = useState(promotion ? String(promotion.kind === 'PERCENT' ? Math.round(promotion.value * 1000) / 10 : promotion.value) : '');
  const [min, setMin] = useState(promotion?.minAmount ? String(promotion.minAmount) : '');
  const set = (change: Partial<PromotionRequest>) => setForm((f) => ({ ...f, ...change }));
  const n = Number(value);
  const m = min.trim() === '' ? null : Number(min);
  const valueOk = value.trim() !== '' && Number.isFinite(n) && n > 0 && (form.kind === 'AMOUNT' || n < 100);
  const minOk = m == null || (Number.isFinite(m) && m >= 0);
  const datesOk = !!form.startsOn && !!form.endsOn && form.endsOn >= form.startsOn;
  const ready = form.name.trim() !== '' && valueOk && minOk && datesOk;

  const save = useMutation({
    mutationFn: () => {
      const request: PromotionRequest = {
        ...form,
        name: form.name.trim(),
        customerCopy: form.customerCopy?.trim() || null,
        value: form.kind === 'PERCENT' ? Math.round(n * 100) / 10000 : n,
        minAmount: m,
      };
      return promotion ? promotionsApi.update(promotion.id, request) : promotionsApi.create(request);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      void queryClient.invalidateQueries({ queryKey: ['quote-selection'] });
      showSuccess(t('settings.promotions.saved', { name: saved.name }));
      onDone();
    },
    onError: (err) => showError(t('settings.promotions.saveFailed'), extractApiError(err)),
  });

  const toggleCategory = (id: string, on: boolean) =>
    set({ categoryIds: on ? [...form.categoryIds, id] : form.categoryIds.filter((c) => c !== id) });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (ready && !save.isPending) save.mutate();
      }}
    >
      <DialogTitle>{promotion ? t('settings.promotions.form.editTitle', { name: promotion.name }) : t('settings.promotions.form.addTitle')}</DialogTitle>
      <DialogBody className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <Label>{t('settings.promotions.form.name')}</Label>
            <Input autoFocus value={form.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} placeholder="Fall Comfort Event" />
          </Field>
          <Field>
            <Label>{t('settings.promotions.form.copy')}</Label>
            <Input value={form.customerCopy ?? ''} maxLength={200} onChange={(e) => set({ customerCopy: e.target.value })} placeholder="$500 off a new system" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>{t('settings.promotions.form.starts')}</Label>
            <Input type="date" value={form.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
          </Field>
          <Field>
            <Label>{t('settings.promotions.form.ends')}</Label>
            <Input type="date" value={form.endsOn} min={form.startsOn || undefined} onChange={(e) => set({ endsOn: e.target.value })} invalid={!!form.startsOn && !!form.endsOn && !datesOk} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_120px_minmax(0,1fr)] sm:items-end">
          <RadioGroup value={form.kind} onChange={(v) => set({ kind: v as PromotionRequest['kind'] })} aria-label={t('settings.promotions.form.kind')} className="flex gap-4 pb-2">
            <RadioField>
              <Radio value="AMOUNT" />
              <Label>{t('settings.promotions.form.amountOff')}</Label>
            </RadioField>
            <RadioField>
              <Radio value="PERCENT" />
              <Label>{t('settings.promotions.form.percentOff')}</Label>
            </RadioField>
          </RadioGroup>
          <Field>
            <Label>{form.kind === 'PERCENT' ? t('settings.promotions.form.percent') : t('settings.promotions.form.amount')}</Label>
            <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} invalid={value.trim() !== '' && !valueOk} className="[&_input]:text-right" />
          </Field>
          <Field>
            <Label>{t('settings.promotions.form.minimum')}</Label>
            <Input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} invalid={!minOk} placeholder={t('settings.promotions.form.noMinimum')} className="[&_input]:text-right" />
          </Field>
        </div>
        <Field>
          <Label>{t('settings.promotions.form.covers')}</Label>
          <Description>{t('settings.promotions.form.coversHint')}</Description>
          <div className="mt-2 grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-border-soft p-2 sm:grid-cols-2">
            {categories.length === 0 && <span className="text-[12px] text-fg-muted">{t('settings.promotions.form.noCategories')}</span>}
            {categories.map((c) => (
              <CheckboxField key={c.id}>
                <Checkbox checked={form.categoryIds.includes(c.id)} onChange={(on) => toggleCategory(c.id, on)} />
                <Label>{c.name}</Label>
              </CheckboxField>
            ))}
          </div>
          {form.itemIds.length > 0 && <Description>{t('settings.promotions.form.itemsKept', { count: form.itemIds.length })}</Description>}
        </Field>
        <SwitchField>
          <Label>{t('settings.promotions.form.autoApply')}</Label>
          <Description>{t('settings.promotions.form.autoApplyHint')}</Description>
          <Switch checked={form.autoApply} onChange={(on) => set({ autoApply: on })} />
        </SwitchField>
        <SwitchField>
          <Label>{t('settings.promotions.form.active')}</Label>
          <Description>{t('settings.promotions.form.activeHint')}</Description>
          <Switch checked={form.active} onChange={(on) => set({ active: on })} />
        </SwitchField>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" color="dark/zinc" disabled={!ready || save.isPending}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </form>
  );
}
