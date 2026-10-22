import { mapAppsFor, webDirectionsUrl } from './mapApps';

const ADDRESS = '2226 Chamblee Tucker Rd, Tucker, GA 30083';
const ENCODED = '2226%20Chamblee%20Tucker%20Rd%2C%20Tucker%2C%20GA%2030083';

describe('mapAppsFor', () => {
  it('offers Apple Maps, Google Maps and Waze on iOS, Apple Maps first', () => {
    expect(mapAppsFor('ios').map((a) => a.id)).toEqual(['apple', 'google', 'waze']);
  });

  it('offers the device default and Waze on Android', () => {
    expect(mapAppsFor('android').map((a) => a.id)).toEqual(['default', 'waze']);
  });

  it('treats an unrecognised platform as iOS rather than returning nothing', () => {
    expect(mapAppsFor('windows').map((a) => a.id)).toEqual(['apple', 'google', 'waze']);
  });

  it('never probes for the platform’s own handler, and always probes third-party apps', () => {
    for (const platform of ['ios', 'android']) {
      const [first, ...rest] = mapAppsFor(platform);
      expect(first!.probeUrl).toBeNull();
      for (const app of rest) expect(app.probeUrl).toBeTruthy();
    }
  });

  it('builds each app’s own scheme URL with the address encoded', () => {
    const byId = Object.fromEntries(mapAppsFor('ios').map((a) => [a.id, a.directionsUrl(ADDRESS)]));

    expect(byId.apple).toBe(`maps://?daddr=${ENCODED}`);
    expect(byId.google).toBe(`comgooglemaps://?daddr=${ENCODED}&directionsmode=driving`);
    expect(byId.waze).toBe(`waze://?q=${ENCODED}&navigate=yes`);
  });

  it('builds a geo: intent for the Android default', () => {
    const [android] = mapAppsFor('android');
    expect(android!.directionsUrl(ADDRESS)).toBe(`geo:0,0?q=${ENCODED}`);
  });

  it('falls back to a plain web URL', () => {
    expect(webDirectionsUrl(ADDRESS)).toBe(`https://maps.apple.com/?daddr=${ENCODED}`);
  });
});
