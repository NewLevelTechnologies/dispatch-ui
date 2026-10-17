// Settings → Financing: the payment plans the company's lender offers, shown
// on proposals as monthly payments, and the lender's application link. No
// lender is integrated: the customer picks a plan and the office arranges the
// loan. No delete: a plan is switched off. Writing needs MANAGE_PRICING.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { PlusIcon } from '@heroicons/react/16/solid';
import { paymentPlansApi, taxApi, type PaymentPlan, type PaymentPlanRequest, type PricingSettings } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogTitle } from '../../components/catalyst/dialog';
import { Description, Field, Label } from '../../components/catalyst/fieldset';
import { Input } from '../../components/catalyst/input';
import { Switch, SwitchField } from '../../components/catalyst/switch';
import { FormSection, ViewOnlyNotice } from '../../components/settings/PricingPageParts';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { Pill } from '../../components/ui/Pill';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { useEntityNames } from '../../hooks/useEntityNames';

const PLANS_KEY = ['payment-plans'] as const;
const SETTINGS_KEY = ['pricing-settings'] as const;

const aprText = (apr: number) => `${Number(apr.toFixed(3))}%`;

export default function FinancingPanel() {
  const { t } = useTranslation();
  const names = useEntityNames();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const [editing, setEditing] = useState<{ plan: PaymentPlan | null } | null>(null);
  const plans = useQuery({ queryKey: PLANS_KEY, queryFn: () => paymentPlansApi.getAll() });
  const { data: settings } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => taxApi.getPricingSettings() });
  const rows = plans.data ?? [];

  return (
    <>
      <PageHead
        title={t('settings.financing.title')}
        sub={t('settings.financing.description', names)}
        actions={
          canManage && (
            <Button color="dark/zinc" size="xs" onClick={() => setEditing({ plan: null })}>
              <PlusIcon data-slot="icon" />
              {t('settings.financing.add')}
            </Button>
          )
        }
      />
      {!canManage && <ViewOnlyNotice />}
      <div className="flex flex-col gap-3">
        <Card>
          <CardBody flush>
            {plans.isLoading ? (
              <LoadingState />
            ) : rows.length === 0 ? (
              <EmptyState title={t('settings.financing.empty.title')} description={t('settings.financing.empty.body', names)} />
            ) : (
              <DenseTable>
                <DenseTHead>
                  <tr>
                    <th>{t('settings.financing.col.label')}</th>
                    <th className="right">{t('settings.financing.col.apr')}</th>
                    <th className="right">{t('settings.financing.col.term')}</th>
                    <th>{t('settings.financing.col.status')}</th>
                  </tr>
                </DenseTHead>
                <tbody>
                  {rows.map((p) => (
                    <DenseRow key={p.id} data-testid="payment-plan-row" onClick={canManage ? () => setEditing({ plan: p }) : undefined}>
                      <td className="strong">{p.label}</td>
                      <td className="right num">{aprText(p.apr)}</td>
                      <td className="right num">{t('settings.financing.months', { count: p.months })}</td>
                      <td>
                        {p.active ? (
                          <Pill tone="success" dot>
                            {t('settings.financing.on')}
                          </Pill>
                        ) : (
                          <Pill tone="neutral">{t('settings.financing.off')}</Pill>
                        )}
                      </td>
                    </DenseRow>
                  ))}
                </tbody>
              </DenseTable>
            )}
          </CardBody>
        </Card>
        {settings && <ApplicationLinkCard key={settings.financingApplicationUrl ?? ''} settings={settings} canManage={canManage} />}
      </div>
      <Dialog open={editing != null} onClose={() => setEditing(null)} size="md">
        {editing && <PlanForm plan={editing.plan} nextOrder={rows.length + 1} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}

function PlanForm({ plan, nextOrder, onDone }: { plan: PaymentPlan | null; nextOrder: number; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState(plan?.label ?? '');
  const [apr, setApr] = useState(plan ? String(plan.apr) : '');
  const [months, setMonths] = useState(plan ? String(plan.months) : '');
  const [active, setActive] = useState(plan?.active ?? true);
  const a = Number(apr);
  const m = Number(months);
  const aprOk = apr.trim() !== '' && Number.isFinite(a) && a >= 0 && a < 100 && Number(a.toFixed(3)) === a;
  const monthsOk = Number.isInteger(m) && m >= 1 && m <= 360;
  const ready = label.trim() !== '' && aprOk && monthsOk;

  const save = useMutation({
    mutationFn: () => {
      const request: PaymentPlanRequest = { label: label.trim(), apr: a, months: m, sortOrder: plan?.sortOrder ?? nextOrder, active };
      return plan ? paymentPlansApi.update(plan.id, request) : paymentPlansApi.create(request);
    },
    onSuccess: (saved) => {
      void queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      void queryClient.invalidateQueries({ queryKey: ['quote-selection'] });
      showSuccess(t('settings.financing.saved', { name: saved.label }));
      onDone();
    },
    onError: (err) => showError(t('settings.financing.saveFailed'), extractApiError(err)),
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if (ready && !save.isPending) save.mutate();
      }}
    >
      <DialogTitle>{plan ? t('settings.financing.form.editTitle', { name: plan.label }) : t('settings.financing.form.addTitle')}</DialogTitle>
      <DialogBody className="flex flex-col gap-4">
        <Field>
          <Label>{t('settings.financing.form.label')}</Label>
          <Input autoFocus value={label} maxLength={80} onChange={(e) => setLabel(e.target.value)} placeholder="12 months same as cash" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>{t('settings.financing.form.apr')}</Label>
            <Input inputMode="decimal" value={apr} onChange={(e) => setApr(e.target.value)} invalid={apr.trim() !== '' && !aprOk} placeholder="7.99" className="[&_input]:text-right" />
            <Description>{t('settings.financing.form.aprHint')}</Description>
          </Field>
          <Field>
            <Label>{t('settings.financing.form.months')}</Label>
            <Input inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/[^0-9]/g, ''))} invalid={months.trim() !== '' && !monthsOk} placeholder="60" className="[&_input]:text-right" />
          </Field>
        </div>
        <SwitchField>
          <Label>{t('settings.financing.form.active')}</Label>
          <Description>{t('settings.financing.form.activeHint')}</Description>
          <Switch checked={active} onChange={setActive} />
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

