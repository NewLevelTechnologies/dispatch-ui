import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from './Timeline';

describe('Timeline', () => {
  it('renders one item per entry', () => {
    const { container } = render(
      <Timeline
        items={[
          { dot: 'info', time: '11:24a', text: 'Created job' },
          { dot: 'success', time: '12:42p', text: 'On site' },
          { time: '—', text: 'Pending' },
        ]}
      />,
    );
    expect(container.querySelectorAll('.timeline-item').length).toBe(3);
    expect(screen.getByText('Created job')).toBeInTheDocument();
    expect(screen.getByText('On site')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('applies the dot tone class when provided', () => {
    const { container } = render(
      <Timeline items={[{ dot: 'danger', time: 't', text: 'x' }]} />,
    );
    expect(container.querySelector('.timeline-dot.danger')).toBeInTheDocument();
  });

  it('falls back to an empty tone class when dot is omitted', () => {
    const { container } = render(
      <Timeline items={[{ time: 't', text: 'x' }]} />,
    );
    const dot = container.querySelector('.timeline-dot')!;
    expect(dot.classList.contains('timeline-dot')).toBe(true);
    expect(dot.classList.length).toBe(1);
  });

  it('applies maxHeight inline when provided', () => {
    const { container } = render(
      <Timeline
        maxHeight={240}
        items={[{ time: 't', text: 'x' }]}
      />,
    );
    const root = container.querySelector('.timeline') as HTMLElement;
    expect(root.style.maxHeight).toBe('240px');
    expect(root.style.overflow).toBe('auto');
  });

  it('forwards className', () => {
    const { container } = render(
      <Timeline className="extra" items={[{ time: 't', text: 'x' }]} />,
    );
    expect(container.querySelector('.timeline.extra')).toBeInTheDocument();
  });
});
