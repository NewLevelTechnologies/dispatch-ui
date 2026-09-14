// ─────────────────────────────────────────────────────────────────────
// The MapLibre renderer. DEFAULT EXPORT and nothing else imports it
// directly — `DispatchMapView` reaches it through `React.lazy`, so the
// library (roughly 5x Leaflet's bundle) lands in its own chunk. A board
// session that never opens the map never downloads it.
//
// Markers are DOM elements, not canvas draws. That is what lets every pin
// state in `Map Pin Spec.html` be ordinary HTML + CSS, and what lets the
// rail's existing pragmatic-drag-and-drop source drop onto this surface
// without a bridge into a rendering context.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef } from 'react';
// Pinned to maplibre-gl v5. The reason is mechanical, not superstition.
//
// v6 calls a protocol registered with `addProtocol` for the source's TileJSON
// but never for a single tile, so the map stays blank and silent.
//
// `addProtocol` writes into `config.REGISTERED_PROTOCOLS`, a module-level
// object in maplibre-gl-shared. The worker loads its OWN instance of that
// module, so it gets its own empty table — which is why v6 also exposes
// `self.addProtocol` and `importScriptInWorkers`. Source metadata is fetched on
// the main thread, where our registration lives, so the TileJSON resolves.
// Tiles are fetched from the worker, whose table is empty; v6's fallback there
//
//   if (isWorker(self) && self.worker?.actor)
//     actor.sendAsync({type:'GR', targetMapId: GLOBAL_DISPATCHER_ID}, ...)
//
// is meant to hand the request back to the main thread, and does not. No
// handler is found, nothing throws, and every tile silently resolves to
// nothing.
//
// Confirmed by instrumenting the protocol on both versions, against the same
// archive and a known-good canvas:
//   v5.24.0 -> "CALLED json", then "/7/34/50 -> 200094" and every other tile
//   v6.9.0  -> "CALLED json", then nothing at all
//
// The documented escape hatch is registering the protocol inside the worker
// via `importScriptInWorkers`. THIS WAS TRIED AND DOES NOT WORK — don't spend
// the afternoon on it again:
//
//   - `importScriptInWorkers` awaits `broadcast("IS", url)` across the pool,
//     so any worker that cannot load the script leaves the promise pending
//     forever. Gating map construction on it means no map is built at all,
//     with nothing thrown.
//   - MapLibre's `loadScript` fetches the URL and, for a body with top-level
//     import/export, imports it through a blob URL. A Vite `?worker&url`
//     module in dev still references `/node_modules/.vite/deps/...`, and those
//     specifiers cannot resolve from a blob's opaque origin. It would only
//     stand a chance in a production build, which is the worst split to ship.
//   - MapLibre calls the API "experimental and can break at any point".
//
// So this needs fixing upstream, not here. pmtiles 4.5.0 is the latest release
// and declares no maplibre peer range, so nothing warns at install time.
// Re-test when pmtiles next publishes.
// Named imports (v5 and v6 both export these).
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  addProtocol,
  removeProtocol,
  type GeoJSONSource,
  type LayerSpecification,
  type StyleSpecification,
} from 'maplibre-gl';
import type { Feature } from 'geojson';
import { Protocol } from 'pmtiles';
import { layers as protomapsLayers, namedTheme } from 'protomaps-themes-base';
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import type { BoardDispatch, BoardTech, UnscheduledWorkOrder } from '../../api/setup';
import {
  boundsOf,
  isLocated,
  nearestTechToPoint,
  pinClassName,
  routeLegs,
  techRouteColor,
  unassignedPinClassName,
} from '../../lib/mapPins';
import 'maplibre-gl/dist/maplibre-gl.css';

export type RoutesMode = 'none' | 'selected' | 'all';

interface Props {
  /** Either a `.pmtiles` file (self-hosted Protomaps) or a style JSON URL. */
  styleUrl: string;
  dark: boolean;
  techs: BoardTech[];
  byTech: Record<string, BoardDispatch[]>;
  unscheduled: UnscheduledWorkOrder[];
  selectedId: string | null;
  focusedTechId: string | null;
  routes: RoutesMode;
  showUnassigned: boolean;
  onOpenDispatch: (dispatch: BoardDispatch) => void;
  onFocusTech: (techId: string | null) => void;
  /** A drop resolved to a person. Opens the composer — it does NOT commit. */
  onAssign: (workOrderId: string, techId: string) => void;
  /** Changes when the SCOPE changes (region/division/search/date). Reframes. */
  scopeKey: string;
  /** Bumped by the "Fit to work" button. */
  fitSignal: number;
  attribution: string;
}

