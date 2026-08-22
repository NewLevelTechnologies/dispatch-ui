import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an svg with two paths when filled', () => {
    const { container } = render(
      <Sparkline values={[1, 2, 3, 4, 5]} filled />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(2);
  });

  it('renders a single stroke path when not filled', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} />);
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBe(1);
  });

  it('uses the requested dimensions on the svg', () => {
    const { container } = render(
      <Sparkline values={[1, 2, 3]} width={120} height={40} />,
    );
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('width')).toBe('120');
    expect(svg.getAttribute('height')).toBe('40');
    expect(svg.getAttribute('viewBox')).toBe('0 0 120 40');
  });

  it('renders nothing when given fewer than two values', () => {
    const { container } = render(<Sparkline values={[5]} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('handles a flat series (all equal values) without dividing by zero', () => {
    const { container } = render(<Sparkline values={[3, 3, 3, 3]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    const path = container.querySelector('path')!;
    expect(path.getAttribute('d')).toMatch(/^M/);
  });

  it('forwards className to the svg', () => {
    const { container } = render(
      <Sparkline values={[1, 2]} className="custom-spark" />,
    );
    expect(container.querySelector('svg.custom-spark')).toBeInTheDocument();
  });
});
