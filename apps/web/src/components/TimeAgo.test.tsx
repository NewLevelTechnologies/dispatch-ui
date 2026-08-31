import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeAgo } from './TimeAgo';

const NOW = new Date('2026-06-15T12:00:00Z');

describe('TimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the hybrid text with the exact timestamp in the title', () => {
    const twoHoursAgo = new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString();
    render(<TimeAgo iso={twoHoursAgo} />);
    const el = screen.getByText('2h ago');
    expect(el).toHaveAttribute('title', expect.stringMatching(/Jun 15, 2026, \d+:\d{2}/));
  });

  it('renders an absolute date past the relative cutoff', () => {
    render(<TimeAgo iso="2025-04-14T12:00:00Z" />);
    expect(screen.getByText('Apr 14, 2025')).toBeInTheDocument();
  });

  it('renders nothing for empty/invalid input', () => {
    const { container } = render(<TimeAgo iso={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('passes through className', () => {
    const justNow = NOW.toISOString();
    render(<TimeAgo iso={justNow} className="text-fg-muted" />);
    expect(screen.getByText('just now')).toHaveClass('text-fg-muted');
  });
});
