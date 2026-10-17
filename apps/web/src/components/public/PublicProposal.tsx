// The customer's proposal page (Sales Proposal.html): choose an option, add
// what they want, review and e-sign. The same public link as a standard
// quote; the quote's `presentation` decides which page renders. Every price
// comes from the server: each choice is saved (debounced) and comes back
// priced. Nothing here adds lines up.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from '@dispatch/i18n';
import axios from 'axios';
import {
  publicFinancialApi,
  type PublicApproval,
  type PublicMoney,
  type PublicPricedSelection,
  type PublicProposal as Proposal,
  type PublicProposalAddOn,
  type PublicQuoteResponse,
  type PublicSaving,
  type PublicSelectionChoice,
  type PublicMembershipOffer,
} from '../../api/setup';
import { cadenceWords, memberBenefits } from '../proposal/membershipModel';
import PublicPreviewBanner from '../PublicPreviewBanner';
import { publicNames } from './publicNames';

const num = (v: PublicMoney | null | undefined) => Number(v ?? 0) || 0;
const usd = (v: PublicMoney | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num(v));
const usdCents = (v: PublicMoney | null | undefined) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num(v));
const longDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '';
const initials = (name: string | null | undefined) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] ?? '';
const SAVE_DEBOUNCE_MS = 500;

type Step = 'options' | 'addons' | 'protect' | 'review';

function Check({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3.5 8.5 6.5 11.5 12.5 4.5" />
    </svg>
  );
}

/** An add-on's state with the chosen option: offered, included at no charge, or not offered. */
const addOnMode = (a: PublicProposalAddOn, optionIds: string[]) => {
  const modes = optionIds.map((id) => a.modes?.[id] ?? 'OFFER');
  if (modes.includes('INCLUDED')) return 'INCLUDED';
  if (modes.includes('HIDDEN')) return 'HIDDEN';
  return 'OFFER';
};

/** The choice to start from: the saved one, else each group's most popular (or first) option. */
function initialChoice(proposal: Proposal, priced: PublicPricedSelection | null | undefined): PublicSelectionChoice {
  if (priced?.selection) return priced.selection;
  return {
    optionIds: proposal.groups
      .filter((g) => g.options.length)
      .map((g) => (g.options.find((o) => o.recommended) ?? g.options[0]).id),
    addOnLineIds: [],
  };
}

/** Where choices are saved and how a signature is taken: the share link, or the advisor's logged-in device. */
export interface ProposalActions {
  save: (choice: PublicSelectionChoice) => Promise<PublicPricedSelection>;
  approve: (body: {
    revision: number | undefined;
    signerName: string;
    signature: string;
    selection: PublicSelectionChoice;
    totalAmount: number;
  }) => Promise<void>;
}

/** The customer's link: choices and the signature go through the share token. */
export function PublicProposal({
  data,
  token,
  onReplace,
  onReload,
}: {
  data: PublicQuoteResponse;
  token: string;
  /** The page after an approval. */
  onReplace: (next: PublicQuoteResponse) => void;
  /** Reload the page (the quote changed under the customer). */
  onReload: () => void;
}) {
  const actions: ProposalActions = {
    save: (choice) => publicFinancialApi.saveQuoteSelection(token, choice),
    approve: async (body) => onReplace(await publicFinancialApi.approveProposal(token, { ...body, consent: true })),
  };
  // The office's preview and a draft behind the link can be looked at but not chosen on.
  const canChoose = !data.preview && data.quote.status === 'SENT' && !!data.quote.selection;
  return <ProposalExperience data={data} actions={actions} canChoose={canChoose} canSign={canChoose} mode="remote" onReload={onReload} />;
}

/**
 * The proposal itself, for the link (`remote`) or presented on the advisor's
 * device (`inhome`). Same steps and figures; in the home the top bar names
 * who it's for and who's presenting, and there's a way back to the quote.
 */
export function ProposalExperience({
  data,
  actions,
  canChoose,
  canSign,
  mode,
  onReload,
  onExit,
}: {
  data: PublicQuoteResponse;
  actions: ProposalActions;
  canChoose: boolean;
  /** Choosing without signing: e.g. in the home without permission to take signatures. */
  canSign: boolean;
  mode: 'remote' | 'inhome';
  onReload: () => void;
  onExit?: () => void;
}) {
  const { t } = useTranslation();
  const { quote, tenant, customer } = data;
  const proposal = quote.proposal!;
  const names = publicNames(tenant);
  const sender = tenant.displayName ?? t('public.common.theSender');
  const advisorName = quote.advisor?.name ?? sender;
  const phone = quote.advisor?.phone ?? tenant.supportPhone;
  const shell = { data, mode, onExit };

  if (quote.status === 'ACCEPTED')
    return (
      <Shell {...shell}>
        <Done approval={quote.approval ?? null} data={data} />
      </Shell>
    );
  if (quote.expired || quote.status === 'EXPIRED')
    return (
      <Shell {...shell}>
        <div className="pp-done">
          <div className="pp-done-ic pp-done-ic--warn" aria-hidden>
            !
          </div>
          <h1 className="pp-h1">{t('public.proposal.expired.title', names)}</h1>
          <p className="pp-lede">
            {t('public.proposal.expired.body', { ...names, date: longDate(quote.expirationDate), advisor: advisorName })}
          </p>
          {phone && mode === 'remote' && (
            <a className="pp-btn pp-btn--1 pp-btn--inline mt-6" href={`tel:${phone.replace(/[^\d+]/g, '')}`}>
              {t('public.proposal.call', { name: firstName(advisorName), phone })}
            </a>
          )}
        </div>
      </Shell>
    );
  return (
    <Chooser
      data={data}
      proposal={proposal}
      actions={actions}
      canChoose={canChoose}
      canSign={canSign}
      mode={mode}
      onExit={onExit}
      onReload={onReload}
      customerName={customer.name}
    />
  );
}

