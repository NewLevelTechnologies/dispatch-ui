/* eslint-disable i18next/no-literal-string */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pill, Tag } from './Pill';

describe('Pill', () => {
  it('renders children with the default neutral tone class', () => {
    render(<Pill>Scheduled</Pill>);
    const el = screen.getByText('Scheduled');
    expect(el.className).toContain('pill');
    expect(el.className).toContain('neutral');
  });

  it('applies the requested tone class', () => {
    render(<Pill tone="danger">Urgent</Pill>);
    expect(screen.getByText('Urgent').className).toContain('danger');
  });

  it('shows the dot when requested', () => {
    const { container } = render(<Pill dot>x</Pill>);
    expect(container.querySelector('.dot')).toBeInTheDocument();
  });

  it('does not render the dot by default', () => {
    const { container } = render(<Pill>x</Pill>);
    expect(container.querySelector('.dot')).toBeNull();
  });

  it('forwards arbitrary span props', () => {
    render(<Pill data-testid="pill" title="hint">x</Pill>);
    const el = screen.getByTestId('pill');
    expect(el).toHaveAttribute('title', 'hint');
  });
});

describe('Tag', () => {
  it('renders with the tag class', () => {
    const { container } = render(<Tag>PRT-1</Tag>);
    const el = container.querySelector('.tag');
    expect(el).toBeInTheDocument();
    expect(el?.textContent).toBe('PRT-1');
  });

  it('forwards a className', () => {
    const { container } = render(<Tag className="extra">x</Tag>);
    expect(container.querySelector('.tag.extra')).toBeInTheDocument();
  });
});
