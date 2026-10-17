/* eslint-disable i18next/no-literal-string -- dense billing detail; short operational labels stay literal (same convention as the quote page). Entity names route through getName(). */
// The proposal builder: a PROPOSAL quote's options (the customer chooses one),
// its add-ons (any, offered, included or hidden per option) and its cover
// note. Every figure is the server's; edits go through the document's edit
// queue and return the whole quote.
import { Fragment, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@dispatch/i18n';
import { formatCurrency, formatTimestamp } from '@dispatch/utils';
import { CheckIcon, EllipsisHorizontalIcon, ExclamationTriangleIcon, PhotoIcon, PlusIcon, XMarkIcon } from '@heroicons/react/16/solid';
import clsx from 'clsx';
import {
  laborRatesApi,
  quotesApi,
  type AddOnMode,
  type PricedSelection,
  type Quote,
  type QuoteLineItem,
  type QuoteOption,
  type QuoteOptionFields,
} from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { Button } from '../catalyst/button';
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '../catalyst/dialog';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '../catalyst/dropdown';
import { Field, Label, Description } from '../catalyst/fieldset';
import { Switch } from '../catalyst/switch';
import { Textarea } from '../catalyst/textarea';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '../ui/Card';
import { DenseTable, DenseTHead } from '../ui/DenseTable';
import { Pill, Tag } from '../ui/Pill';
import AccountManagerPicker from '../AccountManagerPicker';
import ConfirmDialog from '../ConfirmDialog';
import { AddLinePanel } from '../document/AddLinePanel';
import type { NewLine } from '../document/DocumentLinesCard';
import { LINE_TYPE_LABEL } from '../document/documentModel';
import { DocumentAdjustDialog } from '../document/DocumentAdjustDialog';
import type { useDocumentEditor } from '../document/useDocumentEditor';
import {
  NEXT_MODE,
  addOnLines,
  allOptions,
  headerFields,
  marginPct,
  modeOf,
  optionFields,
  optionHighlights,
  optionLines,
  optionPhoto,
  pricedOption,
  savingLabel,
  sendChecks,
  sharedLines,
} from './proposalModel';
import { useQuoteSelection } from './useQuoteSelection';
import { builtText } from '../../lib/workOrderActivityRows';
import { SignedCopyCard } from './SignedCopy';
import { SavingsCard } from './SavingsCard';

type Run = ReturnType<typeof useDocumentEditor<Quote>>['run'];
type PricedOption = PricedSelection['options'][number];

const MODE_LABEL: Record<AddOnMode, string> = { OFFER: 'Offer', INCLUDED: 'Included', HIDDEN: '—' };
const MODE_CLASS: Record<AddOnMode, string> = {
  OFFER: 'pb-mode pb-mode--offer',
  INCLUDED: 'pb-mode pb-mode--included',
  HIDDEN: 'pb-mode pb-mode--hidden',
};
const SPECS_MAX = 6;
const HIGHLIGHTS_MAX = 6;

/** Where the add-line dialog puts what's picked. */
type AddTarget = { kind: 'option'; option: QuoteOption } | { kind: 'addon' } | null;

const lineSub = (l: QuoteLineItem) => {
  const type = l.type ? LINE_TYPE_LABEL[l.type] : 'Line';
  return l.quantity !== 1 ? `${type} · ${l.quantity} × ${formatCurrency(l.unitPrice)}` : type;
};

export function ProposalBuilder({ quote, editable, run }: { quote: Quote; editable: boolean; run: Run }) {
  const [adding, setAdding] = useState<AddTarget>(null);
  const accepted = quote.status === 'ACCEPTED';
  const options = allOptions(quote);
  const { data: priced } = useQuoteSelection(quote);
  const groups = [...(quote.optionGroups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  const { data: rates = [] } = useQuery({ queryKey: ['labor-rates'], queryFn: () => laborRatesApi.getAll() });
  const docPoLineIds = new Set(quote.lineItems.map((l) => l.sourcePoLineId).filter((v): v is string => !!v));

  const addLine = async (line: NewLine) => {
    const target = adding;
    if (!target) return false;
    const ok = await run(
      (version) =>
        quotesApi.addLine(quote.id, {
          ...line,
          version,
          ...(target.kind === 'option' ? { optionId: target.option.id, role: 'REQUIRED' as const } : { role: 'ADD_ON' as const }),
        }),
      'Couldn’t add the line',
    );
    if (ok) setAdding(null);
    return ok;
  };

  const start = () =>
    run(async (version) => {
      const withGroup = await quotesApi.addOptionGroup(quote.id, { version, name: 'Options' });
      const group = withGroup.optionGroups?.[0];
      if (!group) return withGroup;
      return quotesApi.addOption(quote.id, { version: withGroup.version ?? version, groupId: group.id, name: 'Option 1' });
    }, 'Couldn’t start the proposal');

  return (
    <div className="pb-grid">
      <div className="pb-main">
        {groups.length === 0 ? (
          <Card>
            <CardHead>
              <CardTitle>Start the proposal</CardTitle>
              <CardSub>Options the customer chooses between, then add-ons. Everything stays editable.</CardSub>
            </CardHead>
            <CardBody>
              {editable ? (
                <Button color="dark/zinc" size="xs" onClick={() => void start()}>
                  <PlusIcon data-slot="icon" />
                  Add the first option
                </Button>
              ) : (
                <p className="text-[12.5px] text-fg-muted">No options yet.</p>
              )}
            </CardBody>
          </Card>
        ) : (
          groups.map((g) => (
            <OptionsCard
              key={g.id}
              quote={quote}
              groupId={g.id}
              groupName={g.name}
              options={[...g.options].sort((a, b) => a.sortOrder - b.sortOrder)}
              editable={editable}
              accepted={accepted}
              priced={priced}
              run={run}
              onAddLine={(option) => setAdding({ kind: 'option', option })}
            />
          ))
        )}
        {sharedLines(quote).length > 0 && <SharedLinesCard quote={quote} editable={editable} run={run} />}
        {options.length > 0 && (
          <AddOnsCard quote={quote} options={options} editable={editable} accepted={accepted} run={run} onAdd={() => setAdding({ kind: 'addon' })} />
        )}
        {options.length > 0 && <SavingsCard quote={quote} editable={editable} run={run} />}
        <CoverNoteCard quote={quote} editable={editable} run={run} />
      </div>
      <Rail quote={quote} options={options} accepted={accepted} priced={priced} />

      <Dialog open={!!adding} onClose={() => setAdding(null)} size="3xl">
        <DialogTitle>{adding?.kind === 'option' ? `Add a line to ${adding.option.name}` : 'Add an add-on'}</DialogTitle>
        <DialogDescription>
          {adding?.kind === 'option'
            ? 'Sold with this option. Labor and fees can sit next to the system.'
            : 'Offered on every option to start; change it per option in the add-ons table.'}
        </DialogDescription>
        <DialogBody>
          {adding && (
            <AddLinePanel
              rates={rates.filter((r) => r.active)}
              billToCustomerId={quote.customerId}
              workOrderId={quote.workOrderId}
              ratePlanId={quote.ratePlanId}
              docPoLineIds={docPoLineIds}
              onAdd={addLine}
              onClose={() => setAdding(null)}
            />
          )}
        </DialogBody>
      </Dialog>
    </div>
  );
}

/** A text that saves on blur or Enter when it changed (and isn't blank, unless `allowEmpty`). */
function InlineText({
  value,
  onSave,
  className,
  placeholder,
  ariaLabel,
  maxLength,
  allowEmpty,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  placeholder?: string;
  ariaLabel: string;
  maxLength?: number;
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  // A new server value replaces the draft (another edit landed).
  if (value !== shown) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => {
    const next = draft.trim();
    if (next === value.trim()) return;
    if (!next && !allowEmpty) {
      setDraft(value);
      return;
    }
    onSave(next);
  };
  return (
    <input
      className={clsx('pb-inline', className)}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function OptionsCard({
  quote,
  groupId,
  groupName,
  options,
  editable,
  accepted,
  priced,
  run,
  onAddLine,
}: {
  quote: Quote;
  groupId: string;
  groupName: string;
  options: QuoteOption[];
  editable: boolean;
  accepted: boolean;
  priced: PricedSelection | undefined;
  run: Run;
  onAddLine: (option: QuoteOption) => void;
}) {
  const [editing, setEditing] = useState<QuoteOption | null>(null);
  const [deleting, setDeleting] = useState<QuoteOption | null>(null);
  const [discounting, setDiscounting] = useState<QuoteOption | null>(null);
  const discountBase = (o: QuoteOption) => {
    const live = pricedOption(priced, o.id)?.totals;
    const base = live?.listPrice ?? o.totals.grossSubtotal;
    return { base, room: base - (live?.youSave ?? o.totals.adjustmentTotal), lines: optionLines(quote, o.id).length };
  };
  const update = (o: QuoteOption, change: Partial<QuoteOptionFields>, fail = 'Couldn’t save the option') =>
    run((version) => quotesApi.updateOption(quote.id, o.id, { ...optionFields(o, change), version }), fail);
  const move = (index: number, by: number) => {
    const ids = options.map((o) => o.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id);
    void run((version) => quotesApi.reorderOptions(quote.id, groupId, { version, optionIds: ids }), 'Couldn’t reorder the options');
  };
  const add = () =>
    run(
      (version) => quotesApi.addOption(quote.id, { version, groupId, name: `Option ${options.length + 1}` }),
      'Couldn’t add the option',
    );

  return (
    <Card>
      <CardHead>
        <CardTitle>{groupName}</CardTitle>
        <CardSub>Customer chooses one</CardSub>
        {editable && (
          <Button outline size="xs" className="ml-auto" onClick={() => void add()}>
            <PlusIcon data-slot="icon" />
            Add option
          </Button>
        )}
      </CardHead>
      <CardBody>
        <div className="pb-opts" style={{ ['--n' as string]: Math.min(options.length, 4) }}>
          {options.map((o, i) => (
            <OptionCard
              key={o.id}
              quote={quote}
              option={o}
              index={i}
              count={options.length}
              editable={editable}
              accepted={accepted}
              priced={pricedOption(priced, o.id)}
              onRename={(name) => void update(o, { name })}
              onTagline={(tagline) => void update(o, { tagline: tagline || null })}
              onPopular={() => void update(o, { recommended: !o.recommended })}
              onRebate={(rebateAmount) => void update(o, { rebateAmount })}
              onMove={(by) => move(i, by)}
              onEdit={() => setEditing(o)}
              onDiscount={() => setDiscounting(o)}
              onDelete={() => setDeleting(o)}
              onAddLine={() => onAddLine(o)}
              onRemoveLine={(line) =>
                void run((version) => quotesApi.deleteLine(quote.id, line.id, version), 'Couldn’t remove the line')
              }
            />
          ))}
        </div>
      </CardBody>
      <DocumentAdjustDialog
        target={discounting ? { option: { id: discounting.id, name: discounting.name } } : null}
        existing={(quote.adjustments ?? []).filter((a) => !!discounting && a.optionId === discounting.id)}
        base={discounting ? discountBase(discounting) : null}
        onAdd={(a) => run((version) => quotesApi.addAdjustment(quote.id, { ...a, version }), 'Couldn’t add the discount')}
        onRemove={(a) => run((version) => quotesApi.deleteAdjustment(quote.id, a.id, version), 'Couldn’t remove the discount')}
        onClose={() => setDiscounting(null)}
      />
      <OptionDetailsDialog
        option={editing}
        onClose={() => setEditing(null)}
        onSave={async (change) => {
          if (!editing) return;
          if (await update(editing, change)) setEditing(null);
        }}
      />
      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          const o = deleting;
          if (o) void run((version) => quotesApi.deleteOption(quote.id, o.id, version), 'Couldn’t remove the option');
          setDeleting(null);
        }}
        title={`Remove ${deleting?.name ?? 'this option'}?`}
        message="Its lines go with it. Add-ons stay on the quote."
        confirmLabel="Remove option"
        isDestructive
      />
    </Card>
  );
}

function OptionCard({
  quote,
  option: o,
  index,
  count,
  editable,
  accepted,
  priced,
  onRename,
  onTagline,
  onPopular,
  onRebate,
  onMove,
  onEdit,
  onDiscount,
  onDelete,
  onAddLine,
  onRemoveLine,
}: {
  quote: Quote;
  option: QuoteOption;
  index: number;
  count: number;
  editable: boolean;
  accepted: boolean;
  /** Live figures from the priced selection; the quote's own until it loads. */
  priced?: PricedOption;
  onRename: (name: string) => void;
  onTagline: (tagline: string) => void;
  onPopular: () => void;
  onRebate: (amount: number | null) => void;
  onMove: (by: number) => void;
  onEdit: () => void;
  onDiscount: () => void;
  onDelete: () => void;
  onAddLine: () => void;
  onRemoveLine: (line: QuoteLineItem) => void;
}) {
  const lines = optionLines(quote, o.id);
  const included = addOnLines(quote).filter((l) => modeOf(o, l.id) === 'INCLUDED');
  const photo = optionPhoto(o);
  const highlights = optionHighlights(o);
  const chosen = accepted && o.selected;
  return (
    <div
      className={clsx('pb-opt', o.recommended && !accepted && 'pb-opt--popular', chosen && 'pb-opt--chosen', accepted && !chosen && 'pb-opt--declined')}
      data-testid="proposal-option"
    >
      <div className="flex items-center gap-1.5">
        <span className="pb-optnum">{index + 1}</span>
        {editable ? (
          <InlineText value={o.name} onSave={onRename} className="pb-optname" ariaLabel="Option name" maxLength={120} />
        ) : (
          <span className="pb-optname">{o.name}</span>
        )}
        {chosen && (
          <Pill tone="success" dot>
            Chosen
          </Pill>
        )}
        {accepted && !chosen && <span className="text-[11px] text-fg-muted">Declined</span>}
        {editable && (
          <Dropdown>
            <DropdownButton plain size="xs" aria-label={`Actions for ${o.name}`}>
              <EllipsisHorizontalIcon />
            </DropdownButton>
            <DropdownMenu anchor="bottom end">
              <DropdownItem onClick={onEdit}>
                <DropdownLabel>Specs and highlights</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={onDiscount}>
                <DropdownLabel>Discount on this option</DropdownLabel>
              </DropdownItem>
              {index > 0 && (
                <DropdownItem onClick={() => onMove(-1)}>
                  <DropdownLabel>Move left</DropdownLabel>
                </DropdownItem>
              )}
              {index < count - 1 && (
                <DropdownItem onClick={() => onMove(1)}>
                  <DropdownLabel>Move right</DropdownLabel>
                </DropdownItem>
              )}
              <DropdownItem onClick={onDelete}>
                <DropdownLabel>Remove option</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        )}
      </div>
      {!accepted && (o.recommended || editable) && (
        <button
          type="button"
          className={clsx('pb-pop', o.recommended && 'pb-pop--on')}
          disabled={!editable}
          aria-pressed={o.recommended}
          onClick={onPopular}
        >
          {o.recommended ? '★ Most popular' : '+ Most popular badge'}
        </button>
      )}
      {editable ? (
        <InlineText
          value={o.tagline ?? ''}
          onSave={onTagline}
          className="pb-tagline"
          placeholder="One-line pitch"
          ariaLabel="Tagline"
          maxLength={200}
          allowEmpty
        />
      ) : (
        o.tagline && <div className="pb-tagline">{o.tagline}</div>
      )}
      {photo ? (
        <img src={photo.thumbnailUrl} alt="" className="pb-photo" />
      ) : (
        <div className="pb-photo pb-photo--empty">
          <PhotoIcon className="size-3.5" />
          No photo
        </div>
      )}
      {o.specs.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {o.specs.map((s) => (
            <span key={s} className="pb-spec">
              {s}
            </span>
          ))}
        </div>
      )}
      <div className="text-[11px] text-fg-muted">
        {highlights.length
          ? `${highlights.length} highlight${highlights.length === 1 ? '' : 's'}${o.highlights.length ? ' for this quote' : ' from the pricebook item'}`
          : 'No highlights'}
        {editable && (
          <>
            {' · '}
            <button type="button" className="card-action" onClick={onEdit}>
              Edit
            </button>
          </>
        )}
      </div>

      <div className="pb-lines">
        {lines.map((l) => (
          <div key={l.id} className="pb-line" data-testid="proposal-option-line">
            <div className="min-w-0">
              <div className="pb-line-name" title={l.description}>
                {l.description}
              </div>
              <div className="pb-line-sub">{lineSub(l)}</div>
            </div>
            <span className="pb-line-amt tabular-nums">{formatCurrency(l.lineTotal)}</span>
            {editable && (
              <button type="button" className="pb-line-x" aria-label={`Remove ${l.description}`} onClick={() => onRemoveLine(l)}>
                <XMarkIcon className="size-3" />
              </button>
            )}
          </div>
        ))}
        {included.map((l) => (
          <div key={l.id} className="pb-line">
            <div className="min-w-0">
              <div className="pb-line-name">{l.description}</div>
              <div className="pb-line-sub">Included · set in add-ons</div>
            </div>
            <span className="pb-line-amt text-[11.5px] font-semibold text-success-500">Included</span>
          </div>
        ))}
        {!lines.length && <div className="py-2 text-[12px] text-fg-muted">Add a system from the pricebook to start.</div>}
        {editable && (
          <button type="button" className="card-action pt-2" onClick={onAddLine}>
            <PlusIcon />
            Add line
          </button>
        )}
      </div>

      <OptionFoot option={o} priced={priced} editable={editable} onRebate={onRebate} />
    </div>
  );
}

/** List, each saving with its reason, total, rebate, and the internal margin. */
function OptionFoot({
  option: o,
  priced,
  editable,
  onRebate,
}: {
  option: QuoteOption;
  priced?: PricedOption;
  editable: boolean;
  onRebate: (amount: number | null) => void;
}) {
  const live = priced?.totals;
  const list = live?.listPrice ?? o.totals.grossSubtotal;
  const total = live?.totalAmount ?? o.totals.totalAmount;
  const tax = live?.taxAmount ?? o.totals.taxAmount;
  const rebate = o.rebateAmount ?? 0;
  const afterRebate = live ? live.afterRebate : rebate > 0 ? total - rebate : null;
  const margin = live?.margin;
  return (
    <div className="pb-opt-foot">
      <Kv label="List price" value={formatCurrency(list)} />
      {priced
        ? priced.savings.map((sv) => <Kv key={sv.adjustmentId} label={savingLabel(sv)} value={`−${formatCurrency(sv.amount)}`} saving />)
        : o.totals.adjustmentTotal > 0 && <Kv label="Discounts" value={`−${formatCurrency(o.totals.adjustmentTotal)}`} saving />}
      {live && live.youSave > 0 && <Kv label="You save" value={formatCurrency(live.youSave)} saving />}
      {tax > 0 && <Kv label="Tax" value={formatCurrency(tax)} />}
      <Kv label="Total" value={formatCurrency(total)} strong />
      <Kv
        label={
          <>
            Rebate <span className="pb-hint">utility · not on the invoice</span>
          </>
        }
        value={
          editable ? (
            <RebateInput value={o.rebateAmount ?? null} onSave={onRebate} name={o.name} />
          ) : rebate ? (
            formatCurrency(rebate)
          ) : (
            '—'
          )
        }
      />
      {afterRebate != null && <Kv label="After rebate" value={formatCurrency(afterRebate)} />}
      {margin && (
        <>
          <Kv
            label={
              <>
                Margin after savings <Tag>Internal</Tag>
              </>
            }
            value={
              <span className={clsx('font-semibold', margin.belowFloor && 'text-warning-fg')}>
                {margin.margin == null ? '—' : marginPct(margin.margin)}
              </span>
            }
          />
          {margin.belowFloor && margin.floor != null && (
            <div className="pb-warn">{`Below the ${marginPct(margin.floor)} floor.`}</div>
          )}
          {!margin.costKnown && <div className="pb-costnote">Some lines have no cost; they count as $0.</div>}
        </>
      )}
    </div>
  );
}

function Kv({ label, value, strong, saving }: { label: ReactNode; value: ReactNode; strong?: boolean; saving?: boolean }) {
  return (
    <div className={clsx('pb-kv', strong && 'pb-kv--strong', saving && 'pb-kv--saving')}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function RebateInput({ value, onSave, name }: { value: number | null; onSave: (v: number | null) => void; name: string }) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setDraft(value ? String(value) : '');
  }
  const commit = () => {
    const n = parseFloat(draft.replace(/[^0-9.]/g, ''));
    const next = Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
    if (next !== (value || null)) onSave(next);
  };
  return (
    <span className="pb-money">
      $
      <input
        className="tabular-nums"
        inputMode="decimal"
        aria-label={`Rebate for ${name}`}
        value={draft}
        placeholder="0"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </span>
  );
}

const toList = (text: string, max: number, len: number) =>
  text
    .split('\n')
    .map((s) => s.trim().slice(0, len))
    .filter(Boolean)
    .slice(0, max);

/** Specs, highlights (this quote's override) and rebate, which don't fit inline. */
function OptionDetailsDialog({
  option,
  onClose,
  onSave,
}: {
  option: QuoteOption | null;
  onClose: () => void;
  onSave: (change: Partial<QuoteOptionFields>) => void;
}) {
  return (
    <Dialog open={!!option} onClose={onClose} size="lg">
      {option && <OptionDetailsForm key={option.id} option={option} onClose={onClose} onSave={onSave} />}
    </Dialog>
  );
}

function OptionDetailsForm({
  option,
  onClose,
  onSave,
}: {
  option: QuoteOption;
  onClose: () => void;
  onSave: (change: Partial<QuoteOptionFields>) => void;
}) {
  const itemHighlights = option.itemPresentation?.highlights ?? [];
  const [specs, setSpecs] = useState(option.specs.join('\n'));
  const [highlights, setHighlights] = useState((option.highlights.length ? option.highlights : itemHighlights).join('\n'));
  const highlightList = toList(highlights, HIGHLIGHTS_MAX, 120);
  // Matching the item's means no override: the item's own keep showing.
  const sameAsItem = highlightList.join('\n') === itemHighlights.join('\n');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ specs: toList(specs, SPECS_MAX, 40), highlights: sameAsItem ? [] : highlightList });
      }}
    >
      <DialogTitle>{option.name}</DialogTitle>
      <DialogDescription>How this option reads on the customer’s card.</DialogDescription>
      <DialogBody className="flex flex-col gap-4">
        <Field>
          <Label>Spec chips</Label>
          <Description>{`One per line, up to ${SPECS_MAX}. Short: “17 SEER2”, “Two-stage”.`}</Description>
          <Textarea rows={3} value={specs} onChange={(e) => setSpecs(e.target.value)} />
        </Field>
        <Field>
          <Label>Highlights</Label>
          <Description>
            {itemHighlights.length
              ? `One per line, up to ${HIGHLIGHTS_MAX}. Starts from the pricebook item; changing it applies to this quote only.`
              : `One per line, up to ${HIGHLIGHTS_MAX}.`}
          </Description>
          <Textarea rows={5} value={highlights} onChange={(e) => setHighlights(e.target.value)} />
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" color="dark/zinc">
          Save
        </Button>
      </DialogActions>
    </form>
  );
}

