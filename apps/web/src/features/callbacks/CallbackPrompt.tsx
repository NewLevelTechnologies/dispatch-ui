// "Is this a callback of an earlier job?" Lives in New work order → Job
// details, and the work order's Callback card reuses it for Change.
//
// • The LINK is what counts. Type is independent: a Warranty or Service Call
//   job can be a callback, and a job typed Callback can stay unlinked.
// • Suggestions are completed jobs at this location, or on the same
//   equipment, in the last 30 days (equipment matches first).
// • Search has no date window — callbacks happen on day 35, and equipment
//   moves — but stays within the customer, the only links the backend allows.
// • Picking the seeded Callback type (by its fixed systemKey) opens the
//   prompt. A hint, never a rule; the prompt never blocks saving.
// • The linked state names who gets charged before anything is saved.
import { useDeferredValue, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckIcon, LinkIcon, MagnifyingGlassIcon, UsersIcon } from '@heroicons/react/16/solid';
import { workOrderApi, type CallbackCandidate, type WorkOrderSummary } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { useTenantTimeZone } from '../../hooks/useTenantTimeZone';
import { zonedDate } from '../../lib/boardTime';
import { showError, extractApiError } from '../../lib/toast';
import { Button } from '../../components/catalyst/button';
import { Input, InputGroup } from '../../components/catalyst/input';
import { Pill } from '../../components/ui/Pill';
import {
  daysBetween,
  fromCandidate,
  joinNames,
  shortDate,
  type CallbackValue,
  type LinkedJob,
  useCallbackT,
} from './callbackModel';

const SEARCH_MIN = 2;
const SEARCH_SIZE = 8;

type Mode = 'collapsed' | 'open' | 'search';

export function CallbackPrompt({
  serviceLocationId,
  customerId,
  equipmentIds,
  isCallbackType,
  excludeWorkOrderId,
  createdBefore,
  value,
  onChange,
  initialMode,
  hideLabel = false,
}: {
  serviceLocationId: string;
  /** Links stay within the customer, so search is scoped to it. */
  customerId: string;
  equipmentIds: string[];
  /** The seeded Callback type is picked — opens the prompt. */
  isCallbackType: boolean;
  /** Editing: the work order itself, so it never suggests itself. */
  excludeWorkOrderId?: string;
  /** Editing: the original must have been created before this work order. */
  createdBefore?: string;
  value: CallbackValue;
  onChange: (value: CallbackValue) => void;
  initialMode?: Mode;
  /** The work order's Callback card has its own title. */
  hideLabel?: boolean;
}) {
  const tc = useCallbackT();
  const today = zonedDate(new Date(), useTenantTimeZone()) ?? new Date().toISOString().slice(0, 10);
  const candidates = useQuery({
    queryKey: ['callback-candidates', serviceLocationId, [...equipmentIds].sort(), excludeWorkOrderId ?? null],
    queryFn: () => workOrderApi.getCallbackCandidates({ serviceLocationId, equipmentIds, excludeWorkOrderId }),
  });
  const cands = candidates.data ?? [];

  // Null = follow the type hint; a click pins an explicit mode.
  const [chosen, setChosen] = useState<Mode | null>(initialMode ?? null);
  const auto: Mode = isCallbackType && value.state === 'unset' ? (cands.length ? 'open' : 'search') : 'collapsed';
  // "Open" with nothing suggested would be an empty list — go to the search.
  const mode = chosen === 'open' && !cands.length && !candidates.isLoading ? 'search' : chosen ?? auto;

  const link = (job: LinkedJob) => {
    onChange({ state: 'linked', job });
    setChosen('collapsed');
  };
  const dismiss = () => {
    onChange({ state: 'dismissed' });
    setChosen('collapsed');
  };
  const reopen = () => {
    onChange({ state: 'unset' });
    setChosen(cands.length ? 'open' : 'search');
  };

  if (candidates.isLoading) return null;

  let body: React.ReactNode = null;
  if (value.state === 'linked') {
    body = <LinkedRow job={value.job} onChange={reopen} onUnlink={() => onChange({ state: 'unset' })} />;
  } else if (value.state === 'dismissed') {
    body = (
      <div className="cb-quiet">
        <CheckIcon className="size-3.5" />
        <span>{tc('callbacks.notACallback')}</span>
        <button type="button" className="card-action" onClick={reopen}>
          {tc('callbacks.change')}
        </button>
      </div>
    );
  } else if (mode === 'search') {
    body = (
      <SearchPanel
        customerId={customerId}
        excludeIds={new Set([...cands.map((c) => c.id), ...(excludeWorkOrderId ? [excludeWorkOrderId] : [])])}
        createdBefore={createdBefore}
        emptyHere={cands.length === 0}
        today={today}
        onLink={link}
        onBack={cands.length ? () => setChosen('open') : undefined}
        onDismiss={dismiss}
      />
    );
  } else if (mode === 'open') {
    body = (
      <div className="cb-panel">
        <div className="cb-panel-head">
          <div className="cb-title">{tc('callbacks.question')}</div>
          <div className="cb-sub">{tc('callbacks.consequence')}</div>
        </div>
        {cands.map((c) => (
          <CandidateRow key={c.id} c={c} today={today} onLink={() => link(fromCandidate(c))} />
        ))}
        <div className="cb-foot">
          <Button outline size="xs" onClick={dismiss}>
            {tc('callbacks.newWork')}
          </Button>
          <span className="grow" />
          <button type="button" className="card-action" onClick={() => setChosen('search')}>
            {tc('callbacks.linkOther')}
          </button>
        </div>
      </div>
    );
  } else if (cands.length) {
    const onEquipment = cands.filter((c) => c.matchedOn.equipment).length;
    body = (
      <div className="cb-bar">
        <span className="cb-bar-ico">
          <LinkIcon className="size-3.5" />
        </span>
        <span className="grow text-[12.5px] text-fg">
          {tc('callbacks.recent', { count: cands.length })}
          {onEquipment > 0 && (
            <>
              , <strong className="text-fg-strong">{tc('callbacks.recentOnEquipment', { count: onEquipment })}</strong>
            </>
          )}
          . {tc('callbacks.isThisOne')}
        </span>
        <Button outline size="xs" onClick={() => setChosen('open')}>
          {tc('callbacks.review')}
        </Button>
      </div>
    );
  } else if (isCallbackType) {
    body = (
      <div className="cb-bar">
        <span className="cb-bar-ico">
          <LinkIcon className="size-3.5" />
        </span>
        <span className="grow text-[12.5px] text-fg">{tc('callbacks.notLinkedYet')}</span>
        <Button outline size="xs" onClick={() => setChosen('search')}>
          {tc('callbacks.linkWorkOrder')}
        </Button>
      </div>
    );
  } else {
    // Nothing suggested and not the Callback type: one muted line, so a CSR
    // who knows it's a late callback (day 35, typed Warranty) can still link
    // it here instead of having to remember the work order page.
    body = (
      <div className="cb-quiet" data-testid="callback-quiet-entry">
        <span>{tc('callbacks.quietQuestion')}</span>
        {/* An inline text link, not a padded button, so it sits on the
            sentence's baseline. */}
        <button type="button" className="card-action" onClick={() => setChosen('search')}>
          {tc('callbacks.linkIt')}
        </button>
      </div>
    );
  }
  if (!body) return null;
  return (
    <div className={hideLabel ? undefined : 'cb-block'} data-testid="callback-prompt">
      {!hideLabel && <span className="cb-label">{tc('callbacks.label')}</span>}
      {body}
    </div>
  );
}

