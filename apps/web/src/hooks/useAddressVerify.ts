import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { customerApi, type AddressVerifyRequest, type AddressVerifyResponse } from '../api/setup';

// Drives the "suggest, don't force" address flow (see backend handoff). Call
// `run(addr)` on blur of a completed address; the result keys to that exact
// address, so editing any field auto-invalidates the suggestion + coordinates
// (no manual reset needed). `coordsFor(addr)` returns the geocoded lat/long to
// send on save — only while the form's address still matches what was verified.

export interface AddressCoords {
  latitude: number;
  longitude: number;
}

export interface AddressVerify {
  /** Verify a completed address (no-op if incomplete or already verified). */
  run: (addr: AddressVerifyRequest) => void;
  result: AddressVerifyResponse | null;
  verifying: boolean;
  dismissed: boolean;
  /** "Keep mine" — hide the suggestion but keep the captured coordinates. */
  dismiss: () => void;
  /** Re-key to the accepted address so its coordinates survive the field swap. */
  accept: (addr: AddressVerifyRequest) => void;
  /** True when `addr` is the address the current result was produced for. */
  matches: (addr: AddressVerifyRequest) => boolean;
  /** Coordinates to send on save, or null when stale / unlocated. */
  coordsFor: (addr: AddressVerifyRequest) => AddressCoords | null;
  reset: () => void;
}

function keyOf(a: AddressVerifyRequest): string {
  return [a.streetAddress, a.streetAddressLine2 ?? '', a.city, a.state, a.zipCode]
    .map((s) => (s ?? '').trim().toLowerCase())
    .join('|');
}

function isComplete(a: AddressVerifyRequest): boolean {
  return !!(a.streetAddress?.trim() && a.city?.trim() && a.state?.trim() && a.zipCode?.trim());
}

export function useAddressVerify(): AddressVerify {
  const [result, setResult] = useState<AddressVerifyResponse | null>(null);
  const [verifiedKey, setVerifiedKey] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const mutation = useMutation({
    mutationFn: (req: AddressVerifyRequest) => customerApi.verifyAddress(req),
    onSuccess: (res) => setResult(res),
  });

  const run = (addr: AddressVerifyRequest) => {
    if (!isComplete(addr)) return;
    const key = keyOf(addr);
    if (key === verifiedKey) return; // already verified this exact address
    setVerifiedKey(key);
    setDismissed(false);
    setResult(null);
    mutation.mutate(addr);
  };

  const matches = (addr: AddressVerifyRequest) => verifiedKey !== null && keyOf(addr) === verifiedKey;

  const coordsFor = (addr: AddressVerifyRequest): AddressCoords | null =>
    result && result.located && result.latitude != null && result.longitude != null && matches(addr)
      ? { latitude: result.latitude, longitude: result.longitude }
      : null;

  const accept = (addr: AddressVerifyRequest) => {
    setVerifiedKey(keyOf(addr));
    setDismissed(true);
  };

  const reset = () => {
    setResult(null);
    setVerifiedKey(null);
    setDismissed(false);
  };

  return {
    run,
    result,
    verifying: mutation.isPending,
    dismissed,
    dismiss: () => setDismissed(true),
    accept,
    matches,
    coordsFor,
    reset,
  };
}
