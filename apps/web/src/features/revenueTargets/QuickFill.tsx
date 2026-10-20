// The edit card's fill tools: last year plus a growth %, or a yearly total
// spread across the months. Filling only writes the draft; nothing saves
// until Save targets.
import { useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { Button } from '../../components/catalyst/button';
import { Input } from '../../components/catalyst/input';
import { Select } from '../../components/catalyst/select';
import { Checkbox, CheckboxField } from '../../components/catalyst/checkbox';
import { Label } from '../../components/catalyst/fieldset';
import { ToggleGroup, ToggleGroupOption } from '../../components/ui/ToggleGroup';
import { monthShort } from '../home/period';
import { fillFromSource, spreadTotal, type MonthAmounts } from './targetModel';

type Mode = 'copy' | 'spread';
type Source = 'actual' | 'target';
type Shape = 'last' | 'even';

export function QuickFill({
  year,
  prevActuals,
  prevTargets,
  hasClosedMonths,
  onFill,
}: {
  year: number;
  /** Last year's actual revenue by month; null where there's none. */
  prevActuals: MonthAmounts;
  /** Last year's targets by month. */
  prevTargets: MonthAmounts;
  /** The year has months that have closed (offers "only open months"). */
  hasClosedMonths: boolean;
  onFill: (values: (number | undefined)[], onlyOpen: boolean) => void;
}) {
  const { t } = useTranslation();
  const prev = year - 1;
  const hasActual = prevActuals.some((v) => v != null && v > 0);
  const fullActual = prevActuals.every((v) => v != null && v > 0);
  const hasTarget = prevTargets.some((v) => v != null);
  const [mode, setMode] = useState<Mode>('copy');
  const [source, setSource] = useState<Source>(hasActual || !hasTarget ? 'actual' : 'target');
  const [growth, setGrowth] = useState('0');
  const [total, setTotal] = useState('');
  const [shape, setShape] = useState<Shape>(fullActual ? 'last' : 'even');
  // Closed months are history; the usual job is planning what's left.
  const [onlyOpen, setOnlyOpen] = useState(hasClosedMonths);

  const src = source === 'actual' ? prevActuals : prevTargets;
  const gaps = src
    .map((v, i) => (v == null || (source === 'actual' && v <= 0) ? monthShort(i + 1) : null))
    .filter((m): m is string => m != null);
  const sourceEmpty = source === 'actual' ? !hasActual : !hasTarget;
  const totalAmount = Number(total.replace(/[^\d]/g, '')) || 0;
  const canFill = mode === 'copy' ? !sourceEmpty : totalAmount > 0;

  const apply = () => {
    const values =
      mode === 'copy'
        ? fillFromSource(src, Number(growth) || 0)
        : spreadTotal(totalAmount, shape === 'last' && fullActual ? (prevActuals as number[]) : null);
    onFill(values, hasClosedMonths && onlyOpen);
  };

  return (
    <div className="rt-fill" data-testid="quick-fill">
      <div className="rt-fill-row">
        <span className="rt-fill-label">{t('settings.revenueTargets.fill.label')}</span>
        <ToggleGroup size="sm" value={mode} onChange={setMode} aria-label={t('settings.revenueTargets.fill.label')}>
          <ToggleGroupOption value="copy">{t('settings.revenueTargets.fill.fromYear', { year: prev })}</ToggleGroupOption>
          <ToggleGroupOption value="spread">{t('settings.revenueTargets.fill.spread')}</ToggleGroupOption>
        </ToggleGroup>
      </div>
      <div className="rt-fill-row rt-fill-indent">
        {mode === 'copy' ? (
          <>
            <Select
              size="xs"
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
              aria-label={t('settings.revenueTargets.fill.source')}
            >
              <option value="actual" disabled={!hasActual}>
                {t('settings.revenueTargets.fill.sourceActual', { year: prev })}
              </option>
              <option value="target" disabled={!hasTarget}>
                {t(hasTarget ? 'settings.revenueTargets.fill.sourceTargets' : 'settings.revenueTargets.fill.sourceTargetsNone', {
                  year: prev,
                })}
              </option>
            </Select>
            <span className="rt-fill-word">{t('settings.revenueTargets.fill.plus')}</span>
            <span className="rt-affix">
              <Input
                size="xs"
                inputMode="decimal"
                className="rt-pct"
                value={growth}
                onChange={(e) => setGrowth(e.target.value.replace(/[^\d.-]/g, ''))}
                aria-label={t('settings.revenueTargets.fill.growth')}
              />
              <span className="rt-affix-post">%</span>
            </span>
          </>
        ) : (
          <>
            <span className="rt-affix">
              <span className="rt-affix-pre">$</span>
              <Input
                size="xs"
                inputMode="numeric"
                className="rt-total"
                value={totalAmount ? totalAmount.toLocaleString('en-US') : total}
                onChange={(e) => setTotal(e.target.value.replace(/[^\d]/g, ''))}
                aria-label={t('settings.revenueTargets.fill.total')}
              />
            </span>
            <Select
              size="xs"
              value={shape}
              onChange={(e) => setShape(e.target.value as Shape)}
              aria-label={t('settings.revenueTargets.fill.shape')}
            >
              <option value="last" disabled={!fullActual}>
                {t('settings.revenueTargets.fill.shapeLast', { year: prev })}
              </option>
              <option value="even">{t('settings.revenueTargets.fill.shapeEven')}</option>
            </Select>
          </>
        )}
        {hasClosedMonths && (
          <CheckboxField className="rt-check">
            <Checkbox checked={onlyOpen} onChange={setOnlyOpen} />
            <Label>{t('settings.revenueTargets.fill.onlyOpen')}</Label>
          </CheckboxField>
        )}
        <span className="grow" />
        <Button outline size="xs" type="button" onClick={apply} disabled={!canFill}>
          {t('settings.revenueTargets.fill.apply')}
        </Button>
      </div>
      {mode === 'copy' && !sourceEmpty && gaps.length > 0 && (
        <div className="rt-fill-note rt-fill-indent">
          {t(source === 'actual' ? 'settings.revenueTargets.fill.gapsActual' : 'settings.revenueTargets.fill.gapsTargets', {
            year: prev,
            months: gaps.join(', '),
          })}
        </div>
      )}
    </div>
  );
}
