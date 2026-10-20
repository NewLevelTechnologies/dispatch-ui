import type { PurchaseOrderListItem, WorkItemDocument, WorkItemResponse } from '../api/setup';

/** The PO fields the strip reads — a list row is enough. */
type ItemPurchaseOrder = Pick<PurchaseOrderListItem, 'poNumber' | 'status' | 'eta'>;

// The Work Items tab step strip — DERIVED from data on every render, never
// stored. Reported → Diagnosed → (Approved) → (Parts ready) → Done.
//
// Approved appears when the item is on a quote (lines tied to it): done once
// an accepted quote sold its lines, amber when declined or expired, otherwise
// not yet. Items never quoted (time-and-materials, agreement visits) skip it —
// the work order doesn't yet say it came from an agreement, so "Covered by
// agreement" can't be told apart from "not quoted yet".
//
// Parts ready appears only when a part for the item had to be ordered — a PO
// raised for it, open now or received since. Amber while outstanding, green
// once received; it stays so the record shows the job waited on parts. Truck
// stock or no parts at all never add the step.

export type StepKey = 'reported' | 'diagnosed' | 'approved' | 'partsReady' | 'done';
export type StepState = 'done' | 'current' | 'blocked' | 'todo' | 'skip';

/** What the one-line sub-label says. The component turns it into copy. */
export type StepNote =
  | { kind: 'date'; iso: string }
  | { kind: 'po'; poNumber: string; eta: string | null; more: number }
  | { kind: 'received' }
  | { kind: 'quote'; number: string; status: string }
  | { kind: 'declined'; number: string }
  | { kind: 'expired'; number: string }
  | { kind: 'complete' }
  | { kind: 'cancelled' };

export interface WorkItemStep {
  key: StepKey;
  state: StepState;
  note?: StepNote;
}

// A PO still owes parts while it's drafted, ordered or partly received.
const OPEN_PO = new Set(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED']);
const RECEIVED_PO = new Set(['RECEIVED', 'BILLED']);

export const isFinished = (wi: Pick<WorkItemResponse, 'statusCategory'>) =>
  wi.statusCategory === 'COMPLETED' || wi.statusCategory === 'CANCELLED';

/** POs still waiting on parts for this item (header-level workItemId link). */
export function openPurchaseOrders<T extends ItemPurchaseOrder>(pos: T[]): T[] {
  return pos.filter((po) => OPEN_PO.has(po.status));
}

/** The item's Approved step from its quote rows, or null when it isn't quoted. */
function approvedStep(docs: WorkItemDocument[]): WorkItemStep | null {
  const quotes = docs.filter((d) => d.documentType === 'QUOTE');
  if (quotes.length === 0) return null;
  const sold = quotes.find((q) => q.status === 'ACCEPTED' && !q.declined);
  if (sold) return { key: 'approved', state: 'done', note: { kind: 'quote', number: sold.number, status: sold.status } };
  const unsold = quotes.find((q) => (q.status === 'ACCEPTED' && q.declined) || q.status === 'DECLINED');
  if (unsold) return { key: 'approved', state: 'blocked', note: { kind: 'declined', number: unsold.number } };
  // Newest first: the live quote is the first that isn't expired.
  const open = quotes.find((q) => q.status === 'DRAFT' || q.status === 'SENT');
  if (open) return { key: 'approved', state: 'todo', note: { kind: 'quote', number: open.number, status: open.status } };
  return { key: 'approved', state: 'blocked', note: { kind: 'expired', number: quotes[0].number } };
}

export function deriveWorkItemSteps(
  wi: WorkItemResponse,
  itemPurchaseOrders: ItemPurchaseOrder[],
  itemDocuments: WorkItemDocument[] = [],
): WorkItemStep[] {
  const diagnosed = !!wi.diagnosis?.trim();
  const open = openPurchaseOrders(itemPurchaseOrders);
  const received = itemPurchaseOrders.filter((po) => RECEIVED_PO.has(po.status));

  const reported: WorkItemStep = { key: 'reported', state: 'done', note: { kind: 'date', iso: wi.createdAt } };
  const diagnosis: WorkItemStep = { key: 'diagnosed', state: diagnosed ? 'done' : 'todo' };

  let parts: WorkItemStep | null = null;
  if (open.length > 0) {
    parts = {
      key: 'partsReady',
      state: 'blocked',
      note: { kind: 'po', poNumber: open[0].poNumber, eta: open[0].eta ?? null, more: open.length - 1 },
    };
  } else if (received.length > 0) {
    parts = { key: 'partsReady', state: 'done', note: { kind: 'received' } };
  }

  let done: WorkItemStep;
  if (wi.statusCategory === 'COMPLETED') done = { key: 'done', state: 'done', note: { kind: 'complete' } };
  else if (wi.statusCategory === 'CANCELLED') done = { key: 'done', state: 'skip', note: { kind: 'cancelled' } };
  else done = { key: 'done', state: 'todo' };

  const approved = approvedStep(itemDocuments);
  const steps = [reported, diagnosis, approved, parts, done].filter((x): x is WorkItemStep => x !== null);

  // The first not-started step is where the item is now — unless something
  // earlier is blocked, in which case the block IS where it is.
  if (!isFinished(wi)) {
    for (const step of steps) {
      if (step.state === 'blocked') break;
      if (step.state === 'todo') {
        step.state = 'current';
        break;
      }
    }
  }
  return steps;
}

export type PrimaryAction = 'none' | 'partsArrived' | 'schedule' | 'findings' | 'complete';

/**
 * The detail header's single state-driven button. Each branch only fires when
 * the move it makes is actually possible (`can*` — the workflow allows the
 * target status / scheduling is open); otherwise it falls through.
 */
export function primaryAction(input: {
  finished: boolean;
  awaitingParts: boolean;
  hasDispatches: boolean;
  hasFindings: boolean;
  canPartsArrived: boolean;
  canSchedule: boolean;
  canComplete: boolean;
}): PrimaryAction {
  if (input.finished) return 'none';
  if (input.awaitingParts) return input.canPartsArrived ? 'partsArrived' : 'none';
  if (!input.hasDispatches && input.canSchedule) return 'schedule';
  if (!input.hasFindings) return 'findings';
  return input.canComplete ? 'complete' : 'none';
}
