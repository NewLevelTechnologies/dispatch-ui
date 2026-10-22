import { Alert, Linking, Platform } from 'react-native';
import { mapAppsFor, webDirectionsUrl, type MapApp } from './mapApps';
import { persistMapApp, storedMapApp } from './mapsPreference';

type TFunc = (key: string) => string;

/** The map apps actually on this device, in listing order. */
export async function availableMapApps(): Promise<MapApp[]> {
  const probed = await Promise.all(
    mapAppsFor(Platform.OS).map(async (app) => {
      if (!app.probeUrl) return app;
      try {
        return (await Linking.canOpenURL(app.probeUrl)) ? app : null;
      } catch {
        // A probe that throws (an unlisted scheme, a platform quirk) means
        // "can't vouch for it" — leave it out rather than offer a dead option.
        return null;
      }
    }),
  );
  return probed.filter((app): app is MapApp => app !== null);
}

function ask(apps: MapApp[], t: TFunc): Promise<MapApp | null> {
  return new Promise((resolve) => {
    Alert.alert(
      t('mobileMaps.chooseTitle'),
      t('mobileMaps.chooseBody'),
      [
        ...apps.map((app) => ({ text: t(app.nameKey), onPress: () => resolve(app) })),
        { text: t('common.cancel'), style: 'cancel' as const, onPress: () => resolve(null) },
      ],
      { onDismiss: () => resolve(null) },
    );
  });
}

/**
 * Open driving directions to `address` in whichever map app the tech prefers.
 *
 * Asks only when there's an actual choice to make — one installed app is not a
 * decision — and remembers the answer, so this is a one-time question rather
 * than a toll gate on every job. Profile can change it later; an app that's
 * since been uninstalled falls back to asking again.
 */
export async function openDirections(address: string, t: TFunc): Promise<void> {
  const apps = await availableMapApps();

  if (apps.length === 0) {
    await Linking.openURL(webDirectionsUrl(address));
    return;
  }
  if (apps.length === 1) {
    await Linking.openURL(apps[0]!.directionsUrl(address));
    return;
  }

  const stored = await storedMapApp();
  const remembered = apps.find((app) => app.id === stored);
  if (remembered) {
    await Linking.openURL(remembered.directionsUrl(address));
    return;
  }

  const picked = await ask(apps, t);
  if (!picked) return;
  await persistMapApp(picked.id);
  await Linking.openURL(picked.directionsUrl(address));
}
