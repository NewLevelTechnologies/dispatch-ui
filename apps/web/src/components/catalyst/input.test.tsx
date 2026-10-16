import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('pads a plain input on both sides', () => {
    render(<Input aria-label="Amount" />);
    expect(screen.getByLabelText('Amount').className).toContain('px-[calc(--spacing(3.5)-1px)]');
  });

  it('sets a leading affix on the value’s line and starts the value just past it', () => {
    render(<Input aria-label="Amount" leading="$" />);
    const input = screen.getByLabelText('Amount');
    const affix = screen.getByText('$');
    expect(affix).toHaveAttribute('aria-hidden');
    expect(affix.className).toContain('inset-y-0');
    expect(affix.className).toContain('sm:text-sm/6');
    expect(input.className).toContain('pl-7');
    expect(input.className).not.toContain('px-[');
  });

  it('sizes the affix with a dense input', () => {
    render(<Input aria-label="Amount" size="xs" leading="$" />);
    expect(screen.getByText('$').className).toContain('text-[12.5px]/[18px]');
    expect(screen.getByLabelText('Amount').className).toContain('pl-5');
  });
});
