import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToggleGroup, ToggleGroupOption } from './ToggleGroup';

describe('ToggleGroup', () => {
  /* eslint-disable i18next/no-literal-string -- test fixtures */
  it('renders one option per child with the selected one marked checked', () => {
    render(
      <ToggleGroup value="light" onChange={vi.fn()} aria-label="Theme">
        <ToggleGroupOption value="light">Light</ToggleGroupOption>
        <ToggleGroupOption value="dark">Dark</ToggleGroupOption>
      </ToggleGroup>,
    );

    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(2);

    const light = screen.getByRole('radio', { name: /light/i });
    const dark = screen.getByRole('radio', { name: /dark/i });
    expect(light).toHaveAttribute('aria-checked', 'true');
    expect(dark).toHaveAttribute('aria-checked', 'false');
  });

  it('fires onChange with the clicked option value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToggleGroup value="light" onChange={onChange} aria-label="Theme">
        <ToggleGroupOption value="light">Light</ToggleGroupOption>
        <ToggleGroupOption value="dark">Dark</ToggleGroupOption>
      </ToggleGroup>,
    );

    await user.click(screen.getByRole('radio', { name: /dark/i }));
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('forwards the group aria-label and option aria-label/title', () => {
    render(
      <ToggleGroup value="a" onChange={vi.fn()} aria-label="Mode" className="extra">
        <ToggleGroupOption value="a" aria-label="Option A" title="A title">
          A
        </ToggleGroupOption>
        <ToggleGroupOption value="b" className="opt-b">
          B
        </ToggleGroupOption>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radiogroup', { name: 'Mode' })).toBeInTheDocument();

    const a = screen.getByRole('radio', { name: 'Option A' });
    expect(a).toHaveAttribute('title', 'A title');
    expect(screen.getByRole('radio', { name: /^B$/ })).toHaveClass('opt-b');
  });
  /* eslint-enable i18next/no-literal-string */
});
