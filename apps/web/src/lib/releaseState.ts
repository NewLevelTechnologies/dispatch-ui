// ─────────────────────────────────────────────────────────────────────
// Release state — whether the technician's copy matches the board.
//
// Release is the ONE point a technician is told anything. Editing released
// work (moving, re-windowing, reassigning) sends nothing: the server keeps a
// copy of what each tech was last sent, compares the dispatch with it, and the
// next release sends whatever brings the copy back in line. So "hollow" means
// "the tech's copy is out of date" — never sent, or changed since — and both
// look the same because the next step is the same.
//
// Never derive this from `releasedAt`: that is only when the job was FIRST
// handed over, and a released-then-moved block still carries it.
// ─────────────────────────────────────────────────────────────────────
import type { BoardDispatch } from '../api/setup';
import { zonedDate } from './boardTime';

/** Hollow on the grid, dashed ring on the map. */
export function isOutOfDate(dispatch: Pick<BoardDispatch, 'releaseState'>): boolean {
  return dispatch.releaseState !== 'RELEASED';
}

/** The tech has a copy of this dispatch — so editing it leaves them holding
 *  an old version until the next release. */
export function techHasCopy(dispatch: Pick<BoardDispatch, 'releaseState'>): boolean {
  return dispatch.releaseState !== 'UNRELEASED';
}

/** Sending will tell a DIFFERENT tech it's off their schedule: the copy is
 *  with the previous assignee. */
export function previousHolder(
  dispatch: Pick<BoardDispatch, 'released' | 'assignedUserId'>,
): string | null {
  const copy = dispatch.released;
  if (!copy || copy.assignedUserId === dispatch.assignedUserId) return null;
  return copy.assignedUserName;
}

/**
 * Whether an edit to released work should offer "Send update" right away.
 *
 * A released dispatch for TODAY that drifts from the tech's copy may be on
 * someone already driving — to the old slot, or to a job just moved onto
 * today. So either end counts: the window the tech was sent, or the window
 * it has now. Anything else can wait for the day's release.
 */
export function editTouchesToday(
  before: Pick<BoardDispatch, 'releaseState' | 'released' | 'arrivalWindowStart'>,
  newStart: string | null,
  timeZone: string,
): boolean {
  if (!techHasCopy(before)) return false;
  const today = zonedDate(new Date(), timeZone);
  const sent = before.released?.arrivalWindowStart ?? before.arrivalWindowStart;
  return zonedDate(sent, timeZone) === today || (newStart != null && zonedDate(newStart, timeZone) === today);
}
