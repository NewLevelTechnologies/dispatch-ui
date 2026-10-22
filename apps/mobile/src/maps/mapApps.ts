/**
 * Which app opens a "Directions" tap.
 *
 * A web maps URL (what both Directions buttons used to build) is not a neutral
 * choice: `https://www.google.com/maps/...` either lands in Safari or deep-links
 * into Google Maps, so a tech who lives in Apple Maps gets taken somewhere else
 * every time. Each entry below is the app's own URL scheme instead, so the
 * chosen app opens directly.
 */
export type MapAppId = 'apple' | 'google' | 'waze' | 'default';

export interface MapApp {
  id: MapAppId;
  /** i18n key — brand names don't translate, but they live with the copy so there's one mechanism, not two. */
  nameKey: string;
  /**
   * URL used to ask whether the app is installed. Null for the platform's own
   * handler, which is always there: iOS ships Maps, and Android resolves `geo:`
   * through whichever maps app the device has set. Probing a third-party scheme
   * on iOS also requires it to be listed in `LSApplicationQueriesSchemes`
   * (app.json) — an unlisted scheme reports "not installed" however many times
   * it's actually installed.
   */
  probeUrl: string | null;
  directionsUrl: (address: string) => string;
}

const IOS: MapApp[] = [
  {
    id: 'apple',
    nameKey: 'mobileMaps.apps.apple',
    probeUrl: null,
    directionsUrl: (address) => `maps://?daddr=${encodeURIComponent(address)}`,
  },
  {
    id: 'google',
    nameKey: 'mobileMaps.apps.google',
    probeUrl: 'comgooglemaps://',
    directionsUrl: (address) => `comgooglemaps://?daddr=${encodeURIComponent(address)}&directionsmode=driving`,
  },
  {
    id: 'waze',
    nameKey: 'mobileMaps.apps.waze',
    probeUrl: 'waze://',
    directionsUrl: (address) => `waze://?q=${encodeURIComponent(address)}&navigate=yes`,
  },
];

// Written from documented scheme conventions rather than device testing — this
// app has only ever been run on iOS. Worth re-checking when Android ships.
const ANDROID: MapApp[] = [
  {
    id: 'default',
    nameKey: 'mobileMaps.apps.default',
    probeUrl: null,
    directionsUrl: (address) => `geo:0,0?q=${encodeURIComponent(address)}`,
  },
  {
    id: 'waze',
    nameKey: 'mobileMaps.apps.waze',
    probeUrl: 'waze://',
    directionsUrl: (address) => `waze://?q=${encodeURIComponent(address)}&navigate=yes`,
  },
];

/** Every app worth offering on this platform, in the order they should be listed. */
export function mapAppsFor(platform: string): MapApp[] {
  return platform === 'android' ? ANDROID : IOS;
}

/** The universal fallback: opens in a browser when no native handler answered at all. */
export function webDirectionsUrl(address: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(address)}`;
}
