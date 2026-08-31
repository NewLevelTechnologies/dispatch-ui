import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ContactFields, { type ContactData } from './ContactFields';

const baseContact: ContactData = {
  name: 'Bob Smith',
  phone: '5551234567',
  email: 'bob@example.com',
};

describe('ContactFields', () => {
  it('renders all contact inputs prefilled from the value', () => {
    render(<ContactFields contact={baseContact} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Bob Smith')).toBeInTheDocument();
    expect(screen.getByDisplayValue('bob@example.com')).toBeInTheDocument();
  });

  it('fires onChange when the name is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContactFields contact={baseContact} onChange={onChange} />);
    await user.type(screen.getByDisplayValue('Bob Smith'), 'X');
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseContact,
      name: 'Bob SmithX',
    });
  });

  it('fires onChange with digits-only phone via PatternFormat', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ContactFields contact={{ ...baseContact, phone: '' }} onChange={onChange} />,
    );
    // PatternFormat renders the phone input with the format mask
    const phoneInput = screen.getByRole('textbox', {
      name: /phone/i,
    }) as HTMLInputElement;
    await user.type(phoneInput, '5551234567');
    // onValueChange feeds back the digits-only value
    const lastCall = onChange.mock.calls.at(-1)?.[0];
    expect(lastCall.phone).toMatch(/^\d+$/);
  });

  it('fires onChange when the email is edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContactFields contact={baseContact} onChange={onChange} />);
    await user.type(screen.getByDisplayValue('bob@example.com'), 'X');
    expect(onChange).toHaveBeenLastCalledWith({
      ...baseContact,
      email: 'bob@example.comX',
    });
  });

  it('prefixes input names when namePrefix is provided', () => {
    const { container } = render(
      <ContactFields
        contact={baseContact}
        onChange={vi.fn()}
        namePrefix="billing_"
      />,
    );
    expect(container.querySelector('input[name="billing_name"]')).toBeInTheDocument();
    expect(container.querySelector('input[name="billing_phone"]')).toBeInTheDocument();
    expect(container.querySelector('input[name="billing_email"]')).toBeInTheDocument();
  });

  it('does not mark inputs required when required=false', () => {
    const { container } = render(
      <ContactFields
        contact={baseContact}
        onChange={vi.fn()}
        required={false}
      />,
    );
    const name = container.querySelector('input[name="name"]') as HTMLInputElement;
    expect(name.required).toBe(false);
  });
});