function WoLink({ id, number }: { id: string; number: string }) {
  // A new tab: on the intake page, following it would lose the half-typed form.
  return (
    <a className="cb-wo" href={`/work-orders/${id}`} target="_blank" rel="noreferrer">
      {number}
    </a>
  );
}

function CandidateRow({ c, today, onLink }: { c: CallbackCandidate; today: string; onLink: () => void }) {
  const tc = useCallbackT();
  const techs = c.technicians.map((x) => x.name ?? tc('callbacks.formerUser'));
  return (
    <div className="cb-row" data-testid="callback-candidate">
      <div className="min-w-0">
        <div className="cb-row-top">
          <WoLink id={c.id} number={c.workOrderNumber} />
          {c.summary && <span className="cb-row-title">{c.summary}</span>}
          {c.matchedOn.equipment ? (
            <Pill tone="accent">{tc('callbacks.sameEquipment')}</Pill>
          ) : (
            <Pill tone="neutral">{tc('callbacks.sameLocation')}</Pill>
          )}
          {c.isAgreementVisit && <Pill tone="violet">{tc('callbacks.agreementVisit')}</Pill>}
        </div>
        <div className="cb-meta">
          {[
            c.completedDate && tc('callbacks.completed', { date: shortDate(c.completedDate) }),
            c.completedDate && tc('callbacks.daysAgo', { count: daysBetween(c.completedDate, today) }),
            techs.length > 0 && joinNames(techs, tc('callbacks.and')),
            ...c.equipment.map((e) => e.name),
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <Button outline size="xs" onClick={onLink}>
        {tc('callbacks.link')}
      </Button>
    </div>
  );
}

function SearchPanel({
  customerId,
  excludeIds,
  createdBefore,
  emptyHere,
  today,
  onLink,
  onBack,
  onDismiss,
}: {
  customerId: string;
  excludeIds: Set<string>;
  createdBefore?: string;
  emptyHere: boolean;
  today: string;
  onLink: (job: LinkedJob) => void;
  onBack?: () => void;
  onDismiss: () => void;
}) {
  const tc = useCallbackT();
  const { getName } = useGlossary();
  const [q, setQ] = useState('');
  const query = useDeferredValue(q.trim());
  const search = useQuery({
    queryKey: ['work-orders', 'callback-search', customerId, query],
    queryFn: () =>
      workOrderApi.getAll({
        customerId,
        q: query,
        progressCategory: 'COMPLETED',
        size: SEARCH_SIZE,
        sort: 'createdAt,desc',
      }),
    enabled: query.length >= SEARCH_MIN,
  });
  const results = (search.data?.content ?? []).filter(
    (w) =>
      !!w.workOrderNumber &&
      !excludeIds.has(w.id) &&
      // The backend rejects an original created after the callback.
      (!createdBefore || w.createdAt < createdBefore),
  );

  // A searched-for job wasn't suggested, so ask who it would charge before
  // showing the linked state.
  const charge = useMutation({
    mutationFn: (w: WorkOrderSummary) => workOrderApi.getCallbackCharge(w.id),
    onSuccess: (r, w) =>
      onLink({
        id: w.id,
        workOrderNumber: w.workOrderNumber ?? '',
        summary: w.summary ?? null,
        completedDate: w.completedDate ?? null,
        locationName: w.serviceLocation?.locationName ?? null,
        chargedTechnicians: r.chargedTechnicians,
      }),
    onError: (err) => showError(tc('callbacks.linkFailed'), extractApiError(err) ?? undefined),
  });

  return (
    <div className="cb-panel">
      <div className="cb-panel-head">
        <div className="cb-title">{tc('callbacks.searchTitle')}</div>
        <div className="cb-sub">
          {emptyHere && `${tc('callbacks.nothingRecent')} `}
          {tc('callbacks.searchAnyDate')}
        </div>
      </div>
      <div className="cb-search">
        <InputGroup>
          <MagnifyingGlassIcon data-slot="icon" />
          <Input
            size="xs"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tc('callbacks.searchPlaceholder', { entity: getName('work_order') })}
            aria-label={tc('callbacks.searchTitle')}
          />
        </InputGroup>
      </div>
      {query.length >= SEARCH_MIN && !search.isLoading && results.length === 0 && (
        <div className="cb-empty">{tc('callbacks.noMatches', { q: query })}</div>
      )}
      {results.length > 0 && (
        <div className="border-t border-border-soft">
          {results.map((w) => (
            <div key={w.id} className="cb-row" data-testid="callback-search-result">
              <div className="min-w-0">
                <div className="cb-row-top">
                  <WoLink id={w.id} number={w.workOrderNumber ?? ''} />
                  {w.summary && <span className="cb-row-title">{w.summary}</span>}
                </div>
                <div className="cb-meta">
                  {[
                    w.completedDate && tc('callbacks.completed', { date: shortDate(w.completedDate) }),
                    w.completedDate && tc('callbacks.daysAgo', { count: daysBetween(w.completedDate, today) }),
                    w.serviceLocation?.locationName,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <Button
                outline
                size="xs"
                disabled={charge.isPending}
                onClick={() => charge.mutate(w)}
              >
                {tc('callbacks.link')}
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="cb-foot">
        {onBack && (
          <Button plain size="xxs" onClick={onBack}>
            {tc('callbacks.backToSuggestions')}
          </Button>
        )}
        <span className="grow" />
        <Button plain size="xxs" onClick={onDismiss}>
          {tc('callbacks.notACallbackAction')}
        </Button>
      </div>
    </div>
  );
}

function LinkedRow({ job, onChange, onUnlink }: { job: LinkedJob; onChange: () => void; onUnlink: () => void }) {
  const tc = useCallbackT();
  const techs = job.chargedTechnicians.map((x) => x.name ?? tc('callbacks.formerUser'));
  return (
    <div className="cb-linked" data-testid="callback-linked">
      <span className="cb-bar-ico">
        <LinkIcon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="cb-row-top">
          <span className="text-[12.5px] font-semibold text-fg-strong">{tc('callbacks.callbackOf')}</span>
          <WoLink id={job.id} number={job.workOrderNumber} />
          {job.summary && <span className="cb-row-title font-medium">{job.summary}</span>}
        </div>
        <div className="cb-meta">
          {[
            job.completedDate && tc('callbacks.completed', { date: shortDate(job.completedDate) }),
            job.locationName,
            ...(job.equipmentNames ?? []),
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <ChargeLine techs={techs} />
      </div>
      <div className="cb-btn-row">
        <Button plain size="xxs" onClick={onChange}>
          {tc('callbacks.change')}
        </Button>
        <Button plain size="xxs" onClick={onUnlink}>
          {tc('callbacks.unlink')}
        </Button>
      </div>
    </div>
  );
}

/** Says who the link charges — before save on the prompt, after on the card. */
export function ChargeLine({ techs, short = false }: { techs: string[]; short?: boolean }) {
  const tc = useCallbackT();
  const { getName } = useGlossary();
  return (
    <div className="cb-charge">
      <UsersIcon className="size-3" />
      {techs.length === 0 ? (
        <span>{tc('callbacks.chargesNobody')}</span>
      ) : (
        <span>
          {tc(short ? 'callbacks.countsForShort' : 'callbacks.countsFor')}{' '}
          <strong className="text-fg-strong">{joinNames(techs, tc('callbacks.and'))}</strong>
          {!short && ` ${tc('callbacks.onTechProductivity', { tech: getName('technician') })}`}
        </span>
      )}
    </div>
  );
}