/** Required lines on the whole quote: sold with whichever option is chosen. */
function SharedLinesCard({ quote, editable, run }: { quote: Quote; editable: boolean; run: Run }) {
  return (
    <Card>
      <CardHead>
        <CardTitle>On every option</CardTitle>
        <CardSub>Sold whichever option is chosen</CardSub>
      </CardHead>
      <CardBody>
        <div className="pb-lines pb-lines--flat">
          {sharedLines(quote).map((l) => (
            <div key={l.id} className="pb-line">
              <div className="min-w-0">
                <div className="pb-line-name">{l.description}</div>
                <div className="pb-line-sub">{lineSub(l)}</div>
              </div>
              <span className="pb-line-amt tabular-nums">{formatCurrency(l.lineTotal)}</span>
              {editable && (
                <button
                  type="button"
                  className="pb-line-x"
                  aria-label={`Remove ${l.description}`}
                  onClick={() => void run((version) => quotesApi.deleteLine(quote.id, l.id, version), 'Couldn’t remove the line')}
                >
                  <XMarkIcon className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function AddOnsCard({
  quote,
  options,
  editable,
  accepted,
  run,
  onAdd,
}: {
  quote: Quote;
  options: QuoteOption[];
  editable: boolean;
  accepted: boolean;
  run: Run;
  onAdd: () => void;
}) {
  const addOns = addOnLines(quote);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const setMode = (o: QuoteOption, l: QuoteLineItem) =>
    run(
      (version) => quotesApi.setAddOnMode(quote.id, o.id, l.id, { version, mode: NEXT_MODE[modeOf(o, l.id)] }),
      'Couldn’t change the add-on',
    );
  const recommend = (l: QuoteLineItem, recommended: boolean, note: string | null) =>
    run(
      (version) =>
        quotesApi.setLinePlacement(quote.id, l.id, {
          version,
          optionId: null,
          role: 'ADD_ON',
          recommended,
          recommendationNote: recommended ? note : null,
        }),
      'Couldn’t save the recommendation',
    );
  const cols = options.length + 3 + (editable ? 1 : 0);

  return (
    <Card>
      <CardHead>
        <CardTitle>Add-ons</CardTitle>
        <CardSub>Customer picks any</CardSub>
        {editable && (
          <Button outline size="xs" className="ml-auto" onClick={onAdd}>
            <PlusIcon data-slot="icon" />
            Add add-on
          </Button>
        )}
      </CardHead>
      <CardBody flush>
        {addOns.length === 0 ? (
          <p className="px-3.5 py-4 text-[12.5px] text-fg-muted">
            {editable ? 'No add-ons yet. Add extras the customer can pick, like duct sealing or a surge protector.' : 'No add-ons.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <DenseTable className="pb-addons">
              <DenseTHead>
                <tr>
                  <th>Add-on</th>
                  <th className="right">Price</th>
                  {options.map((o) => (
                    <th key={o.id} className="center">
                      {o.name}
                    </th>
                  ))}
                  <th>{accepted ? 'Result' : 'Recommend'}</th>
                  {editable && <th aria-label="Remove" />}
                </tr>
              </DenseTHead>
              <tbody>
                {addOns.map((l) => (
                  <Fragment key={l.id}>
                    <tr data-testid="proposal-addon">
                      <td className="strong">{l.description}</td>
                      <td className="right num">{formatCurrency(l.lineTotal)}</td>
                      {options.map((o) => {
                        const mode = modeOf(o, l.id);
                        return (
                          <td key={o.id} className="center">
                            <button
                              type="button"
                              className={MODE_CLASS[mode]}
                              disabled={!editable}
                              aria-label={`${l.description} with ${o.name}: ${MODE_LABEL[mode] === '—' ? 'Hidden' : MODE_LABEL[mode]}`}
                              title={editable ? 'Click to change: Offer → Included → Hidden' : undefined}
                              onClick={() => void setMode(o, l)}
                            >
                              {MODE_LABEL[mode]}
                            </button>
                          </td>
                        );
                      })}
                      <td>
                        {accepted ? (
                          l.included ? (
                            <span className="text-[11.5px] text-fg-muted">Included</span>
                          ) : l.selected ? (
                            <Pill tone="success" dot>
                              Taken
                            </Pill>
                          ) : (
                            <span className="text-[11.5px] text-fg-muted">Declined</span>
                          )
                        ) : (
                          <div className="flex items-center gap-2">
                            <Switch
                              aria-label={`Recommend ${l.description}`}
                              checked={!!l.recommended}
                              disabled={!editable}
                              onChange={(on) => {
                                void recommend(l, on, l.recommendationNote ?? null);
                                if (on && !l.recommendationNote) setNoteFor(l.id);
                              }}
                            />
                            {l.recommended && editable && (
                              <button type="button" className="card-action" onClick={() => setNoteFor(noteFor === l.id ? null : l.id)}>
                                {l.recommendationNote ? 'Note' : 'Add note'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      {editable && (
                        <td className="right">
                          <button
                            type="button"
                            className="pb-row-x"
                            aria-label={`Remove ${l.description}`}
                            onClick={() => void run((version) => quotesApi.deleteLine(quote.id, l.id, version), 'Couldn’t remove the add-on')}
                          >
                            <XMarkIcon className="size-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                    {l.recommended && (noteFor === l.id || (!editable && !!l.recommendationNote)) && (
                      <tr className="pb-noterow">
                        <td colSpan={cols}>
                          <div className="pb-note">
                            <span className="pb-note-label">
                              Why I recommend it <span className="pb-hint">shown on the card in the advisor’s name</span>
                            </span>
                            {editable ? (
                              <NoteInput
                                value={l.recommendationNote ?? ''}
                                onSave={(note) => void recommend(l, true, note || null)}
                                label={`Why you recommend ${l.description}`}
                              />
                            ) : (
                              <span className="text-[12.5px] text-fg">{l.recommendationNote}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </DenseTable>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function NoteInput({ value, onSave, label }: { value: string; onSave: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  return (
    <Textarea
      rows={2}
      autoFocus={!value}
      aria-label={label}
      maxLength={500}
      value={draft}
      placeholder="What you found on this visit"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value.trim() && onSave(draft.trim())}
    />
  );
}

function CoverNoteCard({ quote, editable, run }: { quote: Quote; editable: boolean; run: Run }) {
  const [draft, setDraft] = useState(quote.coverNote ?? '');
  const [shown, setShown] = useState(quote.coverNote ?? '');
  if ((quote.coverNote ?? '') !== shown) {
    setShown(quote.coverNote ?? '');
    setDraft(quote.coverNote ?? '');
  }
  const advisorName = quote.advisorName ?? null;
  const save = (change: { coverNote?: string | null; advisorUserId?: string | null }, fail: string) =>
    run((version) => quotesApi.updateHeader(quote.id, headerFields(quote, version, change)), fail);

  return (
    <Card>
      <CardHead>
        <CardTitle>Cover note</CardTitle>
        <CardSub>First thing the customer reads</CardSub>
      </CardHead>
      <CardBody className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="w-full shrink-0 md:w-56">
          <div className="label-tiny mb-1">Advisor</div>
          {editable ? (
            <AccountManagerPicker
              value={quote.advisorUserId ? { id: quote.advisorUserId, name: advisorName ?? '…' } : null}
              onChange={(u) => void save({ advisorUserId: u?.id ?? null }, 'Couldn’t change the advisor')}
              placeholder="Who the customer hears from"
              ariaLabel="Advisor"
            />
          ) : (
            <div className="text-[13px] font-semibold text-fg-strong">{advisorName ?? '—'}</div>
          )}
        </div>
        {editable ? (
          <Textarea
            className="flex-1"
            rows={3}
            maxLength={2000}
            aria-label="Cover note"
            value={draft}
            placeholder="Thanks for walking me through the house today. Here are the ways we can fix it."
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => draft.trim() !== (quote.coverNote ?? '').trim() && void save({ coverNote: draft.trim() || null }, 'Couldn’t save the cover note')}
          />
        ) : (
          <p className="flex-1 whitespace-pre-line text-[12.5px] leading-relaxed text-fg">{quote.coverNote || '—'}</p>
        )}
      </CardBody>
    </Card>
  );
}

function Rail({
  quote,
  options,
  accepted,
  priced,
}: {
  quote: Quote;
  options: QuoteOption[];
  accepted: boolean;
  priced: PricedSelection | undefined;
}) {
  const { getName } = useGlossary();
  const checks = sendChecks(quote, priced);
  return (
    <aside className="pb-rail">
      <Card>
        <CardHead>
          <CardTitle>{accepted ? 'Accepted' : 'Customer sees'}</CardTitle>
        </CardHead>
        <CardBody flush>
          {options.length === 0 && <p className="px-3.5 py-3 text-[12px] text-fg-muted">No options yet.</p>}
          {options.map((o) => {
            const live = pricedOption(priced, o.id)?.totals;
            const total = live?.totalAmount ?? o.totals.totalAmount;
            const rebate = o.rebateAmount ?? 0;
            const afterRebate = live ? live.afterRebate : rebate > 0 ? total - rebate : null;
            return (
              <div key={o.id} className="pb-rail-opt" data-testid="proposal-rail-option">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[12.5px] font-semibold text-fg-strong">{o.name}</span>
                  {o.recommended && !accepted && <span className="pb-pop pb-pop--on">Most popular</span>}
                  {accepted && o.selected && (
                    <Pill tone="success" dot>
                      Chosen
                    </Pill>
                  )}
                  <span className="ml-auto text-[15px] font-bold tabular-nums text-fg-strong">{formatCurrency(total)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11.5px] tabular-nums text-fg-muted">
                  {live && live.youSave > 0 && (
                    <span className="font-semibold text-success-500">{`Save ${formatCurrency(live.youSave)}`}</span>
                  )}
                  {afterRebate != null && <span>{`${formatCurrency(afterRebate)} after rebate`}</span>}
                </div>
              </div>
            );
          })}
          <p className="border-t border-border-soft px-3.5 py-2 text-[11px] text-fg-muted">
            {`Each option’s total, before add-ons. The ${getName('quote').toLowerCase()} total above is the current selection.`}
          </p>
        </CardBody>
      </Card>
      {priced && !accepted && <CurrentSelection quote={quote} priced={priced} />}
      {quote.firstSentAt && <ActivityCard quote={quote} />}
      {/* A signature (on the link or in person) leaves a signed record; the office's verbal yes doesn't. */}
      {accepted && !!quote.approvedByName && <SignedCopyCard quoteId={quote.id} />}
      {!accepted && quote.status === 'DRAFT' && options.length > 0 && (
        <Card>
          <CardHead>
            <CardTitle>Before sending</CardTitle>
          </CardHead>
          <CardBody className="flex flex-col gap-1.5">
            {checks.map((c) => (
              <div key={c.text} className="flex items-start gap-2 text-[12px]" data-testid="proposal-check">
                {c.ok ? (
                  <CheckIcon className="mt-px size-3.5 shrink-0 text-success-500" />
                ) : (
                  <ExclamationTriangleIcon className={clsx('mt-px size-3.5 shrink-0', c.soft ? 'text-fg-muted' : 'text-warning-fg')} />
                )}
                <span className="text-fg">
                  {c.text}
                  {c.soft && <span className="block text-[11px] text-fg-muted">Optional; the card shows without one</span>}
                </span>
              </div>
            ))}
          </CardBody>
        </Card>
      )}
    </aside>
  );
}

/** What the quote is priced for right now, and who chose it. */
function CurrentSelection({ quote, priced }: { quote: Quote; priced: PricedSelection }) {
  const { getName } = useGlossary();
  const chosen = allOptions(quote).filter((o) => priced.selection.optionIds.includes(o.id));
  const addOns = addOnLines(quote).filter((l) => priced.selection.addOnLineIds.includes(l.id));
  const who =
    priced.updatedVia === 'CUSTOMER'
      ? `Chosen by the ${getName('customer').toLowerCase()} on the link`
      : priced.updatedVia === 'ADVISOR'
        ? 'Set in the app'
        : 'Nobody has chosen yet: the most popular option is shown';
  return (
    <Card>
      <CardHead>
        <CardTitle>Current selection</CardTitle>
      </CardHead>
      <CardBody className="flex flex-col gap-1">
        <div className="text-[12.5px] font-semibold text-fg-strong" data-testid="proposal-current-selection">
          {[...chosen.map((o) => o.name), ...addOns.map((l) => l.description)].join(' + ') || '—'}
        </div>
        <div className="text-[12px] tabular-nums text-fg-muted">
          {formatCurrency(priced.totals.totalAmount)}
          {priced.totals.youSave > 0 && ` · saves ${formatCurrency(priced.totals.youSave)}`}
        </div>
        <div className="text-[11.5px] text-fg-muted">
          {who}
          {priced.updatedAt && ` · ${formatTimestamp(priced.updatedAt, { withTime: true })}`}
        </div>
      </CardBody>
    </Card>
  );
}

/** What the customer did with the link, newest first: opens, choices, the decision. */
function ActivityCard({ quote }: { quote: Quote }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['quote-activity', quote.id, quote.version, quote.viewCount],
    queryFn: () => quotesApi.getActivity(quote.id, { limit: 30 }),
  });
  const events = data?.content ?? [];
  const views = quote.viewCount ?? 0;
  return (
    <Card>
      <CardHead>
        <CardTitle>Activity</CardTitle>
        <span className="ml-auto text-[11.5px] text-fg-muted">{views ? `Viewed ${views}×` : 'Not opened yet'}</span>
      </CardHead>
      <CardBody>
        {events.length === 0 ? (
          <p className="text-[12px] text-fg-muted">Nothing yet.</p>
        ) : (
          <ol className="pb-events">
            {events.map((e) => {
              const who = e.kind === 'QUOTE_ACCEPTED' || e.kind === 'QUOTE_SENT' ? e.actor?.userName : null;
              return (
                <li key={e.id} data-testid="proposal-event">
                  <span className="tabular-nums">{formatTimestamp(e.timestamp, { withTime: true })}</span>
                  <span>
                    {builtText(e, t) ?? e.kind}
                    {who && <span className="block text-[11px] text-fg-muted">{who}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}
