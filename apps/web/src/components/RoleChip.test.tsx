import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleChip } from './RoleChip';
import { roleAccent, roleColor } from '../utils/roleColor';

describe('RoleChip', () => {
  it('renders the role name', () => {
    render(<RoleChip name="Dispatcher" />);
    expect(screen.getByText('Dispatcher')).toBeInTheDocument();
  });

  it('exposes the resolved accent via the --chip-accent CSS variable', () => {
    // The chip drives both background and foreground from a single CSS
    // custom property so theme-aware overrides (dark mode contrast lift)
    // can read one value. Assert the variable rather than `color:` since
    // the actual `color:` is computed via color-mix in CSS.
    render(<RoleChip name="Admin" />);
    const chip = screen.getByText('Admin');
    expect(chip).toHaveStyle({ '--chip-accent': roleColor('Admin') });
  });

  it('prefers persisted accentId over the name hash', () => {
    render(<RoleChip name="Renamed" accentId="teal" />);
    const chip = screen.getByText('Renamed');
    expect(chip).toHaveStyle({ '--chip-accent': roleAccent('teal') });
  });

  it('falls back to the name hash when accentId is omitted', () => {
    render(<RoleChip name="Legacy" />);
    const chip = screen.getByText('Legacy');
    expect(chip).toHaveStyle({ '--chip-accent': roleColor('Legacy') });
  });
});