function ApplicationLinkCard({ settings, canManage }: { settings: PricingSettings; canManage: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const saved = settings.financingApplicationUrl ?? '';
  const [url, setUrl] = useState(saved);
  const valid = url.trim() === '' || /^https:\/\/\S+$/.test(url.trim());
  const dirty = url.trim() !== saved;
  const save = useMutation({
    mutationFn: () => taxApi.updatePricingSettings(settings.agreementFeeTaxClass, undefined, { financingApplicationUrl: url.trim() }),
    onSuccess: (next) => {
      queryClient.setQueryData(SETTINGS_KEY, next);
      showSuccess(t('settings.financing.link.saved'));
    },
    onError: (err) => showError(t('settings.financing.link.saveFailed'), extractApiError(err)),
  });
  return (
    <Card>
      <CardHead>
        <CardTitle>{t('settings.financing.link.title')}</CardTitle>
      </CardHead>
      <div className="px-5">
        <FormSection title={t('settings.financing.link.label')} description={t('settings.financing.link.hint')}>
          <Input
            type="url"
            aria-label={t('settings.financing.link.label')}
            value={url}
            maxLength={500}
            disabled={!canManage}
            invalid={!valid}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://apply.yourlender.com/…"
          />
          {!valid && <p className="text-[12px] text-danger-500">{t('settings.financing.link.invalid')}</p>}
          {canManage && dirty && valid && (
            <div className="flex gap-2">
              <Button color="dark/zinc" size="xs" disabled={save.isPending} onClick={() => save.mutate()}>
                {t('common.save')}
              </Button>
              <Button plain size="xs" onClick={() => setUrl(saved)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </FormSection>
      </div>
    </Card>
  );
}