// One Protocol instance per map, NOT one per page.
//
// `Protocol` holds a SharedPromiseCache that memoizes the archive header and
// directory lookups as *promises*. `map.remove()` aborts every request the map
// has in flight, which rejects those cached promises — and a rejected promise
// stays in the cache. Any later map handed the same Protocol gets the rejected
// promise straight back, so its source never loads and nothing is thrown,
// because the rejection was already handled. The map renders blank with an
// empty console.
//
// StrictMode makes this the default path in development, not an edge case: it
// mounts, tears down and remounts every effect, so map #1 always poisons the
// cache for map #2. Pairing add/removeProtocol per map keeps each one on a
// clean cache while still leaving exactly one handler registered at a time.
let protocolRegistered = false;
function registerPmtiles() {
  if (protocolRegistered) return;
  addProtocol('pmtiles', new Protocol().tile);
  protocolRegistered = true;
}

function unregisterPmtiles() {
  if (!protocolRegistered) return;
  removeProtocol('pmtiles');
  protocolRegistered = false;
}

/**
 * Self-hosted Protomaps ships tiles, fonts and sprites as plain static files,
 * so all three are addressed relative to the `.pmtiles` object. That keeps the
 * whole basemap behind ONE config value and leaves no third-party URL baked
 * into a production build.
 */
function buildStyle(pmtilesUrl: string, dark: boolean, attribution: string): StyleSpecification {
  const base = pmtilesUrl.slice(0, pmtilesUrl.lastIndexOf('/'));
  return {
    version: 8,
    glyphs: `${base}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${base}/sprites/${dark ? 'dark' : 'light'}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${pmtilesUrl}`,
        attribution,
      },
    },
    // `lang` is required, not optional: protomaps-themes-base only appends the
    // label layers when it is passed. Without it `layers()` returns 57 layers
    // instead of 68 and the basemap renders with no place names, road shields
    // or POI text at all — silently, since a missing option is not an error.
    layers: protomapsLayers('protomaps', namedTheme(dark ? 'dark' : 'light'), {
      lang: 'en',
    }) as LayerSpecification[],
  };
}

const ROUTE_SOURCE = 'db-routes';

