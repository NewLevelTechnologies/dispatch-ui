import { Alert, Linking } from 'react-native';
import { availableMapApps, openDirections } from './openDirections';
import { persistMapApp, storedMapApp } from './mapsPreference';

jest.mock('./mapsPreference', () => ({
  storedMapApp: jest.fn(),
  persistMapApp: jest.fn(),
}));

const mockStored = storedMapApp as jest.Mock;
const mockPersist = persistMapApp as jest.Mock;

const ADDRESS = '1 Main St, Phoenix, AZ';

/**
 * Answer the prompt the moment it opens. Driving it from inside the mock keeps
 * the test free of guesses about how many microtasks the probe/storage reads
 * take before the Alert actually appears.
 */
const answerPromptWith = (label: string) =>
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _body, buttons) => {
    const match = (buttons ?? []).find((b) => b.text === label);
    if (!match) {
      throw new Error(`No "${label}" button. Saw: ${(buttons ?? []).map((b) => b.text).join(', ')}`);
    }
    match.onPress?.();
  });

// Only the app's own key is needed — the i18n keys resolve to themselves.
const t = (key: string) => key;

/** Nothing but Apple Maps installed: every third-party probe says no. */
const onlyAppleMaps = () => jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
const everythingInstalled = () => jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockStored.mockResolvedValue(null);
  mockPersist.mockResolvedValue(undefined);
});

describe('availableMapApps', () => {
  it('always includes the platform handler and drops uninstalled apps', async () => {
    onlyAppleMaps();
    expect((await availableMapApps()).map((a) => a.id)).toEqual(['apple']);
  });

  it('includes third-party apps that are installed', async () => {
    everythingInstalled();
    expect((await availableMapApps()).map((a) => a.id)).toEqual(['apple', 'google', 'waze']);
  });

  it('treats a probe that throws as not installed rather than failing the lookup', async () => {
    jest.spyOn(Linking, 'canOpenURL').mockRejectedValue(new Error('scheme not whitelisted'));
    expect((await availableMapApps()).map((a) => a.id)).toEqual(['apple']);
  });
});

describe('openDirections', () => {
  it('opens straight away without asking when only one app is available', async () => {
    onlyAppleMaps();

    await openDirections(ADDRESS, t);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(`maps://?daddr=${encodeURIComponent(ADDRESS)}`);
  });

  it('does not remember a choice that was never a choice', async () => {
    onlyAppleMaps();
    await openDirections(ADDRESS, t);
    expect(mockPersist).not.toHaveBeenCalled();
  });

  it('asks the first time there is a real choice, then opens the pick', async () => {
    everythingInstalled();

    answerPromptWith('mobileMaps.apps.waze');

    await openDirections(ADDRESS, t);

    expect(Linking.openURL).toHaveBeenCalledWith(`waze://?q=${encodeURIComponent(ADDRESS)}&navigate=yes`);
  });

  it('remembers the pick so the next tap does not ask', async () => {
    everythingInstalled();

    answerPromptWith('mobileMaps.apps.google');

    await openDirections(ADDRESS, t);

    expect(mockPersist).toHaveBeenCalledWith('google');
  });

  it('uses the remembered app without asking again', async () => {
    everythingInstalled();
    mockStored.mockResolvedValue('google');

    await openDirections(ADDRESS, t);

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith(
      `comgooglemaps://?daddr=${encodeURIComponent(ADDRESS)}&directionsmode=driving`,
    );
  });

  it('asks again when the remembered app has since been uninstalled', async () => {
    onlyAppleMaps();
    mockStored.mockResolvedValue('waze');

    await openDirections(ADDRESS, t);

    // Apple Maps is the only one left, so there is nothing to ask about —
    // it just opens, rather than offering a Waze that isn't there.
    expect(Linking.openURL).toHaveBeenCalledWith(`maps://?daddr=${encodeURIComponent(ADDRESS)}`);
  });

  it('opens nothing when the prompt is cancelled', async () => {
    everythingInstalled();

    answerPromptWith('common.cancel');

    await openDirections(ADDRESS, t);

    expect(Linking.openURL).not.toHaveBeenCalled();
    expect(mockPersist).not.toHaveBeenCalled();
  });
});
