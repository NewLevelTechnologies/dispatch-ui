import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getUserPreferences,
  updateUserPreferences,
  type UserPreferencesResponse,
  type WorkOrderOverviewLayout,
} from '../api/setup';

const PREFS_KEY = ['user-preferences'] as const;
const LOCAL_KEY = 'wo.overviewLayout';
const DEFAULT_LAYOUT: WorkOrderOverviewLayout = 'compact';

const isLayout = (v: unknown): v is WorkOrderOverviewLayout => v === 'compact' || v === 'detailed';

// Browser copy of the choice. Paints the right layout before the preferences
// read lands, and holds the choice until the server stores it.
function readLocal(): WorkOrderOverviewLayout | null {
  try {
    const v = window.localStorage.getItem(LOCAL_KEY);
    return isLayout(v) ? v : null;
  } catch {
    return null;
  }
}

function writeLocal(layout: WorkOrderOverviewLayout) {
  try {
    window.localStorage.setItem(LOCAL_KEY, layout);
  } catch {
    // Storage blocked (private mode, quota) — the server copy still saves.
  }
}

/**
 * The work order Overview layout the current user picked — Compact (job-first)
 * or Detailed (attention-first). Per user, default Compact. The switch is
 * optimistic: the new layout shows at once and saves in the background.
 */
export function useOverviewLayout(): [WorkOrderOverviewLayout, (next: WorkOrderOverviewLayout) => void] {
  const queryClient = useQueryClient();
  const [local, setLocal] = useState(readLocal);

  const { data: prefs } = useQuery({
    queryKey: PREFS_KEY,
    queryFn: getUserPreferences,
    staleTime: 5 * 60 * 1000,
  });
  const stored = prefs?.additionalPreferences?.workOrderOverviewLayout;

  const save = useMutation({
    mutationFn: (layout: WorkOrderOverviewLayout) => updateUserPreferences({ workOrderOverviewLayout: layout }),
    onSuccess: (next) => queryClient.setQueryData(PREFS_KEY, next),
  });

  const setLayout = useCallback(
    (next: WorkOrderOverviewLayout) => {
      setLocal(next);
      writeLocal(next);
      queryClient.setQueryData<UserPreferencesResponse | undefined>(PREFS_KEY, (prev) =>
        prev ? { ...prev, additionalPreferences: { ...prev.additionalPreferences, workOrderOverviewLayout: next } } : prev,
      );
      save.mutate(next);
    },
    [queryClient, save],
  );

  return [isLayout(stored) ? stored : (local ?? DEFAULT_LAYOUT), setLayout];
}
