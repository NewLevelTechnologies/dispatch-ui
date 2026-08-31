import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../test/utils';
import EditableField from './EditableField';

describe('EditableField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('text variant (default)', () => {
    it('renders the value as a clickable button in display mode', () => {
      renderWithProviders(<EditableField value="Replace filter" onSave={vi.fn()} />);
      const trigger = screen.getByRole('button', { name: /replace filter/i });
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent('Replace filter');
    });

    it('shows an empty-state placeholder when value is empty', () => {
      renderWithProviders(
        <EditableField value="" onSave={vi.fn()} emptyDisplay="No description" />
      );
      expect(screen.getByText('No description')).toBeInTheDocument();
    });

    it('swaps to an input when clicked, focused and pre-filled with the current value', async () => {
      const user = userEvent.setup();
      renderWithProviders(<EditableField value="hello" onSave={vi.fn()} />);
      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('textbox');
      expect(input).toHaveValue('hello');
      expect(input).toHaveFocus();
    });

    it('saves on Enter, exits edit mode', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(<EditableField value="hello" onSave={onSave} />);
      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'world');
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('world');
      });
      // Back to display mode
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('reverts on Esc without calling onSave', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<EditableField value="hello" onSave={onSave} />);
      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'world');
      await user.keyboard('{Escape}');
      expect(onSave).not.toHaveBeenCalled();
      // Display mode shows the original value
      expect(screen.getByRole('button')).toHaveTextContent('hello');
    });

    it('saves on blur', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(
        <>
          <EditableField value="hello" onSave={onSave} />
          {/* eslint-disable-next-line i18next/no-literal-string -- test-only sibling element */}
          <button type="button">elsewhere</button>
        </>
      );
      await user.click(screen.getAllByRole('button')[0]);
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'world');
      // Click outside (the second button) → blur
      await user.click(screen.getByRole('button', { name: 'elsewhere' }));
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('world');
      });
    });

    it('does not call onSave when the value is unchanged', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<EditableField value="hello" onSave={onSave} />);
      await user.click(screen.getByRole('button'));
      await user.keyboard('{Enter}');
      expect(onSave).not.toHaveBeenCalled();
    });

    it('stays in edit mode when onSave throws so the user can retry', async () => {
      const onSave = vi.fn().mockRejectedValue(new Error('boom'));
      const user = userEvent.setup();
      renderWithProviders(<EditableField value="hello" onSave={onSave} />);
      await user.click(screen.getByRole('button'));
      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, 'world');
      await user.keyboard('{Enter}');
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
      // Still in edit mode
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('does nothing on click when disabled', async () => {
      const onSave = vi.fn();
      const user = userEvent.setup();
      renderWithProviders(<EditableField value="hello" onSave={onSave} disabled />);
      await user.click(screen.getByRole('button'));
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('textarea variant', () => {
    it('renders a multi-line input on edit; saves on Cmd+Enter', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(
        <EditableField as="textarea" value="line one" onSave={onSave} />
      );
      await user.click(screen.getByRole('button'));
      const textarea = screen.getByRole('textbox');
      // Plain Enter should NOT save in textarea variant — it inserts a newline
      await user.type(textarea, '{Enter}line two');
      expect(onSave).not.toHaveBeenCalled();
      // Cmd+Enter saves
      await user.keyboard('{Meta>}{Enter}{/Meta}');
      await waitFor(() => {
        expect(onSave).toHaveBeenCalled();
      });
    });
  });

  describe('select variant', () => {
    const options = [
      { value: 'low', label: 'Low' },
      { value: 'normal', label: 'Normal' },
      { value: 'high', label: 'High' },
    ];

    it('renders the option label in display mode (not the raw value)', () => {
      renderWithProviders(
        <EditableField as="select" value="normal" options={options} onSave={vi.fn()} />
      );
      expect(screen.getByRole('button')).toHaveTextContent('Normal');
    });

    it('saves immediately on change without waiting for blur', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(
        <EditableField as="select" value="normal" options={options} onSave={onSave} />
      );
      await user.click(screen.getByRole('button'));
      const select = screen.getByRole('combobox');
      await user.selectOptions(select, 'high');
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith('high');
      });
    });
  });
});
