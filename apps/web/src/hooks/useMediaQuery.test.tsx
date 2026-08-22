import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
  let listeners: Map<string, Set<(e: MediaQueryListEvent) => void>>;
  let matchesByQuery: Map<string, boolean>;

  beforeEach(() => {
    listeners = new Map();
    matchesByQuery = new Map();
    vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
      const set = listeners.get(query) ?? new Set();
      listeners.set(query, set);
      const matches = matchesByQuery.get(query) ?? false;
      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: (_: 'change', cb: (e: MediaQueryListEvent) => void) => {
          set.add(cb);
        },
        removeEventListener: (_: 'change', cb: (e: MediaQueryListEvent) => void) => {
          set.delete(cb);
        },
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      } as unknown as MediaQueryList;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the current match state', () => {
    matchesByQuery.set('(min-width: 768px)', true);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(true);
  });

  it('re-renders when the media query changes', () => {
    matchesByQuery.set('(min-width: 768px)', false);
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'));
    expect(result.current).toBe(false);

    // Simulate the matchMedia listener firing — the snapshot getter now
    // returns the new matches value, and useSyncExternalStore re-renders.
    act(() => {
      matchesByQuery.set('(min-width: 768px)', true);
      listeners.get('(min-width: 768px)')?.forEach((cb) =>
        cb({ matches: true } as MediaQueryListEvent),
      );
    });
    expect(result.current).toBe(true);
  });

  it('unsubscribes when the hook unmounts', () => {
    matchesByQuery.set('(min-width: 600px)', false);
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 600px)'));
    expect(listeners.get('(min-width: 600px)')?.size).toBe(1);
    unmount();
    expect(listeners.get('(min-width: 600px)')?.size).toBe(0);
  });
});
