import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpInput, type OtpInputHandle } from './OtpInput';

describe('OtpInput', () => {
  it('renders one input per slot and reflects the value', () => {
    render(<OtpInput length={4} value="12" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    expect(inputs.length).toBe(4);
    expect(inputs[0].value).toBe('1');
    expect(inputs[1].value).toBe('2');
    expect(inputs[2].value).toBe('');
    expect(inputs[3].value).toBe('');
  });

  it('emits onChange and advances focus when a digit is typed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput length={4} value="" onChange={onChange} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.keyboard('7');
    expect(onChange).toHaveBeenLastCalledWith('7');
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('strips non-numeric characters', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<OtpInput length={4} value="" onChange={onChange} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.keyboard('a');
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('distributes a pasted code across boxes and calls onComplete', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onComplete = vi.fn();
    render(
      <OtpInput length={6} value="" onChange={onChange} onComplete={onComplete} />,
    );
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    await user.click(inputs[0]);
    await user.paste('123456');
    expect(onChange).toHaveBeenLastCalledWith('123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('focuses the previous box when Backspace is pressed on an empty box', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={4} value="12" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    inputs[2].focus();
    await user.keyboard('{Backspace}');
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('navigates with arrow keys', async () => {
    const user = userEvent.setup();
    render(<OtpInput length={4} value="1234" onChange={vi.fn()} />);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    inputs[1].focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(inputs[2]);
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(inputs[1]);
  });

  it('exposes a focus() handle via the forwarded ref', () => {
    const ref = createRef<OtpInputHandle>();
    render(<OtpInput length={4} value="" onChange={vi.fn()} ref={ref} />);
    ref.current?.focus();
    const inputs = screen.getAllByRole('textbox');
    expect(document.activeElement).toBe(inputs[0]);
  });

  it('autoFocus moves focus to the first box on mount', () => {
    render(<OtpInput length={4} value="" onChange={vi.fn()} autoFocus />);
    const inputs = screen.getAllByRole('textbox');
    expect(document.activeElement).toBe(inputs[0]);
  });
});
