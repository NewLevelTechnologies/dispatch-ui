// Verb-first phrasing for the dashboard's Activity card: "Marcus Bell
// completed WO-3901". The activity tabs say "Work order completed" with the
// person in their own column; here the person IS the start of the sentence.
//
// The params come from the same builders the tabs use — resolveEventSummary
// for the work-order stream, builtText for the financial one — run with a `t`
// that swaps each `workOrders.activity.kind.*` template for its
// `dashboard.activity.verb.*` twin. So the verb copy can never drift from the
// data the tabs read, and a kind with no verb template simply isn't phrased
// this way: the card falls back to "Name · Work order completed · WO-3901".
import type { ActivityEvent } from '../../api/setup';
import { resolveEventSummary } from '../../components/activityFormatters';
import { builtText } from '../../lib/workOrderActivityRows';

type TFunc = (key: string, params?: Record<string, unknown>) => string;
type GetName = (entityCode: string, plural?: boolean) => string;

const KIND_PREFIX = 'workOrders.activity.kind.';
const VERB_PREFIX = 'dashboard.activity.verb.';
// Where the linked object goes; split on it to render the link inline.
const OBJ = '\u0000';

// Trip milestones are phrased as the tech's own act ("arrived at WO-3901").
// Recorded by someone else (a dispatcher marking it), that sentence would
// credit the wrong person, so those keep the event form.
const SELF_KINDS = new Set(['DISPATCH_EN_ROUTE', 'DISPATCH_ARRIVED', 'DISPATCH_DEPARTED', 'DISPATCH_CHECKED_OUT']);

export interface VerbSentence {
  /** Text between the actor's name and the object. */
  before: string;
  /** Text after the object. */
  after: string;
}

export function verbSentence(
  event: ActivityEvent,
  stream: 'work' | 'financial',
  actor: string,
  t: TFunc,
  getName: GetName,
): VerbSentence | null {
  if (SELF_KINDS.has(event.kind) && event.data.assignedUserName !== actor) return null;

  let missing = false;
  const verbT: TFunc = (key, params) => {
    if (!key.startsWith(KIND_PREFIX)) return t(key, params);
    const verbKey = VERB_PREFIX + key.slice(KIND_PREFIX.length);
    const out = t(verbKey, { ...params, obj: OBJ });
    // i18next hands the key back when there's no such template.
    if (out === verbKey) missing = true;
    return out;
  };

  const text = stream === 'financial' ? builtText(event, verbT) : resolveEventSummary(event, verbT, getName);
  if (missing || !text || !text.includes(OBJ)) return null;
  const [before, after] = text.split(OBJ);
  return { before, after };
}
