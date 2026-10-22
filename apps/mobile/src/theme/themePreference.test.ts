import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistThemePreference, storedThemePreference } from './themePreference';

beforeEach(async () => {
  jest.restoreAllMocks();
  await AsyncStorage.clear();
});

describe('themePreference', () => {
  it('is null until the tech has chosen', async () => {
    expect(await storedThemePreference()).toBeNull();
  });

  it('round-trips each of the three options', async () => {
    for (const option of ['light', 'dark', 'system'] as const) {
      await persistThemePreference(option);
      expect(await storedThemePreference()).toBe(option);
    }
  });

  it('rejects a value that is not one of the three', async () => {
    // An older build, or a hand-edited store — trusting this would index the
    // palette lookup with something that isn't a palette.
    await AsyncStorage.setItem('dispatch.themePreference', 'chartreuse');
    expect(await storedThemePreference()).toBeNull();
  });

  it('degrades to the default rather than throwing when storage is unavailable', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('blocked'));
    expect(await storedThemePreference()).toBeNull();
  });

  it('does not throw when the write fails — the theme still applies', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('blocked'));
    await expect(persistThemePreference('dark')).resolves.toBeUndefined();
  });
});
