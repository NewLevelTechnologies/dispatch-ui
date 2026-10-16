import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils';
import { ActivityRow } from './ActivityRow';
import type { ActivityEvent } from '../api/setup';

const event = (overrides: Partial<ActivityEvent>): ActivityEvent => ({
  id: 'evt-1',
  kind: 'NOTE_ADDED',
  category: 'NOTE',
  timestamp: '2026-04-27T14:00:00Z',
  actor: { userId: 'u-1', userName: 'Jamie Smith' },
  data: {},
  ...overrides,
});

const renderRows = (events: ActivityEvent[]) =>
  renderWithProviders(
    <ul>
      {events.map((e) => (
        <ActivityRow key={e.id} event={e} />
      ))}
    </ul>,
  );

describe('ActivityRow', () => {
  it('renders one row per event with the actor byline', () => {
    renderRows([
        event({
          id: 'e1',
          kind: 'WORK_ITEM_STATUS_CHANGED',
          category: 'STATUS',
          data: {
            workItemId: 'wi-1',
            workItemDescription: 'Replace filter',
            fromStatusName: 'Pending',
            toStatusName: 'In Progress',
          },
        }),
      ]);
    // Action is the primary summary; description renders as a muted secondary line.
    expect(
        screen.getByText(/Status changed from Pending to In Progress/i)
      ).toBeInTheDocument();
    expect(screen.getByText('Replace filter')).toBeInTheDocument();
    expect(screen.getByText(/by Jamie Smith/)).toBeInTheDocument();
  });

  it('renders the work item description as a secondary context line for WI events', () => {
    const longDescription =
      'no ac, svc fee $99 call Rich otw 425-200-2999, for repairs need approval from Steven';
    renderRows([
        event({
          id: 'e-wi-status',
          kind: 'WORK_ITEM_STATUS_CHANGED',
          category: 'STATUS',
          data: {
            workItemId: 'wi-1',
            workItemDescription: longDescription,
            fromStatusName: 'Pending',
            toStatusName: 'In Progress',
          },
        }),
      ]);
    expect(
        screen.getByText('Status changed from Pending to In Progress')
      ).toBeInTheDocument();
    // Long description still appears in the DOM (single-line clamp via CSS).
    // title attribute exposes the full text on hover for CSRs who need it.
    const contextNode = screen.getByText(longDescription);
    expect(contextNode).toHaveAttribute('title', longDescription);
  });

  it('does not render a context line for non-work-item events', () => {
    const { container } = renderRows([
        event({
          id: 'e-wo-cancelled',
          kind: 'WORK_ORDER_CANCELLED',
          category: 'STATUS',
          data: {},
        }),
      ]);
    expect(screen.getByText('Work Order cancelled')).toBeInTheDocument();
    // Only summary + byline → exactly two <p> per row (Catalyst Text wraps in <p>)
    const paragraphs = container.querySelectorAll('li p');
    expect(paragraphs).toHaveLength(2);
  });

  it('renders the note body for NOTE_ADDED events', () => {
    renderRows([
        event({
          id: 'e1',
          kind: 'NOTE_ADDED',
          category: 'NOTE',
          data: { noteId: 'n-1', bodyExcerpt: 'Customer called back at 3pm' },
        }),
      ]);
    expect(screen.getByText('Customer called back at 3pm')).toBeInTheDocument();
  });

  it('renders "System" for events with no actor', () => {
    renderRows([event({ actor: null })]);
    expect(screen.getByText(/by System/)).toBeInTheDocument();
  });

  it('treats "Unknown" actor.userName as no actor and renders System', () => {
    renderRows([
        event({
          actor: { userId: 'u-1', userName: 'Unknown' },
        }),
      ]);
    expect(screen.getByText(/by System/)).toBeInTheDocument();
    expect(screen.queryByText(/by Unknown/)).not.toBeInTheDocument();
  });

  it('treats empty/whitespace actor.userName as no actor', () => {
    renderRows([
        event({
          id: 'e-blank',
          actor: { userId: 'u-1', userName: '   ' },
        }),
      ]);
    expect(screen.getByText(/by System/)).toBeInTheDocument();
  });

  it('resolves {{entity}} placeholders in templates via the glossary', () => {
    renderRows([
        event({
          id: 'e-cancelled',
          kind: 'WORK_ORDER_CANCELLED',
          category: 'STATUS',
          data: {},
        }),
        event({
          id: 'e-dispatch',
          kind: 'DISPATCH_CANCELLED',
          category: 'DISPATCH',
          data: {},
        }),
      ]);
    expect(screen.getByText('Work Order cancelled')).toBeInTheDocument();
    expect(screen.getByText('Dispatch cancelled')).toBeInTheDocument();
  });

  it('renders dispatch events using the backend assignedUserName field', () => {
    renderRows([
        event({
          id: 'e-assigned',
          kind: 'DISPATCH_ASSIGNED',
          category: 'DISPATCH',
          data: { dispatchId: 'd-1', assignedUserName: 'Rich Garcia' },
        }),
        event({
          id: 'e-arrived',
          kind: 'DISPATCH_ARRIVED',
          category: 'DISPATCH',
          data: { dispatchId: 'd-1', assignedUserName: 'Rich Garcia' },
        }),
        event({
          id: 'e-checked-out',
          kind: 'DISPATCH_CHECKED_OUT',
          category: 'DISPATCH',
          data: { dispatchId: 'd-1', assignedUserName: 'Rich Garcia' },
        }),
        event({
          id: 'e-cancelled',
          kind: 'DISPATCH_CANCELLED',
          category: 'DISPATCH',
          data: { dispatchId: 'd-1', assignedUserName: 'Rich Garcia' },
        }),
      ]);
    expect(screen.getByText('Dispatch assigned to Rich Garcia')).toBeInTheDocument();
    expect(screen.getByText('Rich Garcia arrived')).toBeInTheDocument();
    expect(screen.getByText('Rich Garcia checked out')).toBeInTheDocument();
    expect(screen.getByText('Dispatch cancelled')).toBeInTheDocument();
    expect(screen.queryByText(/unrecognized activity/i)).not.toBeInTheDocument();
  });

  it('falls back to the unknown-activity label when the backend sends incomplete data', () => {
    renderRows([
        event({
          id: 'e-broken',
          kind: 'WORK_ORDER_UPDATED',
          category: 'STATUS',
          // Missing field/fromValue/toValue — template can't interpolate
          data: {},
        }),
      ]);
    expect(screen.getByText(/unrecognized activity/i)).toBeInTheDocument();
    // Raw template tokens must never leak to users
    expect(screen.queryByText(/\{\{/)).not.toBeInTheDocument();
  });

});
