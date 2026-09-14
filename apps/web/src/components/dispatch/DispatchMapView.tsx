// ─────────────────────────────────────────────────────────────────────
// Map view mode — the surface around the renderer.
//
// Everything here is deliberately OUTSIDE the lazy chunk: the controls, the
// legend, the honesty lines and the not-configured state all render without
// MapLibre, so the band appears instantly and a tenant with no basemap
// configured never downloads a rendering engine to be told so.
//
// The map owns no detail UI and no commit path. A pin opens the same drawer
// a timeline block opens, and a drop opens the same composer a rail card
// opens — so this stays a view over the board's objects rather than a second
// way to create dispatches.
// ─────────────────────────────────────────────────────────────────────
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@dispatch/i18n';
import { MapIcon } from '@heroicons/react/24/outline';
import type { BoardDispatch, BoardTech, UnscheduledWorkOrder } from '../../api/setup';
import { Button } from '../catalyst/button';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/LoadingState';
import { ToggleGroup, ToggleGroupOption } from '../ui/ToggleGroup';
import { useTheme } from '../ThemeProvider';
import { isLocated } from '../../lib/mapPins';
import type { RoutesMode } from './DispatchMapCanvas';

const DispatchMapCanvas = lazy(() => import('./DispatchMapCanvas'));

/** The one config point. `.pmtiles` = self-hosted Protomaps (styles are built
 *  client-side, because a single static style URL cannot be both light and
 *  dark and the dark basemap is a hard requirement). Anything else is treated
 *  as a MapLibre style JSON URL, which keeps MapTiler/Mapbox a genuine swap.
 *  Unset = say so plainly. */
function basemapUrl(): string {
  return import.meta.env.VITE_MAP_STYLE_URL || '';
}

interface Props {
  techs: BoardTech[];
  byTech: Record<string, BoardDispatch[]>;
  unscheduled: UnscheduledWorkOrder[];
  /** Total the server has, which may exceed what the rail page returned. */
  unscheduledTotal: number;
  /** Server-counted dispatches whose site never geocoded. */
  missingCoordinates: number;
  selectedId: string | null;
  onOpenDispatch: (dispatch: BoardDispatch) => void;
  onAssign: (workOrderId: string, techId: string) => void;
  /** Region/division/search/date — anything that changes WHAT is on the map. */
  scopeKey: string;
}

/**
 * The basemap needs a real light/dark answer, not the tri-state the theme
 * context stores: a light map slab inside a dark board is the exact
 * readability failure this project already fixed once.
 *
 * `system` is resolved against the media query AND subscribed to, because a
 * user on `system` who flips their OS theme at dusk otherwise keeps a light
 * basemap until something unrelated re-renders.
 */
function useDarkBasemap(): boolean {
  const { mode } = useTheme();
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  );
  useEffect(() => {
    if (mode !== 'system') return undefined;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);
  return mode === 'dark' || (mode === 'system' && systemDark);
}

