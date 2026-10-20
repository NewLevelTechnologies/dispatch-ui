/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the quote page). */
// Which of the company's payment plans a proposal offers, each with its
// monthly payment on the current choice. Every quote starts offering every
// active plan; ticking one off makes the list this quote's own.
import { useQuery } from '@tanstack/react-query';
import { formatCurrency } from '@dispatch/utils';
import { paymentPlansApi, quotesApi, type PricedSelection, type Quote } from '../../api/setup';
import { Checkbox, CheckboxField } from '../catalyst/checkbox';
import { Description, Label } from '../catalyst/fieldset';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../ui/Card';
import type { useDocumentEditor } from '../document/useDocumentEditor';

type Run = ReturnType<typeof useDocumentEditor<Quote>>['run'];

export function PaymentOptionsCard({
  quote,
  editable,
  run,
  priced,
}: {
  quote: Quote;
  editable: boolean;
  run: Run;
  priced?: PricedSelection;
}) {
  const { data: plans = [] } = useQuery({ queryKey: ['payment-plans'], queryFn: () => paymentPlansApi.getAll() });
  const active = plans.filter((p) => p.active);
  const own = quote.paymentPlanIds != null;
  const offered = own ? quote.paymentPlanIds! : active.map((p) => p.id);
  const monthly = (id: string) => priced?.financing?.plans.find((p) => p.planId === id)?.monthlyPayment;

  const set = (planIds: string[] | null) =>
    void run((version) => quotesApi.setPaymentPlans(quote.id, { version, planIds }), 'Couldn’t change the payment options');
  const toggle = (id: string, on: boolean) => set(on ? [...offered, id] : offered.filter((x) => x !== id));

  return (
    <Card>
      <CardHead>
        <CardTitle>Payment options</CardTitle>
        <CardSub>Monthly is on the current choice’s total</CardSub>
        {editable && own && (
          <button type="button" className="card-action ml-auto" onClick={() => set(null)}>
            Offer every plan
          </button>
        )}
      </CardHead>
      <CardBody className="flex flex-col gap-2">
        {active.length === 0 ? (
          <p className="text-[12px] text-fg-muted">No payment plans yet. Add them in Settings → Financing.</p>
        ) : (
          <>
            <div className="text-[12px] text-fg-muted">Pay in full is always offered.</div>
            {active.map((p) => {
              const m = monthly(p.id);
              return (
                <CheckboxField key={p.id} data-testid="proposal-payment-plan">
                  <Checkbox checked={offered.includes(p.id)} disabled={!editable} onChange={(on) => toggle(p.id, on)} />
                  <Label>
                    {p.label}
                    {m != null && offered.includes(p.id) && <span className="ml-2 tabular-nums text-fg-muted">{`${formatCurrency(m)}/mo`}</span>}
                  </Label>
                  <Description>{`${Number(p.apr.toFixed(3))}% APR · ${p.months} months`}</Description>
                </CheckboxField>
              );
            })}
          </>
        )}
      </CardBody>
    </Card>
  );
}
