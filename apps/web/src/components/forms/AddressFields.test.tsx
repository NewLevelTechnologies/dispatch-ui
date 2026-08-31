import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddressFields, { type AddressData } from './AddressFields';

const baseAddress: AddressData = {
  streetAddress: '123 Main St',
  streetAddressLine2: '',
  city: 'Tampa',
  state: 'FL',
  zipCode: '33602',
};

describe('AddressFields', () => {
  it('renders all address inputs prefilled from the value', () => {
    render(<AddressFields address={baseAddress} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('123 Main St')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Tampa')).toBeInTheDocument();
    expect(screen.getByDisplayValue('33602')).toBeInTheDocument();
  });

  it('fires onChange when the street address is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AddressFields address={baseAddress} onChange={onChange} />);
    const street = screen.getByDisplayValue('123 Main St');
    await user.type(street, '!');
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseAddress,
      streetAddress: '123 Main St!',
    });
  });

  it('fires onChange when the apt/line 2 input is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AddressFields address={baseAddress} onChange={onChange} />);
    const apt = screen.getByPlaceholderText('Apt');
    await user.type(apt, '2');
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseAddress,
      streetAddressLine2: '2',
    });
  });

  it('fires onChange when city is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AddressFields address={baseAddress} onChange={onChange} />);
    await user.type(screen.getByDisplayValue('Tampa'), 'X');
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseAddress,
      city: 'TampaX',
    });
  });

  it('fires onChange when state is changed via the select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AddressFields
        address={{ ...baseAddress, state: '' }}
        onChange={onChange}
      />,
    );
    const stateSelect = screen.getByRole('combobox');
    await user.selectOptions(stateSelect, 'CA');
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseAddress,
      state: 'CA',
    });
  });

  it('fires onChange when zip is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<AddressFields address={baseAddress} onChange={onChange} />);
    await user.type(screen.getByDisplayValue('33602'), '0');
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseAddress,
      zipCode: '336020',
    });
  });

  it('prefixes input names when namePrefix is provided', () => {
    const { container } = render(
      <AddressFields
        address={baseAddress}
        onChange={vi.fn()}
        namePrefix="billing_"
      />,
    );
    expect(container.querySelector('input[name="billing_streetAddress"]'))
      .toBeInTheDocument();
    expect(container.querySelector('select[name="billing_state"]'))
      .toBeInTheDocument();
  });

  it('omits the required asterisk and required attribute when required=false', () => {
    const { container } = render(
      <AddressFields
        address={baseAddress}
        onChange={vi.fn()}
        required={false}
      />,
    );
    const street = container.querySelector(
      'input[name="streetAddress"]',
    ) as HTMLInputElement;
    expect(street.required).toBe(false);
  });
});
