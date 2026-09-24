// ─────────────────────────────────────────────────────────────────────
// Right-click menu on a timeline block.
//
// Right-click is the fast path on a board: scheduling tools have taught
// dispatchers to try it, it costs no screen space, and it reaches the work
// order and the common verbs without a drawer round-trip.
//
// "Open work order" comes first because it is the one thing the dispatch
// drawer cannot give them — a dispatch is a visit, the work order is the job.
// It is a real <a href>, so cmd-click and middle-click still open a tab.
// ─────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import type { BoardDispatch } from '../../api/setup';
import { useGlossary } from '../../contexts/GlossaryContext';
import { siteLabel } from '../../lib/siteLabel';
import { formatWindow } from '../../lib/boardTime';
import {
  canMoveTo,
  defaultPick,
  formatMoveDay,
  moveTargets,
  preservedWindow,
} from '../../lib/boardMove';
import { Button } from '../catalyst/button';
import { Input } from '../catalyst/input';

export type BlockMenu = {
  dispatch: BoardDispatch;
  x: number;
  y: number;
};

const MARGIN = 8;

export default function BlockContextMenu({
  menu,
  date,
  today,
  timeZone,
  workOrderHref,
  onClose,
  onOpenDetail,
  onRelease,
  onReassign,
  onUnschedule,
  onMove,
}: {
  menu: BlockMenu | null;
  /** The day being viewed — which is the dispatch's own day, since the board
   *  only shows one. Move targets count forward from it. */
  date: string;
  /** Today in the tenant's zone — the earliest day a visit may move to. */
  today: string;
  timeZone: string;
  workOrderHref: (workOrderId: string) => string;
  onClose: () => void;
  onOpenDetail: (dispatch: BoardDispatch) => void;
  onRelease: (dispatch: BoardDispatch) => void;
  onReassign: (dispatch: BoardDispatch) => void;
  onUnschedule: (dispatch: BoardDispatch) => void;
  onMove: (dispatch: BoardDispatch, toDate: string) => void;
}) {
  const { t } = useTranslation();
  // Never "work order" or "dispatch" in the menu: a tenant that calls them
  // jobs and trips sees jobs and trips.
  const { getName } = useGlossary();
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState<{ left: number; top: number } | null>(null);
  // "Pick a date…" expands in place rather than opening a second surface, so
  // the menu stays the one place a move happens.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState('');

  // Measured on attach, not guessed: the menu's height depends on which verbs
  // apply to this dispatch, so a fixed clamp would either clip it near the
  // bottom of the board or float it in the middle. Keyed off `menu`, so
  // re-opening on another block re-measures while an unrelated re-render — the
  // board polls every 30s — leaves the open menu exactly where it is.
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      setPicking(false);
      setPicked('');
      if (!el || !menu) {
        setOffset(null);
        return;
      }
      const { width, height } = el.getBoundingClientRect();
      setOffset({
        left: Math.max(MARGIN, Math.min(menu.x, window.innerWidth - width - MARGIN)),
        top: Math.max(MARGIN, Math.min(menu.y, window.innerHeight - height - MARGIN)),
      });
    },
    [menu],
  );

  // The board scrolls both axes underneath a fixed menu, so anything that
  // moves the block out from under the pointer closes it.
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, onClose]);

  // Opened from the keyboard as well as the mouse, so focus has to land in it.
  useEffect(() => {
    if (!menu || !offset) return;
    ref.current?.querySelector<HTMLElement>('.db-ctx-item')?.focus();
  }, [menu, offset]);

  const move = useCallback((from: HTMLElement, delta: number) => {
    const items = Array.from(
      from.closest('.db-ctx')?.querySelectorAll<HTMLElement>('.db-ctx-item') ?? [],
    );
    const next = items[(items.indexOf(from) + delta + items.length) % items.length];
    next?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      // Arrow keys step the date field's own segments.
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      e.preventDefault();
      move(e.target as HTMLElement, e.key === 'ArrowDown' ? 1 : -1);
    },
    [move],
  );

  if (!menu) return null;

  const { dispatch } = menu;
  const act = (fn: (d: BoardDispatch) => void) => () => {
    onClose();
    fn(dispatch);
  };

  // Only SCHEDULED work moves. En route and on site are happening now;
  // completed, no-show and cancelled are history — rescheduling those is a
  // NEW visit through the composer, not a move. A window that can't be placed
  // can't be preserved, so it doesn't offer a move either.
  const kept = dispatch.status === 'SCHEDULED' ? preservedWindow(dispatch, timeZone) : null;
  const targets = moveTargets(date, today);
  const pickable = canMoveTo(date, picked, today);
  const go = (toDate: string) => () => {
    onClose();
    onMove(dispatch, toDate);
  };

  return (
    <div
      ref={attach}
      className="db-ctx"
      role="menu"
      aria-label={t('dispatchBoard.menu.label', { entity: getName('dispatch') })}
      // Hidden for the first paint only — the position isn't known until the
      // menu has been measured, and a flash at the wrong corner reads as a bug.
      style={{ left: offset?.left ?? menu.x, top: offset?.top ?? menu.y, visibility: offset ? 'visible' : 'hidden' }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={onKeyDown}
    >
      <div className="db-ctx-head">
        {[dispatch.workOrderNumber, siteLabel(dispatch)].filter(Boolean).join(' · ')}
      </div>

      <a className="db-ctx-item" role="menuitem" href={workOrderHref(dispatch.workOrderId)} onClick={onClose}>
        {t('dispatchBoard.menu.openWorkOrder', { entity: getName('work_order') })}
      </a>
      <button type="button" className="db-ctx-item" role="menuitem" onClick={act(onOpenDetail)}>
        {t('dispatchBoard.menu.details', { entity: getName('dispatch') })}
      </button>

      <div className="db-ctx-sep" />

      {/* Release is offered only while it would do something — releasing an
          already-released dispatch is a no-op the dispatcher can't see. */}
      {dispatch.releasedAt == null && dispatch.status !== 'CANCELLED' && (
        <button type="button" className="db-ctx-item" role="menuitem" onClick={act(onRelease)}>
          {t('dispatchBoard.menu.release', { tech: getName('technician') })}
        </button>
      )}
      <button type="button" className="db-ctx-item" role="menuitem" onClick={act(onReassign)}>
        {t('dispatchBoard.menu.reassign')}
      </button>
      {/* Only SCHEDULED work can be unscheduled: a tech en route or on site has
          a real-world commitment, and retracting that is a cancellation — a
          different verb, with different consequences. */}
      {dispatch.status === 'SCHEDULED' && (
        <button type="button" className="db-ctx-item" role="menuitem" onClick={act(onUnschedule)}>
          {t('dispatchBoard.menu.unschedule')}
        </button>
      )}

      {kept && (
        <>
          <div className="db-ctx-sep" />
          {/* The label states the window being kept, because that
              preservation is the whole contract of a move. */}
          <div className="db-ctx-label" role="presentation">
            {t('dispatchBoard.move.heading', {
              window: formatWindow(kept.startHour, kept.endHour),
            })}
          </div>
          {/* Next business day leads: bumping Friday's work to Saturday is
              almost never the intent. Tomorrow appears only when it is a
              different day, and always names its weekday so a weekend shows. */}
          {targets.nextBusiness && (
            <button type="button" className="db-ctx-item" role="menuitem" onClick={go(targets.nextBusiness)}>
              {t('dispatchBoard.move.nextBusinessDay')}
              <span className="db-ctx-meta">{formatMoveDay(targets.nextBusiness)}</span>
            </button>
          )}
          {targets.tomorrow && (
            <button type="button" className="db-ctx-item" role="menuitem" onClick={go(targets.tomorrow)}>
              {t('dispatchBoard.move.tomorrow')}
              <span className="db-ctx-meta">{formatMoveDay(targets.tomorrow)}</span>
            </button>
          )}
          {picking ? (
            <form
              className="db-ctx-pick"
              onSubmit={(e) => {
                e.preventDefault();
                if (pickable) go(picked)();
              }}
            >
              <Input
                type="date"
                autoFocus
                min={today}
                value={picked}
                aria-label={t('dispatchBoard.move.pickDate')}
                onChange={(e) => setPicked(e.target.value)}
              />
              <Button type="submit" size="xs" color="accent" disabled={!pickable}>
                {t('dispatchBoard.move.go')}
              </Button>
            </form>
          ) : (
            <button
              type="button"
              className="db-ctx-item"
              role="menuitem"
              onClick={() => {
                setPicked(defaultPick(date, today));
                setPicking(true);
              }}
            >
              {t('dispatchBoard.move.pickDate')}
            </button>
          )}
          {/* "Not sure when" is an unschedule, not a move — picking a date
              nobody has decided on is worse than no date at all. */}
          <div className="db-ctx-hint">{t('dispatchBoard.move.hint')}</div>
        </>
      )}
    </div>
  );
}