/** Top bar and preview banner around every state. `steps` is the step nav, when there is one. */
function Shell({
  data,
  children,
  steps,
  mode = 'remote',
  onExit,
}: {
  data: PublicQuoteResponse;
  children: ReactNode;
  steps?: ReactNode;
  mode?: 'remote' | 'inhome';
  onExit?: () => void;
}) {
  const { t } = useTranslation();
  const { quote, tenant, customer } = data;
  const names = publicNames(tenant);
  const sender = tenant.displayName ?? t('public.common.theSender');
  const advisorName = quote.advisor?.name ?? null;
  const phone = quote.advisor?.phone ?? tenant.supportPhone;
  return (
    <div className="pp">
      {data.preview && <PublicPreviewBanner customer={customer.name} />}
      <header className="pp-top">
        <div className="pp-brand">
          <div className="pp-logo">{tenant.logoUrl ? <img src={tenant.logoUrl} alt="" /> : initials(sender)}</div>
          <div className="flex flex-col">
            <b>{sender}</b>
            <span>{t('public.proposal.number', { ...names, number: quote.quoteNumber })}</span>
          </div>
        </div>
        {steps ?? <span className="mx-auto" />}
        {mode === 'inhome' ? (
          <div className="pp-who pp-who--inhome">
            <span>
              {t('public.proposal.preparedFor')} <b>{customer.name}</b>
            </span>
            {advisorName && <span>{t('public.proposal.with', { name: advisorName })}</span>}
          </div>
        ) : phone && (
          <div className="pp-who">
            <span>{advisorName ? t('public.proposal.questionsFor', { name: firstName(advisorName) }) : t('public.proposal.questions')}</span>
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`}>{phone}</a>
          </div>
        )}
        {onExit && (
          <button type="button" className="pp-link pp-exit" onClick={onExit}>
            {t('public.proposal.exit')}
          </button>
        )}
      </header>
      {children}
    </div>
  );
}

function Chooser({
  data,
  proposal,
  actions,
  canChoose,
  canSign,
  mode,
  onExit,
  onReload,
  customerName,
}: {
  data: PublicQuoteResponse;
  proposal: Proposal;
  actions: ProposalActions;
  canChoose: boolean;
  canSign: boolean;
  mode: 'remote' | 'inhome';
  onExit?: () => void;
  onReload: () => void;
  customerName: string;
}) {
  const { t } = useTranslation();
  const { quote, tenant } = data;
  const names = publicNames(tenant);
  const sender = tenant.displayName ?? t('public.common.theSender');
  const advisorName = quote.advisor?.name ?? sender;

  const [choice, setChoice] = useState<PublicSelectionChoice>(() => initialChoice(proposal, quote.selection));
  const [priced, setPriced] = useState<PublicPricedSelection | null>(quote.selection ?? null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const seq = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  const hasAddOns = proposal.addOns.some((a) => addOnMode(a, choice.optionIds) !== 'HIDDEN');
  // "Protect" offers the membership, when there's one to join.
  const offersMembership = !!priced?.membership;
  const steps: Step[] = ['options', ...(hasAddOns ? (['addons'] as const) : []), ...(offersMembership ? (['protect'] as const) : []), 'review'];
  const [step, setStep] = useState<Step>('options');
  const current = steps.includes(step) ? step : 'options';
  const index = steps.indexOf(current);
  const [sheet, setSheet] = useState(false);

  // Save the whole choice, debounced; the latest answer wins, older ones are ignored.
  const save = useCallback(
    (next: PublicSelectionChoice) => {
      window.clearTimeout(timer.current);
      const mine = ++seq.current;
      setSaving(true);
      timer.current = window.setTimeout(async () => {
        try {
          const result = await actions.save(next);
          if (mine !== seq.current) return;
          setPriced(result);
          setChoice(result.selection);
          setNotice(null);
        } catch (err) {
          if (mine !== seq.current) return;
          const code = axios.isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
          setNotice(
            code === 'RATE_LIMIT_EXCEEDED'
              ? t('public.proposal.notice.slowDown')
              : code === 'QUOTE_NOT_APPROVABLE'
                ? t('public.quote.notApprovable', { ...names, tenant: sender })
                : t('public.proposal.notice.saveFailed'),
          );
          if (code === 'QUOTE_NOT_APPROVABLE') onReload();
        } finally {
          if (mine === seq.current) setSaving(false);
        }
      }, SAVE_DEBOUNCE_MS);
    },
    [actions, t, names, sender, onReload],
  );
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const change = (next: PublicSelectionChoice) => {
    if (!canChoose) return;
    setChoice(next);
    save(next);
  };
  const pickOption = (groupId: string, optionId: string) => {
    const group = proposal.groups.find((g) => g.id === groupId);
    const others = choice.optionIds.filter((id) => !group?.options.some((o) => o.id === id));
    change({ ...choice, optionIds: [...others, optionId] });
  };
  const toggleJoin = () => change({ ...choice, joinMembership: !choice.joinMembership });
  const toggleAddOn = (lineId: string) =>
    change({
      ...choice,
      addOnLineIds: choice.addOnLineIds.includes(lineId)
        ? choice.addOnLineIds.filter((id) => id !== lineId)
        : [...choice.addOnLineIds, lineId],
    });

  const go = (s: Step) => {
    setStep(s);
    setSheet(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Signing.
  const [signature, setSignature] = useState<string | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [signerName, setSignerName] = useState(customerName);
  const [agree, setAgree] = useState(false);
  const [approving, setApproving] = useState(false);
  const ready = canChoose && canSign && !!priced && !saving && !!signature && agree && signerName.trim().length > 0;
  const approve = async () => {
    if (!ready || !priced) return;
    setApproving(true);
    try {
      await actions.approve({
        revision: quote.revision,
        signerName: signerName.trim().slice(0, 120),
        signature: signature!,
        selection: priced.selection,
        totalAmount: num(priced.totals.totalAmount),
      });
      window.scrollTo({ top: 0 });
    } catch (err) {
      const code = axios.isAxiosError(err) ? (err.response?.data as { code?: string } | undefined)?.code : undefined;
      setSignature(null);
      setPadKey((k) => k + 1);
      setNotice(
        code === 'QUOTE_TOTAL_CHANGED'
          ? t('public.proposal.notice.totalChanged')
          : code === 'MARGIN_APPROVAL_REQUIRED'
            ? t('public.proposal.notice.marginApproval')
          : code === 'QUOTE_REVISION_STALE'
            ? t('public.quote.revisionStale', names)
            : code === 'QUOTE_NOT_APPROVABLE'
              ? t('public.quote.notApprovable', { ...names, tenant: sender })
              : t('public.quote.approveError'),
      );
      if (code === 'QUOTE_TOTAL_CHANGED' || code === 'QUOTE_REVISION_STALE' || code === 'QUOTE_NOT_APPROVABLE') onReload();
    } finally {
      setApproving(false);
    }
  };

  const stepLabel = (s: Step) => t(`public.proposal.steps.${s}`);
  const cta =
    current !== 'review'
      ? { label: t('public.proposal.continueTo', { step: stepLabel(steps[index + 1]) }), on: () => go(steps[index + 1]), disabled: false, hint: null }
      : {
          label: approving ? t('public.proposal.approving') : t('public.proposal.approve'),
          on: () => void approve(),
          disabled: !ready || approving,
          hint: !canChoose
            ? t('public.proposal.previewHint', names)
            : !canSign
              ? t('public.proposal.noSignPermission')
              : !(signature && agree)
              ? t('public.proposal.signHint')
              : saving
                ? t('public.proposal.updating')
                : null,
        };

  const stepNav = (
    <nav className="pp-steps" aria-label={t('public.proposal.stepsLabel')}>
      {steps.map((s, i) => (
        <button
          key={s}
          type="button"
          className={`pp-step${s === current ? ' on' : ''}${i < index ? ' done' : ''}`}
          aria-current={s === current ? 'step' : undefined}
          onClick={() => go(s)}
        >
          <span className="n">{i < index ? <Check size={12} /> : i + 1}</span>
          <span className="l">{stepLabel(s)}</span>
        </button>
      ))}
    </nav>
  );

  const cart = (compact: boolean) => (
    <Cart
      proposal={proposal}
      choice={choice}
      priced={priced}
      saving={saving}
      validThrough={longDate(quote.expirationDate)}
      cta={compact ? null : cta}
    />
  );

  return (
    <Shell data={data} steps={stepNav} mode={mode} onExit={onExit}>
      <DealsBanner priced={priced} mode={mode} />
      {notice && (
        <div className="pp-notice" role="status">
          <div>{notice}</div>
        </div>
      )}
      <div className="pp-body">
        <main className="min-w-0">
          {current === 'options' && (
            <OptionsStep
              proposal={proposal}
              choice={choice}
              priced={priced}
              canChoose={canChoose}
              coverNote={quote.coverNote}
              customerName={customerName}
              advisorName={advisorName}
              step={index + 1}
              count={steps.length}
              onPick={pickOption}
            />
          )}
          {current === 'addons' && (
            <AddOnsStep
              proposal={proposal}
              choice={choice}
              canChoose={canChoose}
              advisorName={advisorName}
              step={index + 1}
              count={steps.length}
              onToggle={toggleAddOn}
            />
          )}
          {current === 'protect' && priced?.membership && (
            <ProtectStep
              priced={priced}
              joined={!!choice.joinMembership}
              canChoose={canChoose}
              sender={sender}
              step={index + 1}
              count={steps.length}
              onToggle={toggleJoin}
            />
          )}
          {current === 'review' && (
            <ReviewStep
              priced={priced}
              proposal={proposal}
              step={index + 1}
              count={steps.length}
              sender={sender}
              quoteNumber={quote.quoteNumber}
              validThrough={longDate(quote.expirationDate)}
              canSign={canChoose && canSign}
              padKey={padKey}
              signature={signature}
              onSignature={setSignature}
              signerName={signerName}
              onSignerName={setSignerName}
              agree={agree}
              onAgree={setAgree}
            />
          )}
          {index > 0 && (
            <div className="pp-nav">
              <button type="button" className="pp-btn pp-btn--2 pp-btn--inline" onClick={() => go(steps[index - 1])}>
                {t('public.proposal.back')}
              </button>
            </div>
          )}
        </main>
        <aside className="pp-cart">{cart(false)}</aside>
      </div>

      <div className={`pp-scrim${sheet ? ' open' : ''}`} onClick={() => setSheet(false)} aria-hidden />
      <div className={`pp-sheet${sheet ? ' open' : ''}`}>{cart(true)}</div>
      <div className="pp-bar">
        <button type="button" className="pp-bar-sum" onClick={() => setSheet(!sheet)} aria-expanded={sheet}>
          <b className="tabular-nums">{priced ? usd(priced.totals.totalAmount) : '—'}</b>
          <span className="tabular-nums">
            {priced && num(priced.totals.youSave) > 0 ? `${t('public.proposal.saving', { amount: usd(priced.totals.youSave) })} · ` : ''}
            {sheet ? t('public.proposal.hidePackage') : t('public.proposal.viewPackage')}
          </span>
        </button>
        <button type="button" className="pp-btn pp-btn--1 pp-btn--inline" disabled={cta.disabled} onClick={cta.on}>
          {current !== 'review' ? t('public.proposal.continue') : approving ? t('public.proposal.approving') : t('public.proposal.approveShort')}
        </button>
      </div>
    </Shell>
  );
}

function StepHead({ step, count, title, lede }: { step: number; count: number; title: string; lede?: string | null }) {
  const { t } = useTranslation();
  return (
    <header className="pp-head">
      <div className="pp-eyebrow">{t('public.proposal.stepOf', { step, count })}</div>
      <h1 className="pp-h1">{title}</h1>
      {lede && <p className="pp-lede">{lede}</p>}
    </header>
  );
}

function OptionsStep({
  proposal,
  choice,
  priced,
  canChoose,
  coverNote,
  customerName,
  advisorName,
  step,
  count,
  onPick,
}: {
  proposal: Proposal;
  choice: PublicSelectionChoice;
  priced: PublicPricedSelection | null;
  canChoose: boolean;
  coverNote?: string | null;
  customerName: string;
  advisorName: string;
  step: number;
  count: number;
  onPick: (groupId: string, optionId: string) => void;
}) {
  const { t } = useTranslation();
  const groups = proposal.groups.filter((g) => g.options.length);
  const optionCount = groups.reduce((n, g) => n + g.options.length, 0);
  return (
    <section>
      <StepHead
        step={step}
        count={count}
        title={t('public.proposal.options.title', { name: firstName(customerName), count: optionCount })}
        lede={coverNote || t('public.proposal.options.lede', { advisor: advisorName })}
      />
      {groups.map((g) => (
        <div key={g.id} className="pp-group">
          {groups.length > 1 && <h2 className="pp-group-name">{g.name}</h2>}
          <div className="pp-tiers">
            {g.options.map((o) => {
              const card = priced?.options.find((p) => p.optionId === o.id)?.totals;
              const sel = choice.optionIds.includes(o.id);
              const photo = o.photos[0];
              return (
                <article key={o.id} className={`pp-tier${sel ? ' sel' : ''}`} data-testid="pp-option">
                  {o.recommended && <span className="pp-badge">{t('public.proposal.popular')}</span>}
                  {photo ? <img className="pp-img" src={photo.thumbnailUrl} alt="" /> : <div className="pp-img pp-img--none" />}
                  <div className="pp-tier-b">
                    <div>
                      <div className="pp-tier-name">{o.name}</div>
                      {o.tagline && <div className="pp-tier-tag">{o.tagline}</div>}
                    </div>
                    {o.specs.length > 0 && (
                      <div className="pp-specs">
                        {o.specs.map((s) => (
                          <span key={s}>{s}</span>
                        ))}
                      </div>
                    )}
                    {o.highlights.length > 0 && (
                      <ul className="pp-bul">
                        {o.highlights.map((h) => (
                          <li key={h}>
                            <Check />
                            <span>{h}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="pp-tier-foot">
                      {card && (
                        <div className="pp-price">
                          <div className="pp-big tabular-nums">{usd(card.totalAmount)}</div>
                          {num(card.youSave) > 0 && (
                            <>
                              <div className="pp-sub tabular-nums">
                                <s>{usd(card.listPrice)}</s>
                              </div>
                              <span className="pp-save tabular-nums">{t('public.proposal.youSave', { amount: usd(card.youSave) })}</span>
                            </>
                          )}
                        </div>
                      )}
                      {num(o.rebateAmount) > 0 && (
                        <div className="pp-rebate">{t('public.proposal.rebate', { amount: usd(o.rebateAmount) })}</div>
                      )}
                      {priced?.membership && !choice.joinMembership && num(card?.joinSaves) > 0 && (
                        <div className="pp-rebate">
                          {t('public.proposal.club.cardSaves', { amount: usd(card?.joinSaves), name: priced.membership.name })}
                        </div>
                      )}
                      <button
                        type="button"
                        className={`pp-btn ${sel ? 'pp-btn--on' : 'pp-btn--2'}`}
                        aria-pressed={sel}
                        disabled={!canChoose && !sel}
                        onClick={() => onPick(g.id, o.id)}
                      >
                        {sel ? (
                          <>
                            <Check /> {t('public.proposal.selected')}
                          </>
                        ) : (
                          t('public.proposal.select', { name: o.name })
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

function AddOnsStep({
  proposal,
  choice,
  canChoose,
  advisorName,
  step,
  count,
  onToggle,
}: {
  proposal: Proposal;
  choice: PublicSelectionChoice;
  canChoose: boolean;
  advisorName: string;
  step: number;
  count: number;
  onToggle: (lineId: string) => void;
}) {
  const { t } = useTranslation();
  const chosen = proposal.groups.flatMap((g) => g.options).filter((o) => choice.optionIds.includes(o.id));
  const chosenName = chosen.map((o) => o.name).join(' + ');
  const visible = proposal.addOns.filter((a) => addOnMode(a, choice.optionIds) !== 'HIDDEN');
  const recommended = visible.filter((a) => a.recommended && addOnMode(a, choice.optionIds) === 'OFFER').length;
  return (
    <section>
      <StepHead
        step={step}
        count={count}
        title={t('public.proposal.addons.title')}
        lede={
          recommended
            ? t('public.proposal.addons.ledeRecommended', { option: chosenName, advisor: firstName(advisorName), count: recommended })
            : t('public.proposal.addons.lede', { option: chosenName })
        }
      />
      <div className="pp-addons">
        {visible.map((a) => {
          const included = addOnMode(a, choice.optionIds) === 'INCLUDED';
          const on = !included && choice.addOnLineIds.includes(a.lineId);
          const photo = a.presentation?.photos?.[0];
          const name = a.presentation?.customerName || a.description;
          return (
            <article key={a.lineId} className={`pp-addon${on ? ' on' : ''}`} data-testid="pp-addon">
              {photo ? <img className="pp-img" src={photo.thumbnailUrl} alt="" /> : null}
              <div className="pp-addon-b">
                <div className="pp-addon-name">{name}</div>
                {a.presentation?.description && <div className="pp-addon-desc">{a.presentation.description}</div>}
                {a.recommended && !included && a.recommendationNote && (
                  <div className="pp-rec">
                    <span className="pp-av">{initials(advisorName)}</span>
                    <div>
                      <b>{t('public.proposal.addons.recommended')}</b>
                      <span>{`“${a.recommendationNote}”`}</span>
                    </div>
                  </div>
                )}
                <div className="pp-addon-foot">
                  {included ? (
                    <span className="pp-inc">
                      <Check size={14} /> {t('public.proposal.addons.included', { option: chosenName })}
                    </span>
                  ) : (
                    <>
                      <div className="pp-addon-price tabular-nums">+{usd(a.lineTotal)}</div>
                      <button
                        type="button"
                        className={`pp-btn-sm${on ? ' on' : ''}`}
                        aria-pressed={on}
                        aria-label={on ? t('public.proposal.addons.removeLabel', { name }) : t('public.proposal.addons.addLabel', { name })}
                        disabled={!canChoose}
                        onClick={() => onToggle(a.lineId)}
                      >
                        {on ? (
                          <>
                            <Check size={14} /> {t('public.proposal.addons.added')}
                          </>
                        ) : (
                          t('public.proposal.addons.add')
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

const savingName = (t: (k: string) => string, s: PublicSaving) =>
  s.label ||
  (s.reasonCode === 'INCENTIVE' && s.validThrough
    ? t('public.proposal.decideToday')
    : s.kind === 'WAIVE'
      ? t('public.document.adjustment.waived')
      : t(`public.document.reason.${s.reasonCode}`));

/**
 * The offers with an end date (promotions, decide-today), once each, from the
 * current choice and every card: what the banner under the top bar lists.
 */
function dealsOf(priced: PublicPricedSelection | null): PublicSaving[] {
  if (!priced) return [];
  const all = [...priced.savings, ...priced.options.flatMap((o) => o.savings)];
  const seen = new Set<string>();
  return all.filter((s) => {
    if (!s.validThrough || (s.sourceType !== 'PROMOTION' && s.reasonCode !== 'INCENTIVE')) return false;
    const key = `${s.sourceType ?? ''}:${s.adjustmentId ?? s.label ?? s.reasonCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** "Fall Comfort Event · ends Oct 31" and "Decide-today savings · $350 off · approve by Oct 12". */
function DealsBanner({ priced, mode }: { priced: PublicPricedSelection | null; mode: 'remote' | 'inhome' }) {
  const { t } = useTranslation();
  const deals = dealsOf(priced);
  if (!deals.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="pp-promo" data-testid="pp-deals">
      {deals.map((d, i) => {
        const date = longDate(d.validThrough);
        const incentive = d.sourceType !== 'PROMOTION';
        const ends = incentive
          ? mode === 'inhome' && d.validThrough!.slice(0, 10) <= today
            ? t('public.proposal.deals.endsToday')
            : t('public.proposal.deals.approveBy', { date })
          : t('public.proposal.deals.ends', { date });
        return (
          <span key={i} className={i > 0 ? 'pp-promo-2' : undefined}>
            {/* A promotion's amount differs by option, so only a flat decide-today saving shows one. */}
            <b>{savingName(t, d)}</b>
            {incentive && ` · ${usd(d.amount)} ${t('public.proposal.deals.off')}`} · {ends}
          </span>
        );
      })}
    </div>
  );
}

/** What the choice sells, priced: the package lines, savings and total. */
function PackageLines({ priced, proposal }: { priced: PublicPricedSelection | PublicApproval; proposal: Proposal | null }) {
  const { t } = useTranslation();
  const optionName = (id: string | null) => proposal?.groups.flatMap((g) => g.options).find((o) => o.id === id)?.name;
  return (
    <>
      {priced.lines.map((l, i) => (
        <div key={l.id ?? i} className="pp-line" data-testid="pp-package-line">
          <div className="col">
            <span className="pp-line-n">{l.description}</span>
            <span className="pp-line-s">
              {l.included
                ? t('public.proposal.includedWith', { option: optionName(l.optionId) ?? '' })
                : l.optionId
                  ? optionName(l.optionId)
                  : t('public.proposal.addOn')}
            </span>
          </div>
          <span className="grow" />
          {l.included ? (
            <span className="pp-line-inc">{t('public.proposal.included')}</span>
          ) : (
            <div className="pp-line-a tabular-nums">
              {num(l.adjustmentAmount) > 0 && <s>{usdCents(l.lineTotal)}</s>}
              <b>{usdCents(l.netAmount)}</b>
            </div>
          )}
        </div>
      ))}
      {num(priced.totals.taxAmount) > 0 && (
        <div className="pp-line">
          <span className="pp-line-s">{t('public.proposal.tax')}</span>
          <span className="grow" />
          <div className="pp-line-a tabular-nums">
            <b>{usdCents(priced.totals.taxAmount)}</b>
          </div>
        </div>
      )}
      <div className="pp-line pp-line--total">
        <span>{t('public.proposal.total')}</span>
        <span className="grow" />
        <div className="pp-line-a tabular-nums">
          {num(priced.totals.youSave) > 0 && <s>{usdCents(priced.totals.listPrice)}</s>}
          <b data-testid="pp-total">{usdCents(priced.totals.totalAmount)}</b>
        </div>
      </div>
    </>
  );
}

/** "$19 / month", from the plan's amount and cadence. */
function clubPrice(t: (k: string, o?: Record<string, unknown>) => string, m: PublicMembershipOffer): string {
  const every = cadenceWords(m);
  return every ? t('public.proposal.club.price', { amount: usdCents(m.amount), every }) : usdCents(m.amount);
}

/** The membership offer: what it costs, what it saves on this job, what it includes. */
function ProtectStep({
  priced,
  joined,
  canChoose,
  sender,
  step,
  count,
  onToggle,
}: {
  priced: PublicPricedSelection;
  joined: boolean;
  canChoose: boolean;
  sender: string;
  step: number;
  count: number;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const m = priced.membership!;
  const saves = num(priced.totals.joinSaves);
  return (
    <section>
      <StepHead step={step} count={count} title={t('public.proposal.club.title')} lede={t('public.proposal.club.lede')} />
      <div className="pp-protect">
        <article className={`pp-club${joined ? ' on' : ''}`} data-testid="pp-club">
          <div className="pp-club-head">
            <div>
              <div className="pp-eyebrow pp-eyebrow--inv">{t('public.proposal.club.eyebrow')}</div>
              <div className="pp-club-name">{m.name}</div>
            </div>
            {m.amount != null && <div className="pp-club-price tabular-nums">{clubPrice(t, m)}</div>}
          </div>
          <div className="pp-club-b">
            {saves > 0 && (
              <div className="pp-club-today">
                {t('public.proposal.club.saves', { amount: usd(saves) })}
              </div>
            )}
            <ul className="pp-bul">
              {memberBenefits(m).map((b) => (
                <li key={b.kind}>
                  <Check />
                  <span>{t(`public.proposal.club.benefit.${b.kind}`, { pct: b.pct })}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className={`pp-btn ${joined ? 'pp-btn--on' : 'pp-btn--1'}`}
              aria-pressed={joined}
              disabled={!canChoose}
              onClick={onToggle}
            >
              {joined ? (
                <>
                  <Check /> {t('public.proposal.club.added', { name: m.name })}
                </>
              ) : (
                t('public.proposal.club.add', { name: m.name })
              )}
            </button>
            <div className="pp-fine">{t('public.proposal.club.fine', { tenant: sender })}</div>
          </div>
        </article>
      </div>
    </section>
  );
}

function ReviewStep({
  priced,
  proposal,
  step,
  count,
  sender,
  quoteNumber,
  validThrough,
  canSign,
  padKey,
  signature,
  onSignature,
  signerName,
  onSignerName,
  agree,
  onAgree,
}: {
  priced: PublicPricedSelection | null;
  proposal: Proposal;
  step: number;
  count: number;
  sender: string;
  quoteNumber: string;
  validThrough: string;
  canSign: boolean;
  padKey: number;
  signature: string | null;
  onSignature: (png: string | null) => void;
  signerName: string;
  onSignerName: (v: string) => void;
  agree: boolean;
  onAgree: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <section>
      <StepHead step={step} count={count} title={t('public.proposal.review.title')} lede={t('public.proposal.review.lede')} />
      <div className="pp-stack">
        <div className="pp-card">
          <div className="pp-card-t">{t('public.proposal.package')}</div>
          {priced ? <PackageLines priced={priced} proposal={proposal} /> : <p className="pp-fine">{t('public.proposal.updating')}</p>}
        </div>
        {priced && num(priced.totals.youSave) > 0 && (
          <div className="pp-card pp-savings">
            <div className="pp-savings-big tabular-nums">{t('public.proposal.youreSaving', { amount: usd(priced.totals.youSave) })}</div>
            {priced.savings.map((s, i) => (
              <div key={s.adjustmentId ?? i} className="pp-line pp-line--adj">
                <span className="pp-line-n">{savingName(t, s)}</span>
                <span className="grow" />
                <b className="tabular-nums">−{usdCents(s.amount)}</b>
              </div>
            ))}
            {num(priced.totals.rebateAmount) > 0 && (
              <div className="pp-rebate-note">{t('public.proposal.rebateNote', { amount: usd(priced.totals.rebateAmount) })}</div>
            )}
          </div>
        )}
        {canSign && priced && (
          <div className="pp-card">
            <div className="pp-card-t">{t('public.proposal.review.approveTitle')}</div>
            <p className="pp-auth">
              {t('public.proposal.review.authorize', {
                tenant: sender,
                total: usdCents(priced.totals.totalAmount),
                number: quoteNumber,
                date: validThrough,
              })}
            </p>
            <SignaturePad key={padKey} signed={!!signature} onChange={onSignature} />
            <label className="pp-field">
              {t('public.proposal.review.name')}
              <input value={signerName} maxLength={120} autoComplete="name" onChange={(e) => onSignerName(e.target.value)} />
            </label>
            <label className="pp-agree">
              <input type="checkbox" checked={agree} onChange={(e) => onAgree(e.target.checked)} />
              <span>{t('public.proposal.review.consent', { tenant: sender })}</span>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}

/** Draw with a finger or mouse; hands back a PNG data URL once there's ink. */
function SignaturePad({ signed, onChange }: { signed: boolean; onChange: (png: string | null) => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    cv.width = Math.max(1, r.width * dpr);
    cv.height = Math.max(1, r.height * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Always dark ink on the white pad, so the signed copy reads in any theme.
    ctx.strokeStyle = '#111827';
  }, []);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const ctx = e.currentTarget.getContext('2d');
    ctx?.beginPath();
    ctx?.moveTo(...pos(e));
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    ctx?.lineTo(...pos(e));
    ctx?.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const cv = ref.current;
    if (cv) onChange(cv.toDataURL('image/png'));
  };
  const clear = () => {
    const cv = ref.current;
    cv?.getContext('2d')?.clearRect(0, 0, cv.width, cv.height);
    onChange(null);
  };
  return (
    <div className="pp-sig">
      <canvas
        ref={ref}
        aria-label={t('public.proposal.review.signatureLabel')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      {!signed && <div className="pp-sig-ph">{t('public.proposal.review.signHere')}</div>}
      <div className="pp-sig-line" />
      {signed && (
        <button type="button" className="pp-link" onClick={clear}>
          {t('public.proposal.review.clear')}
        </button>
      )}
    </div>
  );
}

function Cart({
  proposal,
  choice,
  priced,
  saving,
  validThrough,
  cta,
}: {
  proposal: Proposal;
  choice: PublicSelectionChoice;
  priced: PublicPricedSelection | null;
  saving: boolean;
  validThrough: string;
  cta: { label: string; on: () => void; disabled: boolean; hint: string | null } | null;
}) {
  const { t } = useTranslation();
  const chosen = proposal.groups.flatMap((g) => g.options).filter((o) => choice.optionIds.includes(o.id));
  const addOns = proposal.addOns.filter(
    (a) => choice.addOnLineIds.includes(a.lineId) && addOnMode(a, choice.optionIds) === 'OFFER',
  );
  return (
    <div className="pp-cart-in" data-testid="pp-cart">
      <div className="pp-cart-t">{t('public.proposal.package')}</div>
      <div className="pp-cart-lines">
        {chosen.map((o) => (
          <div key={o.id} className="pp-cart-line">
            <span>{o.name}</span>
            <b className="tabular-nums">{usd(priced?.options.find((p) => p.optionId === o.id)?.totals.totalAmount)}</b>
          </div>
        ))}
        {addOns.map((a) => (
          <div key={a.lineId} className="pp-cart-line">
            <span>{a.presentation?.customerName || a.description}</span>
            <b className="tabular-nums">+{usd(a.lineTotal)}</b>
          </div>
        ))}
        {choice.joinMembership && priced?.membership && (
          <div className="pp-cart-line">
            <span>
              {priced.membership.name}
              <small> · {t('public.proposal.club.billedSeparately')}</small>
            </span>
            <b className="tabular-nums">{clubPrice(t, priced.membership)}</b>
          </div>
        )}
      </div>
      {priced && num(priced.totals.youSave) > 0 && (
        <div className="pp-cart-save tabular-nums">
          <span>{t('public.proposal.cartSaving')}</span>
          <b>{usd(priced.totals.youSave)}</b>
        </div>
      )}
      <div className="pp-cart-total">
        <div className="pp-cart-big tabular-nums">{priced ? usd(priced.totals.totalAmount) : '—'}</div>
        <div className="pp-cart-sub tabular-nums">
          {saving ? (
            <span className="pp-updating">{t('public.proposal.updating')}</span>
          ) : priced && num(priced.totals.youSave) > 0 ? (
            <s>{usd(priced.totals.listPrice)}</s>
          ) : null}
        </div>
      </div>
      {cta && (
        <>
          <button type="button" className="pp-btn pp-btn--1" disabled={cta.disabled} onClick={cta.on}>
            {cta.label}
          </button>
          {cta.hint && <div className="pp-cart-hint">{cta.hint}</div>}
        </>
      )}
      {validThrough && <div className="pp-fine">{t('public.proposal.validThrough', { date: validThrough })}</div>}
    </div>
  );
}

/** After approval: the signed copy, as stored. */
function Done({ approval, data }: { approval: PublicApproval | null; data: PublicQuoteResponse }) {
  const { t } = useTranslation();
  const { quote, tenant, customer } = data;
  const names = publicNames(tenant);
  const sender = tenant.displayName ?? t('public.common.theSender');
  const phone = quote.advisor?.phone ?? tenant.supportPhone;
  return (
    <div className="pp-done">
      <div className="pp-done-ic">
        <Check size={30} />
      </div>
      <h1 className="pp-h1">{t('public.proposal.done.title', { name: firstName(approval?.signerName ?? customer.name) })}</h1>
      <p className="pp-lede">{t('public.proposal.done.lede', { ...names, tenant: sender })}</p>
      {approval?.selection.joinMembership && (
        <p className="pp-lede" data-testid="pp-joined">
          {t('public.proposal.club.welcome', { tenant: sender })}
        </p>
      )}
      {approval && (
        <div className="pp-card pp-done-sum" data-testid="pp-signed-copy">
          <div className="pp-card-t">{t('public.proposal.done.signedCopy')}</div>
          <PackageLines priced={approval} proposal={quote.proposal ?? null} />
          {approval.signatureImage && <img className="pp-signature" src={approval.signatureImage} alt={t('public.proposal.done.signatureAlt', { name: approval.signerName })} />}
          <div className="pp-fine mt-1">
            {t(approval.signedVia === 'IN_PERSON' && approval.witnessName ? 'public.proposal.done.signedInPerson' : 'public.proposal.done.signedBy', {
              name: approval.signerName,
              witness: approval.witnessName,
              date: new Date(approval.signedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
            })}
          </div>
        </div>
      )}
      {phone && <div className="pp-done-foot">{t('public.proposal.done.questions', { tenant: sender, phone })}</div>}
    </div>
  );
}
