import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WizardHeader } from './WizardHeader';

describe('WizardHeader', () => {
  it('renders the title and a pip per step with the correct aria-label', () => {
    render(<WizardHeader title="Set up 2FA" step={2} totalSteps={3} />);
    expect(screen.getByText('Set up 2FA')).toBeInTheDocument();
    expect(screen.getByLabelText('Step 2 of 3')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    render(
      <WizardHeader
        title="Wizard"
        step={1}
        totalSteps={2}
        icon={<svg data-testid="wizard-icon" />}
      />,
    );
    expect(screen.getByTestId('wizard-icon')).toBeInTheDocument();
  });

  it('highlights only the active and completed steps', () => {
    const { container } = render(<WizardHeader title="W" step={2} totalSteps={3} />);
    const pips = container.querySelectorAll('[style*="width"]');
    // First (done) + second (active) get the accent class; third does not.
    expect(pips[0].className).toContain('bg-accent-500');
    expect(pips[1].className).toContain('bg-accent-500');
    expect(pips[2].className).toContain('bg-bg-active');
  });

  it('forwards className', () => {
    const { container } = render(
      <WizardHeader title="W" step={1} totalSteps={2} className="extra" />,
    );
    expect(container.firstChild).toHaveClass('extra');
  });
});
