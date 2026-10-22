import { useCallback, useEffect, useState } from 'react';
import { availableMapApps } from './openDirections';
import { persistMapApp, storedMapApp } from './mapsPreference';
import type { MapApp, MapAppId } from './mapApps';

/**
 * The Profile row's view of the directions setting: which apps this device
 * could use, and which one is currently chosen.
 *
 * `selected` is null until the tech has been asked (or has picked here), which
 * is also what the first Directions tap keys off — so a fresh install shows no
 * selection rather than pretending the first app in the list is a decision
 * someone made.
 */
export function useMapsPreference() {
  const [apps, setApps] = useState<MapApp[]>([]);
  const [selected, setSelected] = useState<MapAppId | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [installed, stored] = await Promise.all([availableMapApps(), storedMapApp()]);
      if (!active) return;
      setApps(installed);
      setSelected(stored);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const choose = useCallback((id: MapAppId) => {
    setSelected(id);
    void persistMapApp(id);
  }, []);

  return { apps, selected, choose, isLoading };
}