export default function DispatchMapCanvas({
  styleUrl,
  dark,
  techs,
  byTech,
  unscheduled,
  selectedId,
  focusedTechId,
  routes,
  showUnassigned,
  onOpenDispatch,
  onFocusTech,
  onAssign,
  scopeKey,
  fitSignal,
  attribution,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const loadedRef = useRef(false);
  // Whether this scope has been framed yet. Reset on scope change only —
  // reframing on a layer toggle would throw away the dispatcher's panning.
  const framedRef = useRef('');

  // Handlers read through a ref so the draw effect doesn't have to re-run
  // (and rebuild every marker) each time the page re-renders a new closure.
  const latest = useRef({ onOpenDispatch, onFocusTech, onAssign, byTech });
  latest.current = { onOpenDispatch, onFocusTech, onAssign, byTech };

  const style = useMemo(() => {
    if (!styleUrl.endsWith('.pmtiles')) return styleUrl;
    // NB: the protocol is registered in the map effect, not here. `useMemo`
    // runs during render and will not re-run after the effect tears down, so
    // registering here leaves a remounted map with no `pmtiles://` handler.
    return buildStyle(styleUrl, dark, attribution);
  }, [styleUrl, dark, attribution]);

  // ── Map lifetime ────────────────────────────────────────────────
  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return undefined;

    // Register BEFORE constructing the map and unregister with it, so the two
    // are symmetric across a remount. MapLibre resolves a source URL through
    // the protocol table at construction; with no handler registered it falls
    // back to plain fetch and fails with `URL scheme "pmtiles" is not
    // supported`.
    if (typeof style !== 'string') registerPmtiles();

    const map = new MapLibreMap({
      container: host,
      style,
      center: [-98.5, 39.8],
      zoom: 3,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    // MapLibre routes style, source, glyph, sprite and tile failures through
    // its event bus rather than throwing. With no listener attached, a basemap
    // that fails to load renders as a blank canvas with nothing in the console
    // — which is indistinguishable from "the tiles are fine but nothing is in
    // view", and sends you debugging the wrong layer entirely.
    map.on('error', (e) => {
      const err = (e as { error?: Error }).error;
      console.error('[dispatch-map]', err?.message ?? e, err);
    });

    if (import.meta.env.DEV) {
      (window as unknown as { __dbMap?: MapLibreMap }).__dbMap = map;
    }

    map.on('load', () => {
      loadedRef.current = true;
      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Two layers over one source, split on `done`: MapLibre cannot vary
      // `line-dasharray` per feature, so the solid/dashed distinction has to
      // be a layer split rather than a data expression.
      map.addLayer({
        id: 'db-routes-done',
        type: 'line',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'done'], true],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.addLayer({
        id: 'db-routes-planned',
        type: 'line',
        source: ROUTE_SOURCE,
        filter: ['==', ['get', 'done'], false],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'width'],
          'line-opacity': ['get', 'opacity'],
          'line-dasharray': [2, 1.6],
        },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.triggerRepaint();
    });

    // The rail collapses under the map and the window resizes; MapLibre
    // caches container size, so the canvas desyncs without this.
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(host);

    return () => {
      observer.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
      // Drop the Protocol with the map: its promise cache now holds the
      // rejections produced by map.remove() aborting in-flight range reads.
      unregisterPmtiles();
    };
    // `style` is intentionally not a dependency: the view remounts this
    // component on theme change rather than swapping the style in place,
    // which would drop the route layers added above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Rail card → map. Same drag source and same `boardDrag` gate the
  //    timeline lanes use, so a stray page drag can never land here. ──
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    return dropTargetForElements({
      element: host,
      canDrop: ({ source }) => source.data?.boardDrag === true,
      onDrop: ({ source, location }) => {
        const map = mapRef.current;
        const workOrderId = source.data?.workOrderId;
        if (!map || typeof workOrderId !== 'string') return;
        const rect = host.getBoundingClientRect();
        const point = map.unproject([
          location.current.input.clientX - rect.left,
          location.current.input.clientY - rect.top,
        ]);
        const techId = nearestTechToPoint(
          { latitude: point.lat, longitude: point.lng },
          latest.current.byTech,
        );
        // Nowhere near a route: no assignment, and deliberately no toast.
        // The dispatcher aimed at nothing, and scolding them for it would be
        // noise where the absence of a drawer is already the answer.
        if (techId) latest.current.onAssign(workOrderId, techId);
      },
    });
  }, []);

  // ── Draw ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const draw = () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const features: Feature[] = [];
      const framePoints: { latitude: number | null; longitude: number | null }[] = [];

      techs.forEach((tech) => {
        const stops = byTech[tech.id] ?? [];
        const dimmed = focusedTechId != null && focusedTechId !== tech.id;
        const color = techRouteColor(tech.name);
        const drawRoute = routes === 'all' || (routes === 'selected' && focusedTechId === tech.id);

        if (drawRoute) {
          routeLegs(stops).forEach((leg) => {
            features.push({
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [leg.from.longitude, leg.from.latitude],
                  [leg.to.longitude, leg.to.latitude],
                ],
              },
              properties: {
                done: leg.done,
                color,
                width: focusedTechId === tech.id ? 3 : 2,
                opacity: dimmed ? 0.25 : 0.8,
              },
            });
          });
        }

        stops.forEach((stop) => {
          framePoints.push(stop);
          if (!isLocated(stop)) return;
          const el = document.createElement('span');
          el.className = pinClassName({
            status: stop.status,
            released: stop.releasedAt != null,
            priority: stop.priority,
            dimmed,
            focused: focusedTechId === tech.id,
            selected: selectedId === stop.id,
          });
          el.textContent = String(stop.seq);
          el.title = [
            stop.workOrderSummary || stop.workOrderNumber || '',
            stop.customerName ?? '',
            tech.name,
            stop.releasedAt == null ? 'not released' : '',
          ]
            .filter(Boolean)
            .join(' · ');
          el.addEventListener('click', (event) => {
            event.stopPropagation();
            latest.current.onFocusTech(tech.id);
            latest.current.onOpenDispatch(stop);
          });
          markersRef.current.push(
            new Marker({ element: el })
              .setLngLat([stop.longitude, stop.latitude])
              .addTo(map),
          );
        });
      });

      if (showUnassigned) {
        unscheduled.forEach((workOrder) => {
          framePoints.push(workOrder);
          if (!isLocated(workOrder)) return;
          const el = document.createElement('span');
          el.className = unassignedPinClassName(workOrder.priority);
          el.textContent = '?';
          el.title = `${workOrder.workOrderNumber} · ${workOrder.customerName}`;
          const marker = new Marker({ element: el, draggable: true })
            .setLngLat([workOrder.longitude, workOrder.latitude])
            .addTo(map);
          marker.on('dragend', () => {
            const point = marker.getLngLat();
            const techId = nearestTechToPoint(
              { latitude: point.lat, longitude: point.lng },
              latest.current.byTech,
            );
            // Snap back rather than assign to whoever is least far away
            // across the whole metro — a drop nowhere near a route expressed
            // no intent about a person.
            marker.setLngLat([workOrder.longitude!, workOrder.latitude!]);
            if (techId) latest.current.onAssign(workOrder.workOrderId, techId);
          });
          markersRef.current.push(marker);
        });
      }

      const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
      source?.setData({ type: 'FeatureCollection', features });

      const shouldFrame = framedRef.current !== `${scopeKey}|${fitSignal}`;
      const bounds = shouldFrame ? boundsOf(framePoints) : null;
      if (bounds) {
        framedRef.current = `${scopeKey}|${fitSignal}`;
        map.resize();
        map.fitBounds(
          [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north],
          ],
          { padding: 56, maxZoom: 14, animate: false },
        );
      }
    };

    if (loadedRef.current) draw();
    else map.once('load', draw);
  }, [
    techs,
    byTech,
    unscheduled,
    routes,
    showUnassigned,
    focusedTechId,
    selectedId,
    scopeKey,
    fitSignal,
  ]);

  return <div ref={hostRef} className="db-map-canvas" data-testid="dispatch-map-canvas" />;
}
