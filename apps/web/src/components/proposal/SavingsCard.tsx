/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the quote page). */
// "Savings & offers" on a proposal: the promotions on offer (each applied or
// not on this quote) and the decide-today saving with its end date. Every
// figure on the cards is the server's; this only sets what applies.
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@dispatch/utils';
import { promotionsApi, quotesApi, type DocumentAdjustment, type Promotion, type Quote } from '../../api/setup';
import { useTenantTimeZone } from '../../hooks/useTenantTimeZone';
import { zonedDate } from '../../lib/boardTime';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';
import { Switch } from '../catalyst/switch';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../ui/Card';
import { Tag } from '../ui/Pill';
import type { useDocumentEditor } from '../document/useDocumentEditor';
import { decideToday, promotionApplies } from './proposalModel';

type Run = ReturnType<typeof useDocumentEditor<Quote>>['run'];

const shortDate = (day: string) =>
  new Date(`${day.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const offer = (p: Pick<Promotion, 'kind' | 'value'>) =>
  p.kind === 'PERCENT' ? `${Math.round(p.value * 1000) / 10}% off` : `${formatCurrency(p.value)} off`;

export function SavingsCard({ quote, editable, run }: { quote: Quote; editable: boolean; run: Run }) {
  const zone = useTenantTimeZone();
  const today = zonedDate(new Date(), zone) ?? new Date().toISOString().slice(0, 10);
  const { data: promotions = [] } = useQuery({ queryKey: ['promotions'], queryFn: () => promotionsApi.getAll() });
  // On offer today, plus any this quote was told to take.
  const shown = promotions.filter((p) => p.onOffer || quote.promotionOverrides?.[p.id] === 'APPLY');
  const today$ = decideToday(quote);

  const toggle = (p: Promotion) => {
    const applies = promotionApplies(p, quote);
    // Back to the promotion's own setting where that's the answer; else override it.
    const choice = applies ? (p.autoApply ? 'EXCLUDE' : null) : p.autoApply ? null : 'APPLY';
    void run(
      (version) => quotesApi.setPromotion(quote.id, p.id, { version, choice }),
      applies ? 'Couldn’t take the promotion off' : 'Couldn’t apply the promotion',
    );
  };

  return (
    <Card>
      <CardHead>
        <CardTitle>Savings & offers</CardTitle>
        <CardSub>Shown as “You save”</CardSub>
      </CardHead>
      <CardBody flush>
        {shown.length === 0 && (
          <div className="pb-srow">
            <span className="text-[12px] text-fg-muted">No promotions on offer. Set them up in Settings → Promotions.</span>
          </div>
        )}
        {shown.map((p) => {
          const applies = promotionApplies(p, quote);
          return (
            <div key={p.id} className="pb-srow" data-testid="proposal-promotion">
              {p.autoApply ? <Tag>Auto</Tag> : <Tag word>Optional</Tag>}
              <div className="min-w-0 flex-1">
                <div className={applies ? 'text-[12.5px] font-semibold text-fg-strong' : 'text-[12.5px] font-semibold text-fg-muted'}>
                  {`Promotion · ${p.name}`}
                </div>
                <div className="text-[11.5px] text-fg-muted">
                  {[p.customerCopy, p.minAmount ? `over ${formatCurrency(p.minAmount)}` : null, `ends ${shortDate(p.endsOn)}`]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {editable && (
                <button type="button" className="card-action" onClick={() => toggle(p)}>
                  {applies ? 'Don’t apply' : 'Apply'}
                </button>
              )}
              <span className={applies ? 'pb-srow-amt pb-srow-amt--on' : 'pb-srow-amt'}>{offer(p)}</span>
            </div>
          );
        })}
        <DecideToday quote={quote} existing={today$} editable={editable} today={today} run={run} />
        <div className="pb-srow">
          <span className="text-[11.5px] text-fg-muted">
            Rebates are entered per option. They show as “after rebate” on the proposal but are never taken off the invoice.
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

/** A quote-wide saving that ends: today for in the home, a date for the link. */
function DecideToday({
  quote,
  existing,
  editable,
  today,
  run,
}: {
  quote: Quote;
  existing: DocumentAdjustment | undefined;
  editable: boolean;
  today: string;
  run: Run;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(existing?.value != null ? String(existing.value) : '');
  const [until, setUntil] = useState(existing?.validThrough?.slice(0, 10) ?? today);
  const n = Number(amount);
  const valid = amount.trim() !== '' && Number.isFinite(n) && n > 0 && until >= today;
  const ended = !!existing?.validThrough && existing.validThrough.slice(0, 10) < today;

  // No edit route: a change takes the old one off and puts the new one on.
  const save = async () => {
    if (!valid) return;
    if (existing && !(await run((version) => quotesApi.deleteAdjustment(quote.id, existing.id, version), 'Couldn’t change the saving'))) return;
    if (
      await run(
        (version) =>
          quotesApi.addAdjustment(quote.id, { version, kind: 'AMOUNT', value: n, reasonCode: 'INCENTIVE', validThrough: until }),
        'Couldn’t add the saving',
      )
    )
      setOpen(false);
  };
  const off = () =>
    existing && void run((version) => quotesApi.deleteAdjustment(quote.id, existing.id, version), 'Couldn’t remove the saving');

  return (
    <div className="pb-srow pb-srow--wrap" data-testid="proposal-decide-today">
      <Switch
        aria-label="Decide-today savings"
        checked={!!existing || open}
        disabled={!editable}
        onChange={(on) => (on ? setOpen(true) : existing ? off() : setOpen(false))}
      />
      <div className="min-w-0 flex-1">
        <div className={existing ? 'text-[12.5px] font-semibold text-fg-strong' : 'text-[12.5px] font-semibold text-fg-muted'}>
          Decide-today savings
        </div>
        <div className="text-[11.5px] text-fg-muted">
          {existing?.validThrough
            ? ended
              ? `Ended ${shortDate(existing.validThrough)}; it no longer prices.`
              : existing.validThrough.slice(0, 10) === today
                ? 'Ends today: for deciding in the home.'
                : `On the link: approve by ${shortDate(existing.validThrough)}.`
            : 'Off. A saving that ends: today in the home, or a date on the link.'}
          {existing && editable && !open && (
            <>
              {' · '}
              <button type="button" className="card-action" onClick={() => setOpen(true)}>
                Change
              </button>
            </>
          )}
        </div>
        {open && editable && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
              Amount
              <Input size="xs" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="350" className="w-24" aria-label="Decide-today amount" />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-fg-muted">
              Offered through
              <Input size="xs" type="date" value={until} min={today} onChange={(e) => setUntil(e.target.value)} aria-label="Offered through" />
            </label>
            <Button size="xs" color="dark/zinc" disabled={!valid} onClick={() => void save()}>
              Save
            </Button>
            <Button size="xs" plain onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        )}
      </div>
      {existing?.value != null && <span className={ended ? 'pb-srow-amt' : 'pb-srow-amt pb-srow-amt--on'}>{`−${formatCurrency(existing.value)}`}</span>}
    </div>
  );
}
