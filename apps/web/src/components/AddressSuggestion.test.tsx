import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import { AddressSuggestion } from './AddressSuggestion';
import type { AddressVerify } from '../hooks/useAddressVerify';
import type { AddressVerifyRequest, AddressVerifyResponse } from '../api/setup';

const TYPED: AddressVerifyRequest = {
  streetAddress: '123 main street',
  streetAddressLine2: null,
  city: 'Chicago',
  state: 'IL',
  zipCode: '60601',
};

function makeVerify(overrides: Partial<AddressVerify> & { result: AddressVerifyResponse | null }): AddressVerify {
  return {
    run: vi.fn(),
    verifying: false,
    dismissed: false,
    dismiss: vi.fn(),
    accept: vi.fn(),
    matches: () => true,
    coordsFor: () => null,
    reset: vi.fn(),
    ...overrides,
  };
}

const LOCATED: AddressVerifyResponse = {
  located: true,
  suggestedSingleLine: '123 MAIN ST, CHICAGO, IL, 60601',
  latitude: 41.8781,
  longitude: -87.6298,
  timeZone: 'America/Chicago',
};

describe('AddressSuggestion', () => {
  it('renders nothing when the result is for a different (edited) address', () => {
    const verify = makeVerify({ result: LOCATED, matches: () => false });
    const { container } = renderWithProviders(
      <AddressSuggestion verify={verify} typed={TYPED} onAccept={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the standardized suggestion and parses it into fields on "Use this"', async () => {
    const onAccept = vi.fn();
    const verify = makeVerify({ result: LOCATED });
    const user = userEvent.setup();
    renderWithProviders(<AddressSuggestion verify={verify} typed={TYPED} onAccept={onAccept} />);

    expect(screen.getByText('123 MAIN ST, CHICAGO, IL, 60601')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /use this/i }));
    expect(onAccept).toHaveBeenCalledWith({
      streetAddress: '123 MAIN ST',
      city: 'CHICAGO',
      state: 'IL',
      zipCode: '60601',
    });
    expect(verify.accept).toHaveBeenCalled();
  });

  it('"Keep mine" dismisses without accepting', async () => {
    const onAccept = vi.fn();
    const verify = makeVerify({ result: LOCATED });
    const user = userEvent.setup();
    renderWithProviders(<AddressSuggestion verify={verify} typed={TYPED} onAccept={onAccept} />);

    await user.click(screen.getByRole('button', { name: /keep mine/i }));
    expect(verify.dismiss).toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('shows a soft, non-blocking note when the address cannot be located', () => {
    const verify = makeVerify({
      result: { located: false, suggestedSingleLine: null, latitude: null, longitude: null, timeZone: null },
    });
    renderWithProviders(<AddressSuggestion verify={verify} typed={TYPED} onAccept={vi.fn()} />);
    expect(screen.getByText(/couldn’t locate this address/i)).toBeInTheDocument();
  });

  it('stays quiet when the suggestion matches what was typed', () => {
    const onAccept = vi.fn();
    const verify = makeVerify({
      result: { ...LOCATED, suggestedSingleLine: '123 MAIN STREET, CHICAGO, IL, 60601' },
    });
    const { container } = renderWithProviders(
      <AddressSuggestion verify={verify} typed={TYPED} onAccept={onAccept} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
