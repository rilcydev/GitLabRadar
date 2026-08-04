import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

// Source: index.html:690-747, and the concrete usages at :2234-2241
// (mrs-empty), :2250-2256 (pipelines-empty), :2265-2272 (releases-empty),
// :2281-2287 (untag-empty), :2301-2308 (po-empty).
describe('EmptyState', () => {
  it('renders the message verbatim, matching the brief\'s minimal example', () => {
    render(<EmptyState message="No open merge requests found for your account" />);
    expect(screen.getByText('No open merge requests found for your account')).toBeInTheDocument();
  });

  it('renders no title when none is given', () => {
    const { container } = render(<EmptyState message="All watched projects are up to date with their latest tags" />);
    // index.html:2285's title ("All Tagged") is a distinct string from the
    // desc; omitting `title` must not fabricate one.
    expect(container.textContent).toBe('All watched projects are up to date with their latest tags');
  });

  it('renders the title above the message when given (index.html:2238-2239)', () => {
    render(<EmptyState title="No Merge Requests" message="Add your GitLab account to track your merge requests in real-time" />);
    expect(screen.getByText('No Merge Requests')).toBeInTheDocument();
    expect(screen.getByText('Add your GitLab account to track your merge requests in real-time')).toBeInTheDocument();
  });

  it('renders an icon when given', () => {
    render(<EmptyState message="No Releases" icon={<svg data-testid="empty-icon" />} />);
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });

  it('renders an action (e.g. the "Configure GitLab" button, index.html:2240)', () => {
    render(<EmptyState message="..." action={<button>Configure GitLab</button>} />);
    expect(screen.getByRole('button', { name: 'Configure GitLab' })).toBeInTheDocument();
  });

  // index.html:2235,2238-2239 -- ported markup keeps its source ids.
  it('applies id/titleId/messageId to the container, title and message (Task 15)', () => {
    const { container } = render(
      <EmptyState
        id="mrs-empty"
        titleId="mrs-empty-title"
        title="No Merge Requests"
        messageId="mrs-empty-desc"
        message="No open merge requests found for your account"
      />
    );
    expect(container.querySelector('#mrs-empty')).not.toBeNull();
    expect(container.querySelector('#mrs-empty-title')).toHaveTextContent('No Merge Requests');
    expect(container.querySelector('#mrs-empty-desc')).toHaveTextContent(
      'No open merge requests found for your account'
    );
  });
});
