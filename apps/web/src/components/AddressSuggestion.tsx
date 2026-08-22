/* eslint-disable i18next/no-literal-string -- short operational UI strings kept literal to match the dense address forms (UserFormPage / AddLocationPage convention). */
import { Callout } from './ui/Callout';
import { Button } from './catalyst/button';
import type { AddressVerify } from '../hooks/useAddressVerify';
import type { AddressVerifyRequest } from '../api/setup';

// Renders the address-verification feedback for one address group:
//   • a "Did you mean: {standardized line}?" prompt when the geocoder returns a
//     usable suggestion that differs from what was typed, and
//   • a soft, non-blocking "couldn't locate" note when it can't be geocoded.
// Quiet otherwise. The geocoded coordinates are captured by the hook regardless
// (sent on save); this component only handles the visible nudge.

export interface AcceptedAddress {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

function normalize(s: string): string {
  return s.toUpperCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

function typedLine(a: AddressVerifyRequest): string {
  return [a.streetAddress, a.city, a.state, a.zipCode].map((s) => s?.trim()).filter(Boolean).join(', ');
}

// Census single line is "STREET, CITY, STATE, ZIP". Split from the right so a
// street containing commas still maps cleanly; bail if it isn't structured.
function parseSuggested(line: string): AcceptedAddress | null {
  const parts = line.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;
  const zipCode = parts[parts.length - 1];
  const state = parts[parts.length - 2];
  const city = parts[parts.length - 3];
  const streetAddress = parts.slice(0, parts.length - 3).join(', ');
  if (!streetAddress || !city || !state || !zipCode) return null;
  return { streetAddress, city, state, zipCode };
}

export function AddressSuggestion({
  verify,
  typed,
  onAccept,
}: {
  verify: AddressVerify;
  typed: AddressVerifyRequest;
  onAccept: (addr: AcceptedAddress) => void;
}) {
  const { result, dismissed } = verify;

  // Only speak about the address we actually verified — editing invalidates it.
  if (!result || !verify.matches(typed)) return null;

  // Couldn't geocode: soft, non-blocking. Save proceeds; the tech is the check.
  if (!result.located) {
    return (
      <Callout kind="warning" className="mt-2">
        Couldn’t locate this address on the map — it’ll save as entered.
      </Callout>
    );
  }

  if (dismissed || !result.suggestedSingleLine) return null;
  const parsed = parseSuggested(result.suggestedSingleLine);
  // Nothing to offer when it already matches, or we can't restructure it.
  if (!parsed || normalize(result.suggestedSingleLine) === normalize(typedLine(typed))) return null;

  return (
    <Callout
      kind="info"
      className="mt-2"
      title="Did you mean:"
      action={
        <div className="flex items-center gap-1.5">
          <Button plain size="xs" type="button" onClick={() => verify.dismiss()}>
            Keep mine
          </Button>
          <Button
            color="accent"
            size="xs"
            type="button"
            onClick={() => {
              verify.accept({ ...typed, ...parsed });
              onAccept(parsed);
            }}
          >
            Use this
          </Button>
        </div>
      }
    >
      <span className="font-medium text-fg-strong">{result.suggestedSingleLine}</span>
    </Callout>
  );
}
