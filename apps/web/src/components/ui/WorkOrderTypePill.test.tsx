import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkOrderTypePill } from './WorkOrderTypePill';

describe('WorkOrderTypePill', () => {
  it('renders the type name with its accent color applied', () => {
    render(<WorkOrderTypePill type={{ name: 'Maintenance', accentId: 'blue' }} />);
    const el = screen.getByText('Maintenance');
    expect(el).toBeInTheDocument();
    // The accent color is applied inline (oklch from the role palette).
    expect(el.getAttribute('style')).toContain('oklch');
  });

  it('falls back to a name-hash color when accentId is missing', () => {
    render(<WorkOrderTypePill type={{ name: 'Repair' }} />);
    expect(screen.getByText('Repair').getAttribute('style')).toContain('oklch');
  });

  it('renders nothing when there is no type', () => {
    const { container } = render(<WorkOrderTypePill type={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
