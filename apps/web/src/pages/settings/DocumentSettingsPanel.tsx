import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { taxApi, type PricingSettings } from '../../api/setup';
import { useHasAnyCapability } from '../../hooks/useCurrentUser';
import { Button } from '../../components/catalyst/button';
import { Input } from '../../components/catalyst/input';
import { Card, CardBody, CardHead, CardTitle } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { PageHead } from '../../components/ui/PageHead';
import { ToggleGroup, ToggleGroupOption } from '../../components/ui/ToggleGroup';
import { FormSection, ViewOnlyNotice } from '../../components/settings/PricingPageParts';
import { extractApiError, showError, showSuccess } from '../../lib/toast';
import { useEntityNames } from '../../hooks/useEntityNames';

const SETTINGS_KEY = ['pricing-settings'] as const;
const PRESETS = ['14', '30', '60', '90'] as const;

const expiresOn = (days: number, today = new Date()) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

/**
 * Defaults for documents the company sends. One real setting: how long a
 * quote stays open after it's sent. An invoice's due date follows each
 * account's payment terms, so there's nothing to set here for it. Any
 * single quote or invoice can still be given its own date when it's sent.
 */
export default function DocumentSettingsPanel() {
  const names = useEntityNames();
  const { t } = useTranslation();
  const canManage = useHasAnyCapability('MANAGE_PRICING');
  const { data, isLoading } = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => taxApi.getPricingSettings() });

  return (
    <>
      <PageHead title={t('settings.documents.title', names)} sub={t('settings.documents.description', names)} />
      {!canManage && <ViewOnlyNotice />}
      {isLoading || !data ? (
        <Card>
          <CardBody flush>
            <LoadingState label={t('settings.documents.loading')} />
          </CardBody>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Keyed on the saved value so a save starts the field over from it. */}
          <QuotesCard key={data.quoteValidityDays ?? 30} settings={data} canManage={canManage} />
          <ProposalsCard key={data.marginFloor ?? 'none'} settings={data} canManage={canManage} />
          <Card>
            <CardHead>
              <CardTitle>{t('settings.documents.invoices', names)}</CardTitle>
            </CardHead>
            <CardBody>
              <p className="text-[12.5px] text-fg">{t('settings.documents.invoicesBody', names)}</p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}

function QuotesCard({ settings, canManage }: { settings: PricingSettings; canManage: boolean }) {
  const names = useEntityNames();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const saved = settings.quoteValidityDays ?? 30;
  const [days, setDays] = useState(String(saved));
  const n = Number(days);
  const valid = Number.isInteger(n) && n >= 1 && n <= 365;
  const dirty = valid && n !== saved;

  const save = useMutation({
    mutationFn: () => taxApi.updatePricingSettings(settings.agreementFeeTaxClass, n),
    onSuccess: (next) => {
      queryClient.setQueryData(SETTINGS_KEY, next);
      showSuccess(t('settings.documents.saved', names));
    },
    onError: (err) => showError(t('settings.documents.saveFailed', names), extractApiError(err)),
  });

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('settings.documents.quotes', names)}</CardTitle>
      </CardHead>
      <div className="px-5">
      <FormSection title={t('settings.documents.validFor')} description={t('settings.documents.validForHint', names)}>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex w-32 items-center gap-1.5">
            <Input
              inputMode="numeric"
              aria-label={t('settings.documents.validFor')}
              value={days}
              disabled={!canManage}
              invalid={days.trim() !== '' && !valid}
              onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))}
              className="[&_input]:text-right"
            />
            <span className="text-[12.5px] text-fg-muted">{t('settings.documents.days')}</span>
          </div>
          {canManage && (
            <ToggleGroup value={(PRESETS as readonly string[]).includes(days) ? days : ''} onChange={setDays} size="sm" aria-label={t('settings.documents.presets')}>
              {PRESETS.map((p) => (
                <ToggleGroupOption key={p} value={p}>
                  {p}
                </ToggleGroupOption>
              ))}
            </ToggleGroup>
          )}
        </div>
        <p className={valid ? 'text-[12px] text-fg-muted' : 'text-[12px] text-danger-500'}>
          {valid ? (
            <>
              {t('settings.documents.previewBefore', names)} <span className="font-semibold text-fg-strong">{expiresOn(n)}</span>
              {t('settings.documents.previewAfter', names)}
            </>
          ) : (
            t('settings.documents.invalid')
          )}
        </p>
        {canManage && dirty && (
          <div className="flex gap-2">
            <Button color="dark/zinc" size="xs" disabled={save.isPending} onClick={() => save.mutate()}>
              {t('common.save')}
            </Button>
            <Button plain size="xs" onClick={() => setDays(String(saved))}>
              {t('common.cancel')}
            </Button>
          </div>
        )}
      </FormSection>
      </div>
    </Card>
  );
}

/** Fraction ↔ the percent typed: 0.35 ↔ "35". */
const floorText = (floor: number | null | undefined) => (floor ? String(Math.round(floor * 1000) / 10) : '');

function ProposalsCard({ settings, canManage }: { settings: PricingSettings; canManage: boolean }) {
  const names = useEntityNames();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const saved = floorText(settings.marginFloor);
  const [pct, setPct] = useState(saved);
  const n = Number(pct);
  const blank = pct.trim() === '';
  const valid = blank || (Number.isFinite(n) && n > 0 && n < 100);
  const dirty = valid && pct.trim() !== saved;

  const save = useMutation({
    // 0 removes the floor.
    mutationFn: () => taxApi.updatePricingSettings(settings.agreementFeeTaxClass, undefined, { marginFloor: blank ? 0 : n / 100 }),
    onSuccess: (next) => {
      queryClient.setQueryData(SETTINGS_KEY, next);
      queryClient.invalidateQueries({ queryKey: ['quote-selection'] });
      showSuccess(t('settings.documents.marginFloor.saved'));
    },
    onError: (err) => showError(t('settings.documents.marginFloor.saveFailed'), extractApiError(err)),
  });

  return (
    <Card>
      <CardHead>
        <CardTitle>{t('settings.documents.marginFloor.title')}</CardTitle>
      </CardHead>
      <div className="px-5">
        <FormSection title={t('settings.documents.marginFloor.label')} description={t('settings.documents.marginFloor.hint', names)}>
          <div className="flex w-32 items-center gap-1.5">
            <Input
              inputMode="decimal"
              aria-label={t('settings.documents.marginFloor.label')}
              value={pct}
              disabled={!canManage}
              invalid={!valid}
              onChange={(e) => setPct(e.target.value.replace(/[^0-9.]/g, ''))}
              className="[&_input]:text-right"
            />
            <span className="text-[12.5px] text-fg-muted">%</span>
          </div>
          <p className={valid ? 'text-[12px] text-fg-muted' : 'text-[12px] text-danger-500'}>
            {!valid
              ? t('settings.documents.marginFloor.invalid')
              : blank
                ? t('settings.documents.marginFloor.none')
                : t('settings.documents.marginFloor.preview', { pct: `${n}%` })}
          </p>
          {canManage && dirty && (
            <div className="flex gap-2">
              <Button color="dark/zinc" size="xs" disabled={save.isPending} onClick={() => save.mutate()}>
                {t('common.save')}
              </Button>
              <Button plain size="xs" onClick={() => setPct(saved)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
        </FormSection>
      </div>
    </Card>
  );
}
