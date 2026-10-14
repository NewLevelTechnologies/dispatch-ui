/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the PO detail page). Entity names route through getName(). */
import { useDeferredValue, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { Link, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { MagnifyingGlassIcon } from '@heroicons/react/16/solid';
import { formatCurrency, titleCaseAddress } from '@dispatch/utils';
import {
  agreementApi,
  customerApi,
  invoicesApi,
  quotesApi,
  ratePlansApi,
  taxApi,
  type CustomerSearchResult,
  type QuoteListItem,
  type ServiceLocationSearchResult,
  type WorkOrderSummary,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { showError } from '../../lib/toast';
import { Button } from '../catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Field, Label } from '../catalyst/fieldset';
import { Input, InputGroup } from '../catalyst/input';
import { Radio, RadioField, RadioGroup } from '../catalyst/radio';
import { Select } from '../catalyst/select';
import CustomerPicker from '../CustomerPicker';
import { PremiseMark } from '../ui/PremiseMark';
import { Tag } from '../ui/Pill';
import { BillQuoteDialog } from './BillQuoteDialog';
import { pct } from './documentModel';
import { documentErrorMessage, refreshDocumentLists } from './useDocumentEditor';
import { jobsAt, type StartKind } from './startDocumentModel';

export type { StartKind };

/** A location already chosen (from the job, a location or a customer page); opens on the confirm step. */
export interface StartAt {
  location: ServiceLocationSearchResult;
  workOrderId?: string;
  /** Start with "someone else" picked, for billing a payer on a job. */
  billSomeoneElse?: boolean;
}

const termsLabel = (days: number | null | undefined) =>
  days == null ? null : days === 0 ? 'Due on receipt' : `Net ${days}`;

const placeLine = (l: ServiceLocationSearchResult) => titleCaseAddress(l.address.streetAddress);
const cityLine = (l: ServiceLocationSearchResult) => `${titleCaseAddress(l.address.city)}, ${l.address.state}`;

/**
 * Starts a draft quote or invoice from where the work is: pick the service
 * location (it sets the tax, member benefits and, through its owner, the
 * bill-to and rate plan), confirm who's billed and which job it's for, and
 * land on the draft ready for lines. No dates: they're set when it's sent.
 */
export function StartDocumentDialog({
  kind,
  start,
  query,
  onClose,
}: {
  kind: StartKind | null;
  start?: StartAt | null;
  /** Starts the location search with this typed (a customer's name, to list their locations). */
  query?: string;
  onClose: () => void;
}) {
  // "Invoice from quote" closes this and opens the quote's billing dialog instead.
  const [billingQuote, setBillingQuote] = useState<QuoteListItem | null>(null);
  return (
    <>
      <Dialog open={kind != null && !billingQuote} onClose={onClose} size="xl" className="sm:!max-w-[560px]">
        {kind && (
          <StartForm
            key={`${kind}-${start?.location.id ?? ''}`}
            kind={kind}
            start={start ?? null}
            query={query}
            onClose={onClose}
            onInvoiceQuote={setBillingQuote}
          />
        )}
      </Dialog>
      {billingQuote && (
        <BillQuoteDialog
          quote={billingQuote}
          open
          onClose={() => {
            setBillingQuote(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

function StartForm({
  kind,
  start,
  query,
  onClose,
  onInvoiceQuote,
}: {
  kind: StartKind;
  start: StartAt | null;
  query?: string;
  onClose: () => void;
  onInvoiceQuote: (q: QuoteListItem) => void;
}) {
  const { getName } = useGlossary();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const noun = getName(kind).toLowerCase();
  const woNoun = getName('work_order').toLowerCase();
  const [location, setLocation] = useState<ServiceLocationSearchResult | null>(start?.location ?? null);
  const [billing, setBilling] = useState<'owner' | 'other'>(start?.billSomeoneElse ? 'other' : 'owner');
  const [other, setOther] = useState<CustomerSearchResult | null>(null);
  // undefined until the user picks: then one open, unfinished job is picked for them.
  const [jobChoice, setJobChoice] = useState<string | null | undefined>(start?.workOrderId);
  const [busy, setBusy] = useState(false);
  const { data: jobs = [] } = useQuery({
    queryKey: ['work-orders', 'start-document', location?.id, kind],
    queryFn: () => jobsAt(location!.id, kind),
    enabled: !!location,
  });
  const unfinished = jobs.filter((w) => w.progressCategory !== 'COMPLETED');
  const workOrderId = jobChoice !== undefined ? jobChoice : unfinished.length === 1 ? unfinished[0].id : null;

  const billToId = billing === 'owner' ? (location?.customerId ?? null) : (other?.id ?? null);
  const ready = !!location && !!billToId && !busy;

  const create = async () => {
    if (!ready || !location || !billToId) return;
    setBusy(true);
    try {
      const body = { customerId: billToId, serviceLocationId: location.id, ...(workOrderId ? { workOrderId } : {}) };
      const doc = kind === 'quote' ? await quotesApi.create(body) : await invoicesApi.create(body);
      refreshDocumentLists(queryClient);
      onClose();
      navigate(`${kind === 'quote' ? `/quotes/${doc.id}` : `/invoices/${doc.id}`}?add=pricebook`);
    } catch (err) {
      showError(`Couldn’t create the ${noun}`, documentErrorMessage(err, noun));
      setBusy(false);
    }
  };

  return (
    <>
      <DialogTitle>{`New ${noun}`}</DialogTitle>
      <DialogDescription>Where is the work? Pricing and tax come from the service location and who’s billed.</DialogDescription>
      <DialogBody className="!mt-3">
        {!location ? (
          <LocationSearch initialQuery={query} onPick={(l) => setLocation(l)} />
        ) : (
          <Confirm
            kind={kind}
            location={location}
            billing={billing}
            other={other}
            billToId={billToId}
            jobs={jobs}
            workOrderId={workOrderId}
            woNoun={woNoun}
            onChangeLocation={() => {
              setLocation(null);
              setJobChoice(undefined);
            }}
            onBilling={setBilling}
            onOther={setOther}
            onWorkOrder={setJobChoice}
            onInvoiceQuote={onInvoiceQuote}
          />
        )}
      </DialogBody>
      <DialogActions>
        <span className="mr-auto text-[11.5px] text-fg-muted">
          {location ? (kind === 'quote' ? 'Expiry is set when you send it.' : 'Dated when sent, due by the bill-to’s terms.') : ''}
        </span>
        <Button plain onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button color="dark/zinc" disabled={!ready} onClick={() => void create()}>
          {`Create draft ${noun}`}
        </Button>
      </DialogActions>
    </>
  );
}

/** Step 1: search locations by address, customer or payer; recent ones before anything is typed. */
function LocationSearch({ initialQuery, onPick }: { initialQuery?: string; onPick: (l: ServiceLocationSearchResult) => void }) {
  const { getName } = useGlossary();
  const [search, setSearch] = useState(initialQuery ?? '');
  const q = useDeferredValue(search.trim());
  const [hi, setHi] = useState(0);
  const { data: found } = useQuery({
    queryKey: ['service-locations', 'search', q],
    queryFn: () => customerApi.searchServiceLocations(q, 0, 8),
    enabled: q !== '',
    placeholderData: keepPreviousData,
  });
  const { data: recent } = useQuery({
    queryKey: ['service-locations', 'recent', 4],
    queryFn: () => customerApi.getRecentServiceLocations(4),
  });
  const results = (q ? found?.content : recent?.content) ?? [];
  const highlighted = Math.min(hi, Math.max(0, results.length - 1));

  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHi(Math.min(results.length - 1, highlighted + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(Math.max(0, highlighted - 1));
    } else if (e.key === 'Enter' && results[highlighted]) {
      e.preventDefault();
      onPick(results[highlighted]);
    }
  };

  return (
    <div>
      <InputGroup>
        <MagnifyingGlassIcon data-slot="icon" />
        <Input
          autoFocus
          role="combobox"
          aria-label="Search address, customer, or payer"
          aria-expanded={results.length > 0}
          aria-controls="start-locations"
          aria-activedescendant={results[highlighted] ? `start-location-${results[highlighted].id}` : undefined}
          placeholder="Search address, customer, or payer"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHi(0);
          }}
          onKeyDown={key}
        />
      </InputGroup>
      <div className="mt-3 mb-1 px-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">
        {q ? (results.length === 1 ? '1 location' : `${results.length} locations`) : `Recent ${getName('service_location', true).toLowerCase()}`}
      </div>
      <ul id="start-locations" role="listbox" aria-label="Locations" className="-mx-2">
        {results.map((l, i) => (
          <li
            key={l.id}
            id={`start-location-${l.id}`}
            role="option"
            aria-selected={i === highlighted}
            onMouseEnter={() => setHi(i)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(l)}
            className={clsx('flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5', i === highlighted && 'bg-bg-hover')}
          >
            <PremiseMark premise={l.premiseType ?? 'BUSINESS'} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-semibold text-fg-strong">{l.locationName || placeLine(l)}</span>
              <span className="truncate text-[11.5px] text-fg-muted">
                {l.customerName} · {l.locationName ? `${placeLine(l)}, ` : ''}
                {cityLine(l)}
              </span>
            </span>
            {(l.openWorkOrderCount ?? 0) > 0 && (
              <span className="whitespace-nowrap text-[11px] text-fg-muted">
                {l.openWorkOrderCount === 1 ? '1 open job' : `${l.openWorkOrderCount} open jobs`}
              </span>
            )}
          </li>
        ))}
      </ul>
      {q && found && !results.length && (
        <p className="mt-1 px-0.5 text-[12.5px] text-fg-muted">
          No location matches “{q}”.{' '}
          <Link to="/service-locations/new" className="text-fg-accent hover:underline">
            {`Add a ${getName('service_location').toLowerCase()}`}
          </Link>
        </p>
      )}
    </div>
  );
}

/** Step 2: who's billed, which job, and what the draft will price with. */
function Confirm({
  kind,
  location,
  billing,
  other,
  billToId,
  jobs,
  workOrderId,
  woNoun,
  onChangeLocation,
  onBilling,
  onOther,
  onWorkOrder,
  onInvoiceQuote,
}: {
  kind: StartKind;
  location: ServiceLocationSearchResult;
  billing: 'owner' | 'other';
  other: CustomerSearchResult | null;
  billToId: string | null;
  jobs: WorkOrderSummary[];
  workOrderId: string | null;
  woNoun: string;
  onChangeLocation: () => void;
  onBilling: (b: 'owner' | 'other') => void;
  onOther: (c: CustomerSearchResult | null) => void;
  onWorkOrder: (id: string | null) => void;
  onInvoiceQuote: (q: QuoteListItem) => void;
}) {
  const { data: owner } = useQuery({
    queryKey: ['customers', location.customerId],
    queryFn: () => customerApi.getById(location.customerId),
  });
  const job = jobs.find((w) => w.id === workOrderId) ?? null;

  const { data: quoteLeft } = useQuery({
    queryKey: ['quotes', 'ready-for-job', workOrderId],
    queryFn: () => quotesApi.getAll({ workOrderId: workOrderId!, readyToInvoice: true, size: 1 }),
    enabled: kind === 'invoice' && !!workOrderId,
  });
  const readyQuote = quoteLeft?.content[0] ?? null;

  const { data: plan } = useQuery({
    queryKey: ['customer-rate-plan', billToId],
    queryFn: () => ratePlansApi.getCustomerPlan(billToId!),
    enabled: !!billToId,
  });
  const { data: tax } = useQuery({
    queryKey: ['location-tax-jurisdiction', location.id],
    queryFn: () => taxApi.getLocationJurisdiction(location.id),
  });
  const { data: agreements = [] } = useQuery({
    queryKey: ['agreements', { serviceLocationId: location.id }],
    queryFn: () => agreementApi.list({ serviceLocationId: location.id }),
  });
  const member = agreements.find((a) => a.status === 'ACTIVE');

  const chips: [string, string][] = [
    ...(plan?.effective ? ([['Rate plan', plan.effective.name]] as [string, string][]) : []),
    [
      'Tax',
      tax?.effective
        ? `${tax.effective.name}${tax.effective.rate != null ? ` · ${pct(tax.effective.rate)}` : ''}`
        : tax
          ? 'Not set'
          : '…',
    ],
    ...(member ? ([['Member', member.name]] as [string, string][]) : []),
  ];
  const ownerTerms = termsLabel(owner?.paymentTermsDays);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2.5 rounded-md border border-border bg-bg-elev-2 px-3 py-2">
        <PremiseMark premise={location.premiseType ?? 'BUSINESS'} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-fg-strong">{location.locationName || placeLine(location)}</span>
          <span className="truncate text-[11.5px] text-fg-muted">
            {location.customerName} · {cityLine(location)}
          </span>
        </span>
        <Button plain size="xs" onClick={onChangeLocation}>
          Change
        </Button>
      </div>

      <div>
        <div className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-fg-muted">Bill to</div>
        <RadioGroup value={billing} onChange={(v) => onBilling(v as 'owner' | 'other')} aria-label="Bill to" className="!space-y-2">
          <RadioField>
            <Radio value="owner" />
            <Label className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-fg-strong">{location.customerName}</span>
              {owner?.type === 'BILLING_ONLY' ? <Tag word>Payer</Tag> : <Tag word>Customer</Tag>}
              <span className="text-[11px] text-fg-muted">Location default</span>
              {ownerTerms && <span className="text-[12px] text-fg-muted">· {ownerTerms}</span>}
            </Label>
          </RadioField>
          <RadioField>
            <Radio value="other" />
            <Label>Someone else, like a warranty company or payer</Label>
          </RadioField>
        </RadioGroup>
        {billing === 'other' && (
          <div className="mt-2 pl-7">
            <CustomerPicker value={other} onChange={onOther} ariaLabel="Bill someone else" />
          </div>
        )}
      </div>

      <Field>
        <Label>{`${woNoun.charAt(0).toUpperCase()}${woNoun.slice(1)}`}</Label>
        <Select value={workOrderId ?? ''} onChange={(e) => onWorkOrder(e.target.value || null)}>
          <option value="">{`No ${woNoun}`}</option>
          {jobs.map((w: WorkOrderSummary) => (
            <option key={w.id} value={w.id}>
              {[w.workOrderNumber, w.summary, w.progressCategory === 'COMPLETED' ? 'Complete, not invoiced' : null].filter(Boolean).join(' · ')}
            </option>
          ))}
        </Select>
        <p className="mt-1 text-[11.5px] text-fg-muted">
          {job
            ? `Shows on ${job.workOrderNumber}'s Quotes & invoices tab${job.customerOrderNumber ? `. Customer PO ${job.customerOrderNumber} carries over.` : '.'}`
            : jobs.length
              ? `${jobs.length === 1 ? '1 job' : `${jobs.length} jobs`} here. Link one so it shows up on the job.`
              : `No open ${woNoun}s here. You can link one later.`}
        </p>
        {kind === 'invoice' && readyQuote && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[color-mix(in_oklch,var(--info-500)_32%,var(--border))] bg-[color-mix(in_oklch,var(--info-500)_7%,transparent)] px-2.5 py-2 text-[12px] text-fg">
            <span className="min-w-[200px] flex-1">
              <span className="font-mono">{readyQuote.quoteNumber}</span> was accepted and has{' '}
              <span className="font-semibold tabular-nums">{formatCurrency(readyQuote.remainingToInvoice ?? 0)}</span> not yet invoiced.
            </span>
            <Button outline size="xs" onClick={() => onInvoiceQuote(readyQuote)}>
              Invoice from quote
            </Button>
          </div>
        )}
      </Field>

      <div className="flex flex-wrap gap-1.5" aria-label="What the draft will price with">
        {chips.map(([k, v]) => (
          <span key={k} className="inline-flex items-baseline gap-1 whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-[11.5px]">
            <span className="text-fg-muted">{k}</span>
            <span className="font-semibold text-fg-strong">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