function Swatch({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />;
}

export default function DispatchMapView({
  techs,
  byTech,
  unscheduled,
  unscheduledTotal,
  missingCoordinates,
  selectedId,
  onOpenDispatch,
  onAssign,
  scopeKey,
}: Props) {
  const { t } = useTranslation();
  const dark = useDarkBasemap();
  const [routes, setRoutes] = useState<RoutesMode>('selected');
  const [showUnassigned, setShowUnassigned] = useState(true);
  const [focusedTechId, setFocusedTechId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);

  // Two different absences, counted separately because they have different
  // causes and different fixes: a dispatch whose SITE never geocoded, and an
  // unscheduled job the rail's page simply didn't reach.
  const unassignedUnlocated = useMemo(
    () => unscheduled.filter((w) => !isLocated(w)).length,
    [unscheduled],
  );
  const railShortfall = Math.max(0, unscheduledTotal - unscheduled.length);

  const styleUrl = basemapUrl();

  if (!styleUrl) {
    return (
      <div className="db-map grid place-items-center">
        <EmptyState
          icon={<MapIcon />}
          title={t('dispatchBoard.map.notConfiguredTitle')}
          description={t('dispatchBoard.map.notConfiguredBody')}
        />
      </div>
    );
  }

  return (
    <>
      {/* Band 3 for the map. Same 26px chrome as every other band. */}
      <div className="db-band sub">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-fg-muted">
          {t('dispatchBoard.map.routes')}
        </span>
        <ToggleGroup
          value={routes}
          onChange={(value) => setRoutes(value as RoutesMode)}
          size="sm"
          aria-label={t('dispatchBoard.map.routes')}
        >
          <ToggleGroupOption value="none">{t('dispatchBoard.map.routesOff')}</ToggleGroupOption>
          <ToggleGroupOption value="selected">
            {t('dispatchBoard.map.routesSelected')}
          </ToggleGroupOption>
          <ToggleGroupOption value="all">{t('dispatchBoard.map.routesAll')}</ToggleGroupOption>
        </ToggleGroup>

        <Button
          outline
          size="xxs"
          aria-pressed={showUnassigned}
          onClick={() => setShowUnassigned((v) => !v)}
        >
          {`${t('dispatchBoard.map.unassigned')} ${unscheduled.length}`}
        </Button>

        {focusedTechId && (
          <Button plain size="xxs" onClick={() => setFocusedTechId(null)}>
            {t('dispatchBoard.map.clearFocus')}
          </Button>
        )}
        <Button plain size="xxs" onClick={() => setFitSignal((n) => n + 1)}>
          {t('dispatchBoard.map.fit')}
        </Button>

        <span className="ml-auto text-[10.5px] text-fg-muted">
          {t('dispatchBoard.map.noSignalNeeded')}
        </span>
      </div>

      <div className="db-map">
        <Suspense fallback={<LoadingState label={t('dispatchBoard.map.loading')} />}>
          <DispatchMapCanvas
            // Remount rather than swap the style in place: setStyle would drop
            // the route layers, and a theme change is rare enough that a
            // rebuild is cheaper than the code to survive one.
            key={dark ? 'dark' : 'light'}
            styleUrl={styleUrl}
            dark={dark}
            techs={techs}
            byTech={byTech}
            unscheduled={unscheduled}
            selectedId={selectedId}
            focusedTechId={focusedTechId}
            routes={routes}
            showUnassigned={showUnassigned}
            onOpenDispatch={onOpenDispatch}
            onFocusTech={setFocusedTechId}
            onAssign={onAssign}
            scopeKey={scopeKey}
            fitSignal={fitSignal}
            attribution={t('dispatchBoard.map.attribution')}
          />
        </Suspense>

        {/* A job you cannot see is a job that does not get scheduled — so
            these are persistent, not a toast, and they name the two absences
            separately because the fixes differ. */}
        {(missingCoordinates > 0 || unassignedUnlocated > 0 || railShortfall > 0) && (
          <div className="db-mapmissing flex flex-col gap-0.5 text-[10.5px] text-fg-strong">
            {missingCoordinates > 0 && (
              <span>
                {/* "job", not the dispatch glossary word: the count has to
                    pluralise, and pluralising a tenant-renamed noun by
                    appending an s is how you get "Visitss". */}
                {t('dispatchBoard.map.missingCoordinates', { count: missingCoordinates })}
              </span>
            )}
            {unassignedUnlocated > 0 && (
              <span>
                {t('dispatchBoard.map.unassignedUnlocated', { count: unassignedUnlocated })}
              </span>
            )}
            {railShortfall > 0 && (
              <span>
                {t('dispatchBoard.map.railCapped', {
                  shown: unscheduled.length,
                  total: unscheduledTotal,
                })}
              </span>
            )}
          </div>
        )}

        <div className="db-maplegend flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-fg-muted">
          <span className="inline-flex items-center gap-1">
            <Swatch color="var(--info-500)" />
            {t('dispatchBoard.legend.scheduled')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Swatch color="var(--violet-500)" />
            {t('dispatchBoard.legend.live')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Swatch color="var(--success-500)" />
            {t('dispatchBoard.legend.completed')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Swatch color="var(--warning-500)" />
            {t('dispatchBoard.legend.noShow')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Swatch color="var(--danger-500)" />
            {t('dispatchBoard.chips.urgent')}
          </span>
          {/* Dashed, never filled: unassigned work has no status to report,
              so a fill would invent one. */}
          <span className="inline-flex items-center gap-1">
            <span className="size-2 shrink-0 rounded-full border border-dashed border-fg-muted" />
            {t('dispatchBoard.map.unassigned')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 shrink-0 rounded-full border border-dashed border-fg-muted" />
            {t('dispatchBoard.legend.unreleased')}
          </span>
        </div>
      </div>
    </>
  );
}
