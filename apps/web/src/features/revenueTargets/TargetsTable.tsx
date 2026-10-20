// The twelve-month grid: read-only with results, or editable with a target
// input per month. Blank is "No target", never $0.
import { useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { Input } from '../../components/catalyst/input';
import { Pill } from '../../components/ui/Pill';
import { DenseRow, DenseTable, DenseTHead } from '../../components/ui/DenseTable';
import { money } from '../home/revenueSelectors';
import {
  amountProblem,
  countSet,
  monthStatus,
  signedPct,
  sumSet,
  type AmountProblem,
  type MonthAmounts,
} from './targetModel';

const DASH = '—';

const monthLong = (month: number) =>
  new Date(Date.UTC(2000, month - 1, 1)).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

const dollars = (n: number | null) => (n == null ? DASH : money(n));

interface Props {
  year: number;
  /** The tenant's today, YYYY-MM-DD. */
  today: string;
  /** Saved targets in view, the draft while editing. */
  values: MonthAmounts;
  prevActuals: MonthAmounts;
  actuals: MonthAmounts;
  editing: boolean;
  onCell?: (month: number, amount: number | null) => void;
  /** Months whose draft differs from what's saved. */
  changed?: boolean[];
  /** A server-reported problem, by month (1–12). */
  serverProblem?: { month: number; message: string } | null;
}

export function TargetsTable({ year, today, values, prevActuals, actuals, editing, onCell, changed, serverProblem }: Props) {
  const { t } = useTranslation();
  const prev = year - 1;
  const set = countSet(values);
  const prevTotal = prevActuals.some((v) => v != null) ? sumSet(prevActuals) : null;
  const actualToDate = actuals.some((v) => v != null) ? sumSet(actuals) : null;
  const yearTotal = sumSet(values);
  const isCurrentYear = Number(today.slice(0, 4)) === year;

  const col = {
    month: t('settings.revenueTargets.cols.month'),
    prev: t('settings.revenueTargets.cols.actual', { year: prev }),
    target: t('settings.revenueTargets.cols.target'),
    actual: t('settings.revenueTargets.cols.actual', { year }),
    result: t('settings.revenueTargets.cols.result'),
    vs: t('settings.revenueTargets.cols.vs', { year: prev }),
  };

  return (
    <DenseTable className="rt-table">
      <DenseTHead>
        <tr>
          <th>{col.month}</th>
          <th className="right">{col.prev}</th>
          <th className="right">{col.target}</th>
          {editing ? (
            <th className="right">{col.vs}</th>
          ) : (
            <>
              <th className="right">{col.actual}</th>
              <th>{col.result}</th>
            </>
          )}
        </tr>
      </DenseTHead>
      <tbody>
        {values.map((target, i) => {
          const month = i + 1;
          const status = monthStatus(year, month, today);
          const actual = actuals[i];
          const problem = amountProblem(target);
          return (
            <DenseRow key={month} className={status === 'current' ? 'rt-current' : undefined} data-testid="target-row">
              <td>
                <span className="rt-month">
                  <span className="strong">{monthLong(month)}</span>
                  {status === 'current' && <span className="rt-tag accent">{t('settings.revenueTargets.thisMonth')}</span>}
                  {editing && status === 'closed' && <span className="rt-tag">{t('settings.revenueTargets.closed')}</span>}
                  {editing && status === 'closed' && changed?.[i] && (
                    <span className="rt-dot" title={t('settings.revenueTargets.changed')} />
                  )}
                </span>
              </td>
              <td className="right num muted-cell" data-label={col.prev}>
                {dollars(prevActuals[i])}
              </td>
              <td className="right num" data-label={col.target}>
                {editing ? (
                  <TargetInput
                    value={target}
                    onChange={(v) => onCell?.(month, v)}
                    label={t('settings.revenueTargets.inputLabel', { month: monthLong(month) })}
                    problem={problem}
                    serverMessage={serverProblem?.month === month ? serverProblem.message : undefined}
                  />
                ) : target == null ? (
                  <span className="text-fg-muted">{t('settings.revenueTargets.noTarget')}</span>
                ) : (
                  <span className="strong">{money(target)}</span>
                )}
              </td>
              {editing ? (
                <td className="right num muted-cell" data-label={col.vs}>
                  {signedPct(target, prevActuals[i]) ?? DASH}
                </td>
              ) : (
                <>
                  <td className="right num" data-label={col.actual}>
                    {status === 'open' || actual == null ? (
                      <span className="text-fg-muted">{DASH}</span>
                    ) : (
                      <>
                        {money(actual)}
                        {status === 'current' && <span className="text-fg-muted"> {t('settings.revenueTargets.soFar')}</span>}
                      </>
                    )}
                  </td>
                  <td data-label={col.result}>
                    <Result status={status} target={target} actual={actual} />
                  </td>
                </>
              )}
            </DenseRow>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td>
            <span className="strong">{t('settings.revenueTargets.yearRow')}</span>
            {set > 0 && set < 12 && (
              <span className="rt-foot-note">{t('settings.revenueTargets.monthsSet', { count: set })}</span>
            )}
          </td>
          <td className="right num muted-cell">{dollars(prevTotal)}</td>
          <td className="right num strong">{set ? money(yearTotal) : DASH}</td>
          {editing ? (
            <td className="right num muted-cell">{set === 12 ? (signedPct(yearTotal, prevTotal) ?? '') : ''}</td>
          ) : (
            <>
              <td className="right num">
                {dollars(actualToDate)}
                {isCurrentYear && actualToDate != null && (
                  <span className="text-fg-muted"> {t('settings.revenueTargets.toDate')}</span>
                )}
              </td>
              <td />
            </>
          )}
        </tr>
      </tfoot>
    </DenseTable>
  );
}

function Result({ status, target, actual }: { status: string; target: number | null; actual: number | null }) {
  const { t } = useTranslation();
  if (target == null || actual == null) return null;
  if (status === 'closed') {
    const hit = actual >= target;
    return (
      <span className="rt-result">
        <Pill tone={hit ? 'success' : 'warning'}>
          {t(hit ? 'settings.revenueTargets.hit' : 'settings.revenueTargets.missed')}
        </Pill>
        <span className="rt-result-pct">{signedPct(actual, target)}</span>
      </span>
    );
  }
  if (status === 'current')
    return (
      <span className="rt-result">
        <Pill tone="info">{t('settings.revenueTargets.inProgress')}</Pill>
        <span className="rt-result-pct">
          {t('settings.revenueTargets.pctSoFar', { pct: Math.round((actual / target) * 100) })}
        </span>
      </span>
    );
  return null;
}

/** Whole dollars, comma-grouped except while typing; blank = no target. */
function TargetInput({
  value,
  onChange,
  label,
  problem,
  serverMessage,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  label: string;
  problem: AmountProblem | null;
  serverMessage?: string;
}) {
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const shown = value == null ? '' : focused ? String(value) : value.toLocaleString('en-US');
  const message = problem ? t(`settings.revenueTargets.errors.${problem}`) : serverMessage;
  return (
    <span className="rt-cell">
      <span className="rt-affix">
        <span className="rt-affix-pre">$</span>
        <Input
          size="xs"
          inputMode="numeric"
          className="rt-target-input"
          value={shown}
          placeholder={t('settings.revenueTargets.noTarget')}
          invalid={!!message}
          aria-label={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '');
            onChange(digits === '' ? null : Number(digits));
          }}
        />
      </span>
      {message && <span className="rt-cell-error">{message}</span>}
    </span>
  );
}
