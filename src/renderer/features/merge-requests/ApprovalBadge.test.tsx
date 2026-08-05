import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ApprovalBadge } from './ApprovalBadge';

const u = (id: number, name: string) => ({ id, username: name.toLowerCase(), name, avatar_url: '' });

describe('ApprovalBadge', () => {
  it('renders nothing when there are no approvers', () => {
    const { container } = render(<ApprovalBadge approvedBy={[]} approvalsRequired={2} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows "N / M" when a required count is set', () => {
    render(<ApprovalBadge approvedBy={[u(1, 'Alice'), u(2, 'Bob')]} approvalsRequired={3} />);
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('shows just the count when there is no required count', () => {
    render(<ApprovalBadge approvedBy={[u(1, 'Alice')]} approvalsRequired={0} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders nothing when approvedBy is missing at runtime (defensive)', () => {
    const { container } = render(
      <ApprovalBadge approvedBy={undefined as unknown as ReturnType<typeof u>[]} approvalsRequired={0} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
