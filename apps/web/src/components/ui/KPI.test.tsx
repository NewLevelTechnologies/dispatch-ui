import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KPI } from './KPI';

describe('KPI', () => {
  it('renders label and value', () => {
    render(<KPI label="Open invoices" value="$48,920" />);
    expect(screen.getByText('Open invoices')).toBeInTheDocument();
    expect(screen.getByText('$48,920')).toBeInTheDocument();
  });

  it('renders an upward delta with the ▲ glyph by default', () => {
    render(<KPI label="Revenue" value="$100" delta="3 overdue" />);
    const delta = screen.getByText(/3 overdue/);
    expect(delta).toBeInTheDocument();
    expect(delta.textContent).toContain('▲');
  });

  it('renders a downward delta with the ▼ glyph when deltaDir=down', () => {
    render(<KPI label="Revenue" value="$100" delta="2 lost" deltaDir="down" />);
    const delta = screen.getByText(/2 lost/);
    expect(delta.textContent).toContain('▼');
  });

  it('renders meta text when provided', () => {
    render(<KPI label="Customers" value={42} meta="this week" />);
    expect(screen.getByText('this week')).toBeInTheDocument();
  });

  it('omits the delta block when no delta is supplied', () => {
    const { container } = render(<KPI label="Customers" value={42} />);
    expect(container.querySelector('.kpi-delta')).toBeNull();
  });

  it('applies the bar CSS variable inline', () => {
    const { container } = render(
      <KPI label="X" value="1" bar="var(--accent-500)" />,
    );
    const root = container.querySelector('.kpi') as HTMLElement;
    expect(root.style.getPropertyValue('--bar')).toBe('var(--accent-500)');
  });
});
